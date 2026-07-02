from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import UTC, datetime
from typing import Any, Literal

import asyncpg

from lib.focus_work_types import CHOICE_KIND, FLASH_CARD_KIND, INPUT_KIND

PrimaryFilter = Literal["all", "unstarted", "mistake", "last_wrong", "due_review"]
SortOrder = Literal["sequential", "due", "mistake_first", "random"]


class QuestionAdapter(ABC):
    """Per-question-type adapter for unified question selection."""

    @abstractmethod
    async def count_available(
        self,
        conn: asyncpg.Connection,
        *,
        user_id: int,
        bank_id: str,
        primary_filter: PrimaryFilter,
        use_fsrs: bool,
    ) -> int:
        ...

    @abstractmethod
    async def select_questions(
        self,
        conn: asyncpg.Connection,
        *,
        user_id: int,
        bank_id: str,
        primary_filter: PrimaryFilter,
        sort_order: SortOrder,
        use_fsrs: bool,
        limit: int,
    ) -> list[dict[str, Any]]:
        ...


class ChoiceQuestionAdapter(QuestionAdapter):
    async def count_available(
        self,
        conn: asyncpg.Connection,
        *,
        user_id: int,
        bank_id: str,
        primary_filter: PrimaryFilter,
        use_fsrs: bool,
    ) -> int:
        _, params = self._build_filter_clause(user_id, bank_id, primary_filter, use_fsrs, count=True)
        row = await conn.fetchrow(
            f"""
            SELECT COUNT(*)::int AS cnt
            FROM choice_questions q
            JOIN choice_articles a
                ON a.id = q.article_pk
            LEFT JOIN choice_user_question_cards c
                ON c.question_pk = q.id AND c.user_id = $1
            WHERE a.set_id = $2::uuid
              AND ({' OR '.join(params['conditions']) if params['conditions'] else 'TRUE'})
            """,
            *params["args"],
        )
        return row["cnt"] if row else 0

    async def select_questions(
        self,
        conn: asyncpg.Connection,
        *,
        user_id: int,
        bank_id: str,
        primary_filter: PrimaryFilter,
        sort_order: SortOrder,
        use_fsrs: bool,
        limit: int,
    ) -> list[dict[str, Any]]:
        order_clause, params = self._build_filter_clause(user_id, bank_id, primary_filter, use_fsrs, limit=limit)
        order_sql = self._sort_sql(sort_order, params)
        rows = await conn.fetch(
            f"""
            SELECT q.id AS question_pk, q.question_id, q.stem, q.options_json, q.answer,
                   q.explanation, COALESCE(c.wrong_count, 0) AS wrong_count,
                   COALESCE(c.right_count, 0) AS right_count,
                   c.last_review_at, c.last_answer_correct, c.due_at,
                   c.fsrs_card_json
            FROM choice_questions q
            JOIN choice_articles a
                ON a.id = q.article_pk
            LEFT JOIN choice_user_question_cards c
                ON c.question_pk = q.id AND c.user_id = $1
            WHERE a.set_id = $2::uuid
              AND ({' OR '.join(params['conditions']) if params['conditions'] else 'TRUE'})
            {order_sql}
            LIMIT ${params['idx']}
            """,
            *params["args"],
            limit,
        )
        return [dict(r) for r in rows]

    def _build_filter_clause(
        self,
        user_id: int,
        bank_id: str,
        primary_filter: PrimaryFilter,
        use_fsrs: bool,
        count: bool = False,
        limit: int = 0,
    ) -> tuple[str, dict[str, Any]]:
        args: list[Any] = [user_id, bank_id]
        idx = 3
        conditions: list[str] = []
        now = datetime.now(UTC)

        if primary_filter == "unstarted":
            conditions.append("c.question_pk IS NULL")
        elif primary_filter == "mistake":
            conditions.append("COALESCE(c.wrong_count, 0) > 0")
        elif primary_filter == "last_wrong":
            conditions.append("c.last_answer_correct = FALSE")
        elif primary_filter == "due_review":
            conditions.append("c.due_at IS NOT NULL AND c.due_at <= $3::timestamptz")
            args.append(now)
            idx = 4

        return "", {"args": args, "conditions": conditions, "idx": idx}

    def _sort_sql(self, sort_order: SortOrder, params: dict[str, Any]) -> str:
        if sort_order == "sequential":
            return "ORDER BY q.id ASC"
        elif sort_order == "due":
            return "ORDER BY c.due_at ASC NULLS LAST"
        elif sort_order == "mistake_first":
            return "ORDER BY COALESCE(c.wrong_count, 0) DESC, c.last_review_at ASC NULLS FIRST"
        elif sort_order == "random":
            return "ORDER BY RANDOM()"
        return "ORDER BY q.id ASC"


