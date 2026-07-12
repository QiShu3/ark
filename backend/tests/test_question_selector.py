"""Tests for the unified question selector (backend/lib/question_selector.py)."""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import pytest


class _Record(dict):
    """dict subclass that mimics asyncpg Record: supports [] access, .get(), .items(), and dict()."""
    def __getattr__(self, key):
        if key in self:
            return self[key]
        raise AttributeError(key)


def _make_record(data: dict) -> _Record:
    return _Record(data)


class TestGetAdapter:
    def test_known_kinds(self):
        from lib.question_selector import ChoiceQuestionAdapter, InputQuestionAdapter, VocabQuestionAdapter, get_adapter

        assert isinstance(get_adapter("choice"), ChoiceQuestionAdapter)
        assert isinstance(get_adapter("flash_card"), VocabQuestionAdapter)
        assert isinstance(get_adapter("input"), InputQuestionAdapter)

    def test_unknown_kind(self):
        from lib.question_selector import get_adapter

        try:
            get_adapter("unknown")
            assert False, "expected ValueError"
        except ValueError:
            pass


@pytest.mark.asyncio
async def test_question_rotation_offsets_by_completed_rounds(monkeypatch):
    from lib import question_selector

    class FakeAdapter:
        async def count_available(self, *args, **kwargs):  # noqa: ANN002, ANN003
            return 20

        async def select_questions(self, *args, offset: int, limit: int, **kwargs):  # noqa: ANN002, ANN003
            return [{"question_pk": f"q-{index}"} for index in range(offset, min(offset + limit, 20))]

    monkeypatch.setattr(question_selector, "get_adapter", lambda _kind: FakeAdapter())

    questions, warning = await question_selector.build_question_list(
        object(),
        kind="choice",
        user_id=1,
        bank_id="bank-1",
        target_count=10,
        rotation_offset=10,
    )

    assert [item["question_pk"] for item in questions] == [f"q-{index}" for index in range(10, 20)]
    assert warning is None


@pytest.mark.asyncio
async def test_question_rotation_wraps_at_bank_end(monkeypatch):
    from lib import question_selector

    class FakeAdapter:
        async def count_available(self, *args, **kwargs):  # noqa: ANN002, ANN003
            return 25

        async def select_questions(self, *args, offset: int, limit: int, **kwargs):  # noqa: ANN002, ANN003
            return [{"question_pk": f"q-{index}"} for index in range(offset, min(offset + limit, 25))]

    monkeypatch.setattr(question_selector, "get_adapter", lambda _kind: FakeAdapter())

    questions, warning = await question_selector.build_question_list(
        object(),
        kind="choice",
        user_id=1,
        bank_id="bank-1",
        target_count=10,
        rotation_offset=20,
    )

    assert [item["question_pk"] for item in questions] == [
        "q-20", "q-21", "q-22", "q-23", "q-24", "q-0", "q-1", "q-2", "q-3", "q-4",
    ]
    assert warning is None


