from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, Literal

import asyncpg

from lib.focus_work_types import CHOICE_KIND, FLASH_CARD_KIND, INPUT_KIND

if TYPE_CHECKING:
    # 仅用于类型注解(避免与 routes.deliberate 的循环导入)
    from routes.deliberate.schemas import FsrsConfig

SchedulingMode = Literal["manual", "fsrs"]

PrimaryFilter = Literal["all", "unstarted", "mistake", "last_wrong", "due_review"]
SortOrder = Literal["sequential", "due", "mistake_first", "random"]


class QuestionAdapter(ABC):
    """Per-question-type adapter for unified question selection.

    scheduling_mode 决定调度策略:
    - "manual": 沿用 primary_filter + sort_order + backflow_rule 的手动筛选逻辑
    - "fsrs":   忽略 primary_filter / sort_order,改为 (due_at IS NULL OR due_at <= now)
                + due_at ASC NULLS LAST + 当日新词配额(target_count)
    """

    @abstractmethod
    async def count_available(
        self,
        conn: asyncpg.Connection,
        *,
        user_id: int,
        bank_id: str,
        primary_filter: PrimaryFilter,
        scheduling_mode: SchedulingMode = "manual",
        fsrs_config: FsrsConfig | None = None,
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
        scheduling_mode: SchedulingMode = "manual",
        fsrs_config: FsrsConfig | None = None,
        offset: int = 0,
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
        scheduling_mode: SchedulingMode = "manual",
        fsrs_config: FsrsConfig | None = None,
    ) -> int:
        if scheduling_mode == "fsrs":
            return await self._count_fsrs(conn, user_id=user_id, bank_id=bank_id)
        _, params = self._build_filter_clause(user_id, bank_id, primary_filter)
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
        scheduling_mode: SchedulingMode = "manual",
        fsrs_config: FsrsConfig | None = None,
        offset: int = 0,
        limit: int,
    ) -> list[dict[str, Any]]:
        if scheduling_mode == "fsrs":
            return await self._select_fsrs(conn, user_id=user_id, bank_id=bank_id, limit=limit)
        _, params = self._build_filter_clause(user_id, bank_id, primary_filter)
        order_sql = self._sort_sql(sort_order, params)
        rows = await conn.fetch(
            f"""
            SELECT q.id AS question_pk, q.question_id, q.stem, q.options_json, q.answer,
                   q.explanation, COALESCE(c.wrong_count, 0) AS wrong_count,
                   COALESCE(c.right_count, 0) AS right_count,
                   c.last_review_at, c.last_answer_correct, c.due_at,
                   c.fsrs_card_json,
                   a.id AS article_pk, a.title AS article_title, a.sort_order AS article_sort_order,
                   (
                       SELECT json_agg(p.text ORDER BY p.paragraph_no)
                       FROM choice_paragraphs p
                       WHERE p.article_pk = a.id
                   ) AS article_paragraphs
            FROM choice_questions q
            JOIN choice_articles a
                ON a.id = q.article_pk
            LEFT JOIN choice_user_question_cards c
                ON c.question_pk = q.id AND c.user_id = $1
            WHERE a.set_id = $2::uuid
              AND ({' OR '.join(params['conditions']) if params['conditions'] else 'TRUE'})
            {order_sql}
            OFFSET ${params['idx']} LIMIT ${params['idx'] + 1}
            """,
            *params["args"],
            max(0, offset),
            limit,
        )
        return [dict(r) for r in rows]

    def _build_filter_clause(
        self,
        user_id: int,
        bank_id: str,
        primary_filter: PrimaryFilter,
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

    async def _count_fsrs(self, conn: asyncpg.Connection, *, user_id: int, bank_id: str) -> int:
        now = datetime.now(UTC)
        row = await conn.fetchrow(
            """
            SELECT COUNT(*)::int AS cnt
            FROM choice_questions q
            JOIN choice_articles a ON a.id = q.article_pk
            LEFT JOIN choice_user_question_cards c
                ON c.question_pk = q.id AND c.user_id = $1
            WHERE a.set_id = $2::uuid
              AND (
                c.question_pk IS NULL
                OR (c.due_at IS NOT NULL AND c.due_at <= $3::timestamptz)
              )
            """,
            user_id,
            bank_id,
            now,
        )
        return row["cnt"] if row else 0

    async def _select_fsrs(
        self,
        conn: asyncpg.Connection,
        *,
        user_id: int,
        bank_id: str,
        limit: int,
    ) -> list[dict[str, Any]]:
        now = datetime.now(UTC)
        learned_today = await self._count_learned_today(conn, user_id=user_id, bank_id=bank_id)
        remaining_quota = max(0, limit - learned_today)

        review_rows = await conn.fetch(
            """
            SELECT q.id AS question_pk, q.question_id, q.stem, q.options_json, q.answer,
                   q.explanation, COALESCE(c.wrong_count, 0) AS wrong_count,
                   COALESCE(c.right_count, 0) AS right_count,
                   c.last_review_at, c.last_answer_correct, c.due_at,
                   c.fsrs_card_json,
                   a.id AS article_pk, a.title AS article_title, a.sort_order AS article_sort_order,
                   (
                       SELECT json_agg(p.text ORDER BY p.paragraph_no)
                       FROM choice_paragraphs p
                       WHERE p.article_pk = a.id
                   ) AS article_paragraphs
            FROM choice_questions q
            JOIN choice_articles a ON a.id = q.article_pk
            LEFT JOIN choice_user_question_cards c
                ON c.question_pk = q.id AND c.user_id = $1
            WHERE a.set_id = $2::uuid
              AND c.due_at IS NOT NULL
              AND c.due_at <= $3::timestamptz
            ORDER BY c.due_at ASC
            LIMIT $4
            """,
            user_id,
            bank_id,
            now,
            limit,
        )
        review_list = [dict(r) for r in review_rows]

        if len(review_list) >= limit or remaining_quota == 0:
            return review_list[:limit]

        new_limit = min(remaining_quota, limit - len(review_list))
        new_rows = await conn.fetch(
            """
            SELECT q.id AS question_pk, q.question_id, q.stem, q.options_json, q.answer,
                   q.explanation, COALESCE(c.wrong_count, 0) AS wrong_count,
                   COALESCE(c.right_count, 0) AS right_count,
                   c.last_review_at, c.last_answer_correct, c.due_at,
                   c.fsrs_card_json,
                   a.id AS article_pk, a.title AS article_title, a.sort_order AS article_sort_order,
                   (
                       SELECT json_agg(p.text ORDER BY p.paragraph_no)
                       FROM choice_paragraphs p
                       WHERE p.article_pk = a.id
                   ) AS article_paragraphs
            FROM choice_questions q
            JOIN choice_articles a ON a.id = q.article_pk
            LEFT JOIN choice_user_question_cards c
                ON c.question_pk = q.id AND c.user_id = $1
            WHERE a.set_id = $2::uuid
              AND c.question_pk IS NULL
            ORDER BY a.sort_order ASC, q.sort_order ASC, q.id ASC
            LIMIT $3
            """,
            user_id,
            bank_id,
            new_limit,
        )
        return review_list + [dict(r) for r in new_rows]

    async def _count_learned_today(self, conn: asyncpg.Connection, *, user_id: int, bank_id: str) -> int:
        row = await conn.fetchrow(
            """
            SELECT COUNT(*)::int AS cnt
            FROM choice_user_question_cards c
            JOIN choice_questions q ON q.id = c.question_pk
            JOIN choice_articles a ON a.id = q.article_pk
            WHERE c.user_id = $1
              AND a.set_id = $2::uuid
              AND c.fsrs_card_json IS NOT NULL
              AND c.last_review_at::date = CURRENT_DATE
            """,
            user_id,
            bank_id,
        )
        return row["cnt"] if row else 0


class VocabQuestionAdapter(QuestionAdapter):
    async def count_available(
        self,
        conn: asyncpg.Connection,
        *,
        user_id: int,
        bank_id: str,
        primary_filter: PrimaryFilter,
        scheduling_mode: SchedulingMode = "manual",
        fsrs_config: FsrsConfig | None = None,
    ) -> int:
        if scheduling_mode == "fsrs":
            return await self._count_fsrs(conn, user_id=user_id, bank_id=bank_id)
        _, params = self._build_filter_clause(user_id, bank_id, primary_filter)
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
        scheduling_mode: SchedulingMode = "manual",
        fsrs_config: FsrsConfig | None = None,
        offset: int = 0,
        limit: int,
    ) -> list[dict[str, Any]]:
        if scheduling_mode == "fsrs":
            return await self._select_fsrs(conn, user_id=user_id, bank_id=bank_id, limit=limit)
        _, params = self._build_filter_clause(user_id, bank_id, primary_filter)
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
            OFFSET ${params['idx']} LIMIT ${params['idx'] + 1}
            """,
            *params["args"],
            max(0, offset),
            limit,
        )
        return [dict(r) for r in rows]

    def _build_filter_clause(
        self,
        user_id: int,
        bank_id: str,
        primary_filter: PrimaryFilter,
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

    async def _count_fsrs(self, conn: asyncpg.Connection, *, user_id: int, bank_id: str) -> int:
        now = datetime.now(UTC)
        row = await conn.fetchrow(
            """
            SELECT COUNT(*)::int AS cnt
            FROM vocab_words w
            LEFT JOIN vocab_user_word_progress p
                ON p.word_id = w.id AND p.user_id = $1
            WHERE w.deck_id = $2::uuid
              AND (
                p.word_id IS NULL
                OR (p.next_review_at IS NOT NULL AND p.next_review_at <= $3::timestamptz)
              )
            """,
            user_id,
            bank_id,
            now,
        )
        return row["cnt"] if row else 0

    async def _select_fsrs(
        self,
        conn: asyncpg.Connection,
        *,
        user_id: int,
        bank_id: str,
        limit: int,
    ) -> list[dict[str, Any]]:
        now = datetime.now(UTC)
        learned_today = await self._count_learned_today(conn, user_id=user_id, bank_id=bank_id)
        remaining_quota = max(0, limit - learned_today)

        review_rows = await conn.fetch(
            """
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
              AND p.next_review_at IS NOT NULL
              AND p.next_review_at <= $3::timestamptz
            ORDER BY p.next_review_at ASC
            LIMIT $4
            """,
            user_id,
            bank_id,
            now,
            limit,
        )
        review_list = [dict(r) for r in review_rows]

        if len(review_list) >= limit or remaining_quota == 0:
            return review_list[:limit]

        new_limit = min(remaining_quota, limit - len(review_list))
        new_rows = await conn.fetch(
            """
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
              AND p.word_id IS NULL
            ORDER BY w.sort_order ASC, w.id ASC
            LIMIT $3
            """,
            user_id,
            bank_id,
            new_limit,
        )
        return review_list + [dict(r) for r in new_rows]

    async def _count_learned_today(self, conn: asyncpg.Connection, *, user_id: int, bank_id: str) -> int:
        row = await conn.fetchrow(
            """
            SELECT COUNT(*)::int AS cnt
            FROM vocab_user_word_progress p
            JOIN vocab_words w ON w.id = p.word_id
            WHERE p.user_id = $1
              AND w.deck_id = $2::uuid
              AND p.fsrs_card_json IS NOT NULL
              AND p.last_review_at::date = CURRENT_DATE
            """,
            user_id,
            bank_id,
        )
        return row["cnt"] if row else 0


class InputQuestionAdapter(QuestionAdapter):
    """Input 题型没有 due_at / fsrs_card_json 字段,FSRS 模式回退到 manual 逻辑。"""

    async def count_available(
        self,
        conn: asyncpg.Connection,
        *,
        user_id: int,
        bank_id: str,
        primary_filter: PrimaryFilter,
        scheduling_mode: SchedulingMode = "manual",
        fsrs_config: FsrsConfig | None = None,
    ) -> int:
        # scheduling_mode=="fsrs" 时回退到 manual 逻辑(input 表无 fsrs 字段)
        _, params = self._build_filter_clause(user_id, bank_id, primary_filter)
        row = await conn.fetchrow(
            f"""
            SELECT COUNT(*)::int AS cnt
            FROM input_questions q
            JOIN input_articles art ON q.article_pk = art.id
            LEFT JOIN input_user_answers a
                ON a.question_id = q.id::text AND a.user_id = $1
            WHERE art.set_id = $2::uuid
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
        scheduling_mode: SchedulingMode = "manual",
        fsrs_config: FsrsConfig | None = None,
        offset: int = 0,
        limit: int,
    ) -> list[dict[str, Any]]:
        # scheduling_mode=="fsrs" 时回退到 manual 逻辑(input 表无 fsrs 字段)
        _, params = self._build_filter_clause(user_id, bank_id, primary_filter)
        order_sql = self._sort_sql(sort_order, params)
        rows = await conn.fetch(
            f"""
            SELECT q.id AS question_pk, q.question_id, q.stem, q.mode AS input_mode,
                   q.accepted_answers, q.reference_answer,
                   q.reference_answer AS answer,
                   COUNT(a.id) OVER (PARTITION BY q.id) AS attempt_count,
                   art.id AS article_pk, art.title AS article_title, art.sort_order AS article_sort_order,
                   (
                       SELECT json_agg(p.text ORDER BY p.paragraph_no)
                       FROM input_paragraphs p
                       WHERE p.article_pk = art.id
                   ) AS article_paragraphs
            FROM input_questions q
            JOIN input_articles art ON q.article_pk = art.id
            LEFT JOIN input_user_answers a
                ON a.question_id = q.id::text AND a.user_id = $1
            WHERE art.set_id = $2::uuid
              AND ({' OR '.join(params['conditions']) if params['conditions'] else 'TRUE'})
            {order_sql}
            OFFSET ${params['idx']} LIMIT ${params['idx'] + 1}
            """,
            *params["args"],
            max(0, offset),
            limit,
        )
        return [dict(r) for r in rows]

    def _build_filter_clause(
        self,
        user_id: int,
        bank_id: str,
        primary_filter: PrimaryFilter,
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
    scheduling_mode: SchedulingMode = "manual",
    fsrs_config: FsrsConfig | None = None,
) -> int:
    adapter = get_adapter(kind)
    return await adapter.count_available(
        conn,
        user_id=user_id,
        bank_id=bank_id,
        primary_filter=primary_filter,
        scheduling_mode=scheduling_mode,
        fsrs_config=fsrs_config,
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
    scheduling_mode: SchedulingMode = "manual",
    fsrs_config: FsrsConfig | None = None,
    rotation_offset: int = 0,
) -> tuple[list[dict[str, Any]], str | None]:
    """Build a fixed question list with strict mode rules.

    Returns (question_list, warning_message).
    - matched >= target: return matched items, no warning
    - 0 < matched < target: return all matched, warning
    - matched == 0: return empty, error message
    """
    adapter = get_adapter(kind)
    offset = 0
    available_count = 0
    if rotation_offset > 0:
        available_count = await adapter.count_available(
            conn,
            user_id=user_id,
            bank_id=bank_id,
            primary_filter=primary_filter,
            scheduling_mode=scheduling_mode,
            fsrs_config=fsrs_config,
        )
        if available_count:
            offset = rotation_offset % available_count
    questions = await adapter.select_questions(
        conn,
        user_id=user_id,
        bank_id=bank_id,
        primary_filter=primary_filter,
        sort_order=sort_order,
        scheduling_mode=scheduling_mode,
        fsrs_config=fsrs_config,
        offset=offset,
        limit=target_count,
    )

    # A cycle may begin near the tail of a bank. Fill the remaining slots from
    # the start so each configured round keeps its intended size when possible.
    if rotation_offset > 0 and available_count >= target_count and len(questions) < target_count:
        questions.extend(
            await adapter.select_questions(
                conn,
                user_id=user_id,
                bank_id=bank_id,
                primary_filter=primary_filter,
                sort_order=sort_order,
                scheduling_mode=scheduling_mode,
                fsrs_config=fsrs_config,
                offset=0,
                limit=target_count - len(questions),
            )
        )

    matched = len(questions)
    warning: str | None = None

    if matched == 0:
        warning = "当前筛选项下没有可用的题目，请调整配置后重试"
    elif matched < target_count:
        warning = f"当前筛选项下仅有 {matched} 题，不足 {target_count} 题，将按实际题量开始"

    return questions, warning