class VocabQuestionAdapter(QuestionAdapter):
    async def count_available(
        self,
        conn: asyncpg.Connection,
        *,
        user_id: int,
        bank_id: str,
        primary_filter: PrimaryFilter,
        use_fsrs: bool,
    ) -> int:
        _, params = self._build_filter_clause(user_id, bank_id, primary_filter, use_fsrs, count=True)
        row = await conn.fetchrow(
            f"""
            SELECT COUNT(*)::int AS cnt
            FROM vocab_words w
            LEFT JOIN vocab_user_word_progress p
                ON p.word_id = w.id AND p.user_id = $1
            WHERE w.deck_id = $2::uuid
              AND ({' OR '.join(params['conditions']) if params['conditions'] else 'TRUE'})
            """,
            *params["args"],
        )
        return row["cnt"] if row else 0

    async def select_questions(
        self,
        conn: asyncpg.Connection,
        *,
        user_id: int,
        bank_id: str,
        primary_filter: PrimaryFilter,
        sort_order: SortOrder,
        use_fsrs: bool,
        limit: int,
    ) -> list[dict[str, Any]]:
        _, params = self._build_filter_clause(user_id, bank_id, primary_filter, use_fsrs, limit=limit)
        order_sql = self._sort_sql(sort_order, params)
        rows = await conn.fetch(
            f"""
            SELECT w.id AS question_pk, w.word AS question_id, w.word AS stem,
                   COALESCE(vt.translation, '') AS answer, w.us_pronunciation,
                   COALESCE(p.wrong_count, 0) AS wrong_count,
                   COALESCE(p.correct_count, 0) AS right_count,
                   p.last_review_at, p.last_result, p.next_review_at,
                   p.fsrs_card_json
            FROM vocab_words w
            LEFT JOIN LATERAL (
                SELECT translation FROM vocab_word_translations
                WHERE word_id = w.id
                ORDER BY sort_order ASC
                LIMIT 1
            ) vt ON TRUE
            LEFT JOIN vocab_user_word_progress p
                ON p.word_id = w.id AND p.user_id = $1
            WHERE w.deck_id = $2::uuid
              AND ({' OR '.join(params['conditions']) if params['conditions'] else 'TRUE'})
            {order_sql}
            LIMIT ${params['idx']}
            """,
            *params["args"],
            limit,
        )
        return [dict(r) for r in rows]

    def _build_filter_clause(
        self,
        user_id: int,
        bank_id: str,
        primary_filter: PrimaryFilter,
        use_fsrs: bool,
        count: bool = False,
        limit: int = 0,
    ) -> tuple[str, dict[str, Any]]:
        args: list[Any] = [user_id, bank_id]
        idx = 3
        conditions: list[str] = []
        now = datetime.now(UTC)

        if primary_filter == "unstarted":
            conditions.append("p.word_id IS NULL")
        elif primary_filter == "mistake":
            conditions.append("COALESCE(p.wrong_count, 0) > 0")
        elif primary_filter == "last_wrong":
            conditions.append("p.last_result IN ('again', 'hard')")
        elif primary_filter == "due_review":
            conditions.append("p.next_review_at IS NOT NULL AND p.next_review_at <= $3::timestamptz")
            args.append(now)
            idx = 4

        return "", {"args": args, "conditions": conditions, "idx": idx}

    def _sort_sql(self, sort_order: SortOrder, params: dict[str, Any]) -> str:
        if sort_order == "sequential":
            return "ORDER BY w.sort_order ASC, w.id ASC"
        elif sort_order == "due":
            return "ORDER BY p.next_review_at ASC NULLS LAST"
        elif sort_order == "mistake_first":
            return "ORDER BY COALESCE(p.wrong_count, 0) DESC, p.last_review_at ASC NULLS FIRST"
        elif sort_order == "random":
            return "ORDER BY RANDOM()"
        return "ORDER BY w.id ASC"