class TestBuildFilterClause:
    def test_choice_all(self):
        from lib.question_selector import ChoiceQuestionAdapter

        adapter = ChoiceQuestionAdapter()
        _, params = adapter._build_filter_clause(1, "bank-1", "all")
        assert params["conditions"] == []
        assert len(params["args"]) == 2
        assert params["args"] == [1, "bank-1"]

    def test_choice_unstarted(self):
        from lib.question_selector import ChoiceQuestionAdapter

        adapter = ChoiceQuestionAdapter()
        _, params = adapter._build_filter_clause(1, "bank-1", "unstarted")
        assert "c.question_pk IS NULL" in params["conditions"][0]

    def test_choice_mistake(self):
        from lib.question_selector import ChoiceQuestionAdapter

        adapter = ChoiceQuestionAdapter()
        _, params = adapter._build_filter_clause(1, "bank-1", "mistake")
        assert "wrong_count" in params["conditions"][0]

    def test_choice_last_wrong(self):
        from lib.question_selector import ChoiceQuestionAdapter

        adapter = ChoiceQuestionAdapter()
        _, params = adapter._build_filter_clause(1, "bank-1", "last_wrong")
        assert "last_answer_correct" in params["conditions"][0]

    def test_choice_due_review(self):
        from lib.question_selector import ChoiceQuestionAdapter

        adapter = ChoiceQuestionAdapter()
        _, params = adapter._build_filter_clause(1, "bank-1", "due_review")
        assert "due_at" in params["conditions"][0]
        assert len(params["args"]) == 3

    def test_vocab_all(self):
        from lib.question_selector import VocabQuestionAdapter

        adapter = VocabQuestionAdapter()
        _, params = adapter._build_filter_clause(1, "bank-1", "all")
        assert params["conditions"] == []

    def test_vocab_unstarted(self):
        from lib.question_selector import VocabQuestionAdapter

        adapter = VocabQuestionAdapter()
        _, params = adapter._build_filter_clause(1, "bank-1", "unstarted")
        assert "p.word_id IS NULL" in params["conditions"][0]

    def test_vocab_due_review(self):
        from lib.question_selector import VocabQuestionAdapter

        adapter = VocabQuestionAdapter()
        _, params = adapter._build_filter_clause(1, "bank-1", "due_review")
        assert "next_review_at" in params["conditions"][0]
        assert len(params["args"]) == 3

    def test_input_all(self):
        from lib.question_selector import InputQuestionAdapter

        adapter = InputQuestionAdapter()
        _, params = adapter._build_filter_clause(1, "bank-1", "all")
        assert params["conditions"] == []

    def test_input_unstarted(self):
        from lib.question_selector import InputQuestionAdapter

        adapter = InputQuestionAdapter()
        _, params = adapter._build_filter_clause(1, "bank-1", "unstarted")
        assert "a.id IS NULL" in params["conditions"][0]

    def test_input_mistake(self):
        from lib.question_selector import InputQuestionAdapter

        adapter = InputQuestionAdapter()
        _, params = adapter._build_filter_clause(1, "bank-1", "mistake")
        assert "a.is_correct = FALSE" in params["conditions"][0]


class TestSortSql:
    def test_choice_sequential(self):
        from lib.question_selector import ChoiceQuestionAdapter

        adapter = ChoiceQuestionAdapter()
        sql = adapter._sort_sql("sequential", {})
        assert "ORDER BY q.id ASC" in sql

    def test_choice_due(self):
        from lib.question_selector import ChoiceQuestionAdapter

        adapter = ChoiceQuestionAdapter()
        sql = adapter._sort_sql("due", {})
        assert "c.due_at ASC" in sql

    def test_choice_mistake_first(self):
        from lib.question_selector import ChoiceQuestionAdapter

        adapter = ChoiceQuestionAdapter()
        sql = adapter._sort_sql("mistake_first", {})
        assert "wrong_count" in sql
        assert "last_review_at" in sql

    def test_choice_random(self):
        from lib.question_selector import ChoiceQuestionAdapter

        adapter = ChoiceQuestionAdapter()
        sql = adapter._sort_sql("random", {})
        assert "RANDOM" in sql

    def test_vocab_sequential(self):
        from lib.question_selector import VocabQuestionAdapter

        adapter = VocabQuestionAdapter()
        sql = adapter._sort_sql("sequential", {})
        assert "w.sort_order" in sql

    def test_vocab_random(self):
        from lib.question_selector import VocabQuestionAdapter

        adapter = VocabQuestionAdapter()
        sql = adapter._sort_sql("random", {})
        assert "RANDOM" in sql

    def test_input_sequential(self):
        from lib.question_selector import InputQuestionAdapter

        adapter = InputQuestionAdapter()
        sql = adapter._sort_sql("sequential", {})
        assert "ORDER BY q.id ASC" in sql


class TestChoiceQuestionAdapter:
    def test_count_available_all(self):
        from lib.question_selector import ChoiceQuestionAdapter

        class MockConn:
            async def fetchrow(self, query: str, *args: object):
                assert "choice_questions" in query
                assert "JOIN choice_articles a" in query
                assert "choice_user_question_cards" in query
                assert "a.set_id = $2::uuid" in query
                assert "q.set_id" not in query
                assert args == (1, "bank-1")
                return _make_record({"cnt": 5})

        adapter = ChoiceQuestionAdapter()
        result = asyncio.run(adapter.count_available(MockConn(), user_id=1, bank_id="bank-1", primary_filter="all"))
        assert result == 5

    def test_count_unstarted(self):
        from lib.question_selector import ChoiceQuestionAdapter

        class MockConn:
            async def fetchrow(self, query: str, *args: object):
                assert "IS NULL" in query
                return _make_record({"cnt": 3})

        adapter = ChoiceQuestionAdapter()
        result = asyncio.run(adapter.count_available(MockConn(), user_id=1, bank_id="bank-1", primary_filter="unstarted"))
        assert result == 3

    def test_select_questions_returns_correct_fields(self):
        from lib.question_selector import ChoiceQuestionAdapter

        now = datetime.now(UTC)

        class MockConn:
            async def fetch(self, query: str, *args: object):
                assert "choice_questions" in query
                assert "JOIN choice_articles a" in query
                assert "choice_user_question_cards" in query
                assert "a.set_id = $2::uuid" in query
                assert "q.set_id" not in query
                return [
                    _make_record({
                        "question_pk": "pk-1",
                        "question_id": "q1",
                        "stem": "What is 2+2?",
                        "options_json": {"A": "3", "B": "4", "C": "5"},
                        "answer": "B",
                        "explanation": "Basic math",
                        "wrong_count": 0,
                        "right_count": 1,
                        "last_review_at": now,
                        "last_answer_correct": True,
                        "due_at": now,
                        "fsrs_card_json": None,
                    }),
                ]

        adapter = ChoiceQuestionAdapter()
        results = asyncio.run(
            adapter.select_questions(MockConn(), user_id=1, bank_id="bank-1", primary_filter="all", sort_order="sequential", limit=1)
        )
        assert len(results) == 1
        assert results[0]["question_id"] == "q1"
        assert results[0]["stem"] == "What is 2+2?"
        assert results[0]["answer"] == "B"
        assert results[0]["right_count"] == 1
        assert results[0]["wrong_count"] == 0
        assert results[0]["options_json"]["B"] == "4"


class TestVocabQuestionAdapter:
    def test_count_available_all(self):
        from lib.question_selector import VocabQuestionAdapter

        class MockConn:
            async def fetchrow(self, query: str, *args: object):
                assert "vocab_words" in query
                assert args == (1, "bank-1")
                return _make_record({"cnt": 10})

        adapter = VocabQuestionAdapter()
        result = asyncio.run(adapter.count_available(MockConn(), user_id=1, bank_id="bank-1", primary_filter="all"))
        assert result == 10

    def test_select_questions_joins_translations(self):
        from lib.question_selector import VocabQuestionAdapter

        class MockConn:
            async def fetch(self, query: str, *args: object):
                assert "vocab_words" in query
                assert "vocab_word_translations" in query
                assert args[:2] == (1, "bank-1")
                return [
                    _make_record({
                        "question_pk": "word-pk-1",
                        "question_id": "hello",
                        "stem": "hello",
                        "answer": "你好",
                        "us_pronunciation": "həˈloʊ",
                        "wrong_count": 0,
                        "right_count": 1,
                        "last_review_at": None,
                        "last_result": None,
                        "next_review_at": None,
                        "fsrs_card_json": None,
                    }),
                ]

        adapter = VocabQuestionAdapter()
        results = asyncio.run(
            adapter.select_questions(MockConn(), user_id=1, bank_id="bank-1", primary_filter="all", sort_order="sequential", limit=5)
        )
        assert len(results) == 1
        assert results[0]["question_id"] == "hello"
        assert results[0]["stem"] == "hello"
        assert results[0]["answer"] == "你好"
        assert results[0]["us_pronunciation"] == "həˈloʊ"

    def test_select_with_mistake_filter(self):
        from lib.question_selector import VocabQuestionAdapter

        class MockConn:
            async def fetch(self, query: str, *args: object):
                assert "wrong_count" in query
                return [
                    _make_record({
                        "question_pk": "pk-1",
                        "question_id": "world",
                        "stem": "world",
                        "answer": "世界",
                        "us_pronunciation": None,
                        "wrong_count": 3,
                        "right_count": 0,
                        "last_review_at": None,
                        "last_result": None,
                        "next_review_at": None,
                        "fsrs_card_json": None,
                    }),
                ]

        adapter = VocabQuestionAdapter()
        results = asyncio.run(
            adapter.select_questions(MockConn(), user_id=1, bank_id="bank-1", primary_filter="mistake", sort_order="mistake_first", limit=5)
        )
        assert len(results) == 1
        assert results[0]["wrong_count"] == 3