class InputQuestionAdapter(QuestionAdapter):
    async def count_available(
        self,
        conn: asyncpg.Connection,
        *,
        user_id: int,
        bank_id: str,
        primary_filter: PrimaryFilter,
        use_fsrs: bool,
    ) -> int:
        _, params = self._build_filter_clause(user_id, bank_id, primary_filter, use_fsrs, count=True)
        row = await conn.fetchrow(
            f"""
            SELECT COUNT(*)::int AS cnt
            FROM input_questions q
            LEFT JOIN input_user_answers a
                ON a.question_id = q.id AND a.user_id = $1
            WHERE q.set_id = $2::uuid
              AND ({' OR '.join(params['conditions']) if params['conditions'] else 'TRUE'})
            """,
            *params["args"],
        )
        return row["cnt"] if row else 0

    async def select_questions(
        self,
        conn: asyncpg.Connection,
        *,
        user_id: int,
        bank_id: str,
        primary_filter: PrimaryFilter,
        sort_order: SortOrder,
        use_fsrs: bool,
        limit: int,
    ) -> list[dict[str, Any]]:
        _, params = self._build_filter_clause(user_id, bank_id, primary_filter, use_fsrs, limit=limit)
        order_sql = self._sort_sql(sort_order, params)
        rows = await conn.fetch(
            f"""
            SELECT q.id AS question_pk, q.question_id, q.stem, q.mode AS input_mode,
                   q.accepted_answers, q.reference_answer,
                   a.is_correct AS last_answer_correct, a.score,
                   COUNT(a.id) OVER (PARTITION BY q.id) AS attempt_count
            FROM input_questions q
            LEFT JOIN input_user_answers a
                ON a.question_id = q.id AND a.user_id = $1
            WHERE q.set_id = $2::uuid
              AND ({' OR '.join(params['conditions']) if params['conditions'] else 'TRUE'})
            {order_sql}
            LIMIT ${params['idx']}
            """,
            *params["args"],
            limit,
        )
        return [dict(r) for r in rows]

    def _build_filter_clause(
        self,
        user_id: int,
        bank_id: str,
        primary_filter: PrimaryFilter,
        use_fsrs: bool,
        count: bool = False,
        limit: int = 0,
    ) -> tuple[str, dict[str, Any]]:
        args: list[Any] = [user_id, bank_id]
        idx = 3
        conditions: list[str] = []

        if primary_filter == "unstarted":
            conditions.append("a.id IS NULL")
        elif primary_filter == "mistake":
            conditions.append("a.is_correct = FALSE")
        elif primary_filter == "last_wrong":
            conditions.append("a.is_correct = FALSE")
        elif primary_filter == "due_review":
            pass

        return "", {"args": args, "conditions": conditions, "idx": idx}

    def _sort_sql(self, sort_order: SortOrder, params: dict[str, Any]) -> str:
        if sort_order == "sequential":
            return "ORDER BY q.id ASC"
        elif sort_order == "random":
            return "ORDER BY RANDOM()"
        return "ORDER BY q.id ASC"


_ADAPTER_MAP: dict[str, type[QuestionAdapter]] = {
    CHOICE_KIND: ChoiceQuestionAdapter,
    FLASH_CARD_KIND: VocabQuestionAdapter,
    INPUT_KIND: InputQuestionAdapter,
}


def get_adapter(kind: str) -> QuestionAdapter:
    cls = _ADAPTER_MAP.get(kind)
    if cls is None:
        raise ValueError(f"Unknown question kind '{kind}'. Valid: {sorted(_ADAPTER_MAP)}")
    return cls()


async def count_questions(
    conn: asyncpg.Connection,
    *,
    kind: str,
    user_id: int,
    bank_id: str,
    primary_filter: PrimaryFilter = "all",
    use_fsrs: bool = False,
) -> int:
    adapter = get_adapter(kind)
    return await adapter.count_available(
        conn, user_id=user_id, bank_id=bank_id, primary_filter=primary_filter, use_fsrs=use_fsrs,
    )


async def build_question_list(
    conn: asyncpg.Connection,
    *,
    kind: str,
    user_id: int,
    bank_id: str,
    target_count: int,
    primary_filter: PrimaryFilter = "all",
    sort_order: SortOrder = "sequential",
    use_fsrs: bool = False,
) -> tuple[list[dict[str, Any]], str | None]:
    """Build a fixed question list with strict mode rules.

    Returns (question_list, warning_message).
    - matched >= target: return matched items, no warning
    - 0 < matched < target: return all matched, warning
    - matched == 0: return empty, error message
    """
    adapter = get_adapter(kind)
    questions = await adapter.select_questions(
        conn,
        user_id=user_id,
        bank_id=bank_id,
        primary_filter=primary_filter,
        sort_order=sort_order,
        use_fsrs=use_fsrs,
        limit=target_count,
    )

    matched = len(questions)
    warning: str | None = None

    if matched == 0:
        warning = "当前筛选项下没有可用的题目，请调整配置后重试"
    elif matched < target_count:
        warning = f"当前筛选项下仅有 {matched} 题，不足 {target_count} 题，将按实际题量开始"

    return questions, warning