class TestInputQuestionAdapter:
    def test_count_available(self):
        from lib.question_selector import InputQuestionAdapter

        class MockConn:
            async def fetchrow(self, query: str, *args: object):
                assert "input_questions" in query
                return _make_record({"cnt": 7})

        adapter = InputQuestionAdapter()
        result = asyncio.run(adapter.count_available(MockConn(), user_id=1, bank_id="bank-1", primary_filter="all"))
        assert result == 7

    def test_select_questions_returns_correct_fields(self):
        from lib.question_selector import InputQuestionAdapter

        class MockConn:
            async def fetch(self, query: str, *args: object):
                assert "input_questions" in query
                assert "input_user_answers" in query
                return [
                    _make_record({
                        "question_pk": "input-pk-1",
                        "question_id": "iq1",
                        "stem": "Translate: hello",
                        "input_mode": "fill",
                        "accepted_answers": ["你好"],
                        "reference_answer": "你好",
                        "last_answer_correct": None,
                        "score": None,
                        "attempt_count": 0,
                    }),
                ]

        adapter = InputQuestionAdapter()
        results = asyncio.run(
            adapter.select_questions(MockConn(), user_id=1, bank_id="bank-1", primary_filter="all", sort_order="sequential", limit=10)
        )
        assert len(results) == 1
        assert results[0]["question_id"] == "iq1"
        assert results[0]["input_mode"] == "fill"
        assert results[0]["accepted_answers"] == ["你好"]


class TestBuildQuestionList:
    def test_build_empty_pool(self):
        from lib.question_selector import build_question_list

        class MockConn:
            async def fetch(self, query: str, *args: object):
                return []

        questions, warning = asyncio.run(build_question_list(MockConn(), kind="choice", user_id=1, bank_id="bank-1", target_count=10))
        assert questions == []
        assert warning is not None
        assert "没有可用的题目" in (warning or "")

    def test_build_partial_pool(self):
        from lib.focus_work_types import CHOICE_KIND
        from lib.question_selector import build_question_list

        class MockConn:
            async def fetch(self, query: str, *args: object):
                return [
                    _make_record({
                        "question_pk": f"pk-{i}",
                        "question_id": f"q{i}",
                        "stem": f"Stem {i}",
                        "options_json": {"A": "A", "B": "B"},
                        "answer": "A",
                        "explanation": "",
                        "wrong_count": 0,
                        "right_count": 0,
                        "last_review_at": None,
                        "last_answer_correct": None,
                        "due_at": None,
                        "fsrs_card_json": None,
                    })
                    for i in range(3)
                ]

        questions, warning = asyncio.run(build_question_list(MockConn(), kind=CHOICE_KIND, user_id=1, bank_id="bank-1", target_count=10))
        assert len(questions) == 3
        assert warning is not None
        assert "不足" in (warning or "")

    def test_build_full_pool(self):
        from lib.focus_work_types import CHOICE_KIND
        from lib.question_selector import build_question_list

        class MockConn:
            async def fetch(self, query: str, *args: object):
                return [
                    _make_record({
                        "question_pk": f"pk-{i}",
                        "question_id": f"q{i}",
                        "stem": f"Stem {i}",
                        "options_json": {"A": "A", "B": "B"},
                        "answer": "A",
                        "explanation": "",
                        "wrong_count": 0,
                        "right_count": 0,
                        "last_review_at": None,
                        "last_answer_correct": None,
                        "due_at": None,
                        "fsrs_card_json": None,
                    })
                    for i in range(10)
                ]

        questions, warning = asyncio.run(build_question_list(MockConn(), kind=CHOICE_KIND, user_id=1, bank_id="bank-1", target_count=10))
        assert len(questions) == 10
        assert warning is None

    def test_build_vocab_pool_with_translations(self):
        from lib.focus_work_types import FLASH_CARD_KIND
        from lib.question_selector import build_question_list

        class MockConn:
            async def fetch(self, query: str, *args: object):
                assert "vocab_word_translations" in query
                return [
                    _make_record({
                        "question_pk": f"wpk-{i}",
                        "question_id": f"word{i}",
                        "stem": f"word{i}",
                        "answer": f"translation-{i}",
                        "us_pronunciation": None,
                        "wrong_count": 0,
                        "right_count": 0,
                        "last_review_at": None,
                        "last_result": None,
                        "next_review_at": None,
                        "fsrs_card_json": None,
                    })
                    for i in range(2)
                ]

        questions, warning = asyncio.run(build_question_list(MockConn(), kind=FLASH_CARD_KIND, user_id=1, bank_id="bank-1", target_count=5))
        assert len(questions) == 2
        assert questions[0]["answer"] == "translation-0"
        assert questions[1]["answer"] == "translation-1"


class TestCountQuestions:
    def test_count_choice(self):
        from lib.question_selector import count_questions

        class MockConn:
            async def fetchrow(self, query: str, *args: object):
                return _make_record({"cnt": 7})

        result = asyncio.run(count_questions(MockConn(), kind="choice", user_id=1, bank_id="bank-1"))
        assert result == 7

    def test_count_vocab(self):
        from lib.question_selector import count_questions

        class MockConn:
            async def fetchrow(self, query: str, *args: object):
                return _make_record({"cnt": 15})

        result = asyncio.run(count_questions(MockConn(), kind="flash_card", user_id=1, bank_id="bank-1"))
        assert result == 15


# ---- FSRS mode tests ----


class _FsrsVocabMockConn:
    """Mock conn for vocab FSRS queries. Routes by SQL content.

    - fetchrow with "last_review_at::date" → _count_learned_today
    - fetchrow with "COUNT" (FSRS count) → _count_fsrs
    - fetch with "next_review_at IS NOT NULL" → due review cards
    - fetch with "word_id IS NULL" → new cards
    """

    def __init__(self, *, learned_today: int, review_cards: list, new_cards: list, fsrs_count: int = 0):
        self._learned_today = learned_today
        self._review_cards = review_cards
        self._new_cards = new_cards
        self._fsrs_count = fsrs_count
        self.fetch_calls: list[str] = []

    async def fetchrow(self, query: str, *args: object):
        if "last_review_at::date" in query:
            return _make_record({"cnt": self._learned_today})
        if "COUNT" in query:
            return _make_record({"cnt": self._fsrs_count})
        return _make_record({"cnt": 0})

    async def fetch(self, query: str, *args: object):
        self.fetch_calls.append(query)
        if "next_review_at IS NOT NULL" in query:
            return [_make_record(r) for r in self._review_cards]
        if "word_id IS NULL" in query:
            return [_make_record(r) for r in self._new_cards]
        return []


class _FsrsChoiceMockConn:
    """Mock conn for choice FSRS queries. Routes by SQL content."""

    def __init__(self, *, learned_today: int, review_cards: list, new_cards: list, fsrs_count: int = 0):
        self._learned_today = learned_today
        self._review_cards = review_cards
        self._new_cards = new_cards
        self._fsrs_count = fsrs_count
        self.fetch_calls: list[str] = []

    async def fetchrow(self, query: str, *args: object):
        if "last_review_at::date" in query:
            return _make_record({"cnt": self._learned_today})
        if "COUNT" in query:
            return _make_record({"cnt": self._fsrs_count})
        return _make_record({"cnt": 0})

    async def fetch(self, query: str, *args: object):
        self.fetch_calls.append(query)
        if "c.due_at IS NOT NULL" in query:
            return [_make_record(r) for r in self._review_cards]
        if "c.question_pk IS NULL" in query:
            return [_make_record(r) for r in self._new_cards]
        return []


def _vocab_card(word_id: str, word: str, translation: str, due_at=None):
    return {
        "question_pk": word_id,
        "question_id": word,
        "stem": word,
        "answer": translation,
        "us_pronunciation": None,
        "wrong_count": 0,
        "right_count": 0,
        "last_review_at": None,
        "last_result": None,
        "next_review_at": due_at,
        "fsrs_card_json": None,
    }


def _choice_card(qid: str, stem: str, due_at=None):
    return {
        "question_pk": qid,
        "question_id": qid,
        "stem": stem,
        "options_json": {"A": "x", "B": "y"},
        "answer": "A",
        "explanation": "",
        "wrong_count": 0,
        "right_count": 0,
        "last_review_at": None,
        "last_answer_correct": None,
        "due_at": due_at,
        "fsrs_card_json": None,
    }


class TestVocabFsrsMode:
    def test_count_fsrs(self):
        from lib.question_selector import VocabQuestionAdapter

        conn = _FsrsVocabMockConn(learned_today=0, review_cards=[], new_cards=[], fsrs_count=8)
        adapter = VocabQuestionAdapter()
        result = asyncio.run(
            adapter.count_available(conn, user_id=1, bank_id="bank-1", primary_filter="all", scheduling_mode="fsrs")
        )
        assert result == 8

    def test_select_returns_due_review_cards(self):
        """FSRS 模式下查到期复习卡。"""
        from lib.question_selector import VocabQuestionAdapter

        now = datetime.now(UTC)
        review_cards = [
            _vocab_card("w1", "apple", "苹果", due_at=now),
            _vocab_card("w2", "banana", "香蕉", due_at=now),
        ]
        conn = _FsrsVocabMockConn(learned_today=0, review_cards=review_cards, new_cards=[])
        adapter = VocabQuestionAdapter()
        results = asyncio.run(
            adapter.select_questions(
                conn, user_id=1, bank_id="bank-1", primary_filter="all", sort_order="sequential",
                scheduling_mode="fsrs", limit=5,
            )
        )
        assert len(results) == 2
        assert results[0]["question_id"] == "apple"
        assert results[1]["question_id"] == "banana"
        # 两次 fetch:review + new
        assert len(conn.fetch_calls) == 2

    def test_select_returns_new_cards_when_no_due(self):
        """FSRS 模式下查新词(无到期卡时)。"""
        from lib.question_selector import VocabQuestionAdapter

        new_cards = [
            _vocab_card("w3", "cat", "猫"),
            _vocab_card("w4", "dog", "狗"),
            _vocab_card("w5", "bird", "鸟"),
        ]
        conn = _FsrsVocabMockConn(learned_today=0, review_cards=[], new_cards=new_cards)
        adapter = VocabQuestionAdapter()
        results = asyncio.run(
            adapter.select_questions(
                conn, user_id=1, bank_id="bank-1", primary_filter="all", sort_order="sequential",
                scheduling_mode="fsrs", limit=5,
            )
        )
        assert len(results) == 3
        assert results[0]["question_id"] == "cat"
        assert results[1]["question_id"] == "dog"
        assert results[2]["question_id"] == "bird"

    def test_select_quota_exhausted_returns_only_review(self):
        """FSRS 模式下当日新词配额用完只返回复习卡。"""
        from lib.question_selector import VocabQuestionAdapter

        now = datetime.now(UTC)
        review_cards = [_vocab_card("w1", "apple", "苹果", due_at=now)]
        # learned_today = 5 = limit, so remaining_quota = 0
        conn = _FsrsVocabMockConn(learned_today=5, review_cards=review_cards, new_cards=[])
        adapter = VocabQuestionAdapter()
        results = asyncio.run(
            adapter.select_questions(
                conn, user_id=1, bank_id="bank-1", primary_filter="all", sort_order="sequential",
                scheduling_mode="fsrs", limit=5,
            )
        )
        assert len(results) == 1
        assert results[0]["question_id"] == "apple"
        # 只查了一次 fetch(review),没有查 new
        assert len(conn.fetch_calls) == 1

    def test_select_merges_review_and_new_with_quota(self):
        """FSRS 模式:复习卡 + 配额内新词合并,新词上限 = remaining_quota。"""
        from lib.question_selector import VocabQuestionAdapter

        now = datetime.now(UTC)
        review_cards = [_vocab_card("w1", "apple", "苹果", due_at=now)]
        # limit=5, learned_today=2 → remaining_quota=3, but only 2 new cards needed (5-1-2=2... actually min(3, 5-1)=4)
        new_cards = [
            _vocab_card("w2", "banana", "香蕉"),
            _vocab_card("w3", "cherry", "樱桃"),
        ]
        conn = _FsrsVocabMockConn(learned_today=2, review_cards=review_cards, new_cards=new_cards)
        adapter = VocabQuestionAdapter()
        results = asyncio.run(
            adapter.select_questions(
                conn, user_id=1, bank_id="bank-1", primary_filter="all", sort_order="sequential",
                scheduling_mode="fsrs", limit=5,
            )
        )
        assert len(results) == 3
        assert results[0]["question_id"] == "apple"  # review first
        assert results[1]["question_id"] == "banana"  # new cards after
        assert results[2]["question_id"] == "cherry"

    def test_build_question_list_fsrs_mode(self):
        """build_question_list 在 FSRS 模式下透传 scheduling_mode。"""
        from lib.focus_work_types import FLASH_CARD_KIND
        from lib.question_selector import build_question_list

        now = datetime.now(UTC)
        review_cards = [_vocab_card("w1", "apple", "苹果", due_at=now)]
        conn = _FsrsVocabMockConn(learned_today=0, review_cards=review_cards, new_cards=[])
        questions, warning = asyncio.run(
            build_question_list(
                conn, kind=FLASH_CARD_KIND, user_id=1, bank_id="bank-1", target_count=5,
                scheduling_mode="fsrs",
            )
        )
        assert len(questions) == 1
        assert warning is not None  # 1 < 5, 不足


class TestChoiceFsrsMode:
    def test_count_fsrs(self):
        from lib.question_selector import ChoiceQuestionAdapter

        conn = _FsrsChoiceMockConn(learned_today=0, review_cards=[], new_cards=[], fsrs_count=12)
        adapter = ChoiceQuestionAdapter()
        result = asyncio.run(
            adapter.count_available(conn, user_id=1, bank_id="bank-1", primary_filter="all", scheduling_mode="fsrs")
        )
        assert result == 12

    def test_select_returns_due_review_cards(self):
        """FSRS 模式下查到期复习卡。"""
        from lib.question_selector import ChoiceQuestionAdapter

        now = datetime.now(UTC)
        review_cards = [
            _choice_card("q1", "Question 1", due_at=now),
            _choice_card("q2", "Question 2", due_at=now),
        ]
        conn = _FsrsChoiceMockConn(learned_today=0, review_cards=review_cards, new_cards=[])
        adapter = ChoiceQuestionAdapter()
        results = asyncio.run(
            adapter.select_questions(
                conn, user_id=1, bank_id="bank-1", primary_filter="all", sort_order="sequential",
                scheduling_mode="fsrs", limit=5,
            )
        )
        assert len(results) == 2
        assert results[0]["question_id"] == "q1"

    def test_select_returns_new_cards_when_no_due(self):
        """FSRS 模式下查新题(无到期卡时)。"""
        from lib.question_selector import ChoiceQuestionAdapter

        new_cards = [_choice_card("q3", "Question 3")]
        conn = _FsrsChoiceMockConn(learned_today=0, review_cards=[], new_cards=new_cards)
        adapter = ChoiceQuestionAdapter()
        results = asyncio.run(
            adapter.select_questions(
                conn, user_id=1, bank_id="bank-1", primary_filter="all", sort_order="sequential",
                scheduling_mode="fsrs", limit=5,
            )
        )
        assert len(results) == 1
        assert results[0]["question_id"] == "q3"

    def test_select_quota_exhausted_returns_only_review(self):
        """FSRS 模式下当日新词配额用完只返回复习卡。"""
        from lib.question_selector import ChoiceQuestionAdapter

        now = datetime.now(UTC)
        review_cards = [_choice_card("q1", "Question 1", due_at=now)]
        conn = _FsrsChoiceMockConn(learned_today=3, review_cards=review_cards, new_cards=[])
        adapter = ChoiceQuestionAdapter()
        results = asyncio.run(
            adapter.select_questions(
                conn, user_id=1, bank_id="bank-1", primary_filter="all", sort_order="sequential",
                scheduling_mode="fsrs", limit=3,
            )
        )
        assert len(results) == 1
        assert results[0]["question_id"] == "q1"
        assert len(conn.fetch_calls) == 1  # no new card query


class TestInputFsrsFallback:
    """Input adapter 没有 fsrs 字段,FSRS 模式回退到 manual 逻辑。"""

    def test_count_fsrs_falls_back_to_manual(self):
        from lib.question_selector import InputQuestionAdapter

        class MockConn:
            async def fetchrow(self, query: str, *args: object):
                # 不应包含 FSRS 特有的 due_at/next_review_at 条件
                assert "IS NULL OR" not in query
                return _make_record({"cnt": 4})

        adapter = InputQuestionAdapter()
        result = asyncio.run(
            adapter.count_available(MockConn(), user_id=1, bank_id="bank-1", primary_filter="all", scheduling_mode="fsrs")
        )
        assert result == 4

    def test_select_fsrs_falls_back_to_manual(self):
        from lib.question_selector import InputQuestionAdapter

        class MockConn:
            async def fetch(self, query: str, *args: object):
                return [
                    _make_record({
                        "question_pk": "iq-1",
                        "question_id": "iq1",
                        "stem": "Translate",
                        "input_mode": "fill",
                        "accepted_answers": ["你好"],
                        "reference_answer": "你好",
                        "attempt_count": 0,
                    }),
                ]

        adapter = InputQuestionAdapter()
        results = asyncio.run(
            adapter.select_questions(
                MockConn(), user_id=1, bank_id="bank-1", primary_filter="all", sort_order="sequential",
                scheduling_mode="fsrs", limit=5,
            )
        )
        assert len(results) == 1
        assert results[0]["question_id"] == "iq1"


class TestManualModeRegression:
    """manual 模式不受影响(回归测试)。"""

    def test_count_questions_manual_default(self):
        from lib.question_selector import count_questions

        class MockConn:
            async def fetchrow(self, query: str, *args: object):
                return _make_record({"cnt": 9})

        result = asyncio.run(count_questions(MockConn(), kind="choice", user_id=1, bank_id="bank-1"))
        assert result == 9

    def test_build_question_list_manual_default(self):
        from lib.question_selector import build_question_list

        class MockConn:
            async def fetch(self, query: str, *args: object):
                return [
                    _make_record({
                        "question_pk": f"pk-{i}",
                        "question_id": f"q{i}",
                        "stem": f"Stem {i}",
                        "options_json": {"A": "A"},
                        "answer": "A",
                        "explanation": "",
                        "wrong_count": 0,
                        "right_count": 0,
                        "last_review_at": None,
                        "last_answer_correct": None,
                        "due_at": None,
                        "fsrs_card_json": None,
                    })
                    for i in range(3)
                ]

        questions, warning = asyncio.run(
            build_question_list(MockConn(), kind="choice", user_id=1, bank_id="bank-1", target_count=3)
        )
        assert len(questions) == 3
        assert warning is None

    def test_manual_mode_uses_primary_filter(self):
        """manual 模式正确应用 primary_filter=mistake。"""
        from lib.question_selector import ChoiceQuestionAdapter

        class MockConn:
            async def fetch(self, query: str, *args: object):
                assert "wrong_count" in query
                return [_make_record({
                    "question_pk": "pk-1", "question_id": "q1", "stem": "S",
                    "options_json": {}, "answer": "A", "explanation": "",
                    "wrong_count": 2, "right_count": 0,
                    "last_review_at": None, "last_answer_correct": None,
                    "due_at": None, "fsrs_card_json": None,
                })]

        adapter = ChoiceQuestionAdapter()
        results = asyncio.run(
            adapter.select_questions(
                MockConn(), user_id=1, bank_id="bank-1", primary_filter="mistake",
                sort_order="mistake_first", scheduling_mode="manual", limit=5,
            )
        )
        assert len(results) == 1
        assert results[0]["wrong_count"] == 2
