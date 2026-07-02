"""Tests for the unified question selector (backend/lib/question_selector.py)."""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime


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


class TestBuildFilterClause:
    def test_choice_all(self):
        from lib.question_selector import ChoiceQuestionAdapter

        adapter = ChoiceQuestionAdapter()
        _, params = adapter._build_filter_clause(1, "bank-1", "all", False)
        assert params["conditions"] == []
        assert len(params["args"]) == 2
        assert params["args"] == [1, "bank-1"]

    def test_choice_unstarted(self):
        from lib.question_selector import ChoiceQuestionAdapter

        adapter = ChoiceQuestionAdapter()
        _, params = adapter._build_filter_clause(1, "bank-1", "unstarted", False)
        assert "c.question_pk IS NULL" in params["conditions"][0]

    def test_choice_mistake(self):
        from lib.question_selector import ChoiceQuestionAdapter

        adapter = ChoiceQuestionAdapter()
        _, params = adapter._build_filter_clause(1, "bank-1", "mistake", False)
        assert "wrong_count" in params["conditions"][0]

    def test_choice_last_wrong(self):
        from lib.question_selector import ChoiceQuestionAdapter

        adapter = ChoiceQuestionAdapter()
        _, params = adapter._build_filter_clause(1, "bank-1", "last_wrong", False)
        assert "last_answer_correct" in params["conditions"][0]

    def test_choice_due_review(self):
        from lib.question_selector import ChoiceQuestionAdapter

        adapter = ChoiceQuestionAdapter()
        _, params = adapter._build_filter_clause(1, "bank-1", "due_review", False)
        assert "due_at" in params["conditions"][0]
        assert len(params["args"]) == 3

    def test_vocab_all(self):
        from lib.question_selector import VocabQuestionAdapter

        adapter = VocabQuestionAdapter()
        _, params = adapter._build_filter_clause(1, "bank-1", "all", False)
        assert params["conditions"] == []

    def test_vocab_unstarted(self):
        from lib.question_selector import VocabQuestionAdapter

        adapter = VocabQuestionAdapter()
        _, params = adapter._build_filter_clause(1, "bank-1", "unstarted", False)
        assert "p.word_id IS NULL" in params["conditions"][0]

    def test_vocab_due_review(self):
        from lib.question_selector import VocabQuestionAdapter

        adapter = VocabQuestionAdapter()
        _, params = adapter._build_filter_clause(1, "bank-1", "due_review", False)
        assert "next_review_at" in params["conditions"][0]
        assert len(params["args"]) == 3

    def test_input_all(self):
        from lib.question_selector import InputQuestionAdapter

        adapter = InputQuestionAdapter()
        _, params = adapter._build_filter_clause(1, "bank-1", "all", False)
        assert params["conditions"] == []

    def test_input_unstarted(self):
        from lib.question_selector import InputQuestionAdapter

        adapter = InputQuestionAdapter()
        _, params = adapter._build_filter_clause(1, "bank-1", "unstarted", False)
        assert "a.id IS NULL" in params["conditions"][0]

    def test_input_mistake(self):
        from lib.question_selector import InputQuestionAdapter

        adapter = InputQuestionAdapter()
        _, params = adapter._build_filter_clause(1, "bank-1", "mistake", False)
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
        result = asyncio.run(adapter.count_available(MockConn(), user_id=1, bank_id="bank-1", primary_filter="all", use_fsrs=False))
        assert result == 5

    def test_count_unstarted(self):
        from lib.question_selector import ChoiceQuestionAdapter

        class MockConn:
            async def fetchrow(self, query: str, *args: object):
                assert "IS NULL" in query
                return _make_record({"cnt": 3})

        adapter = ChoiceQuestionAdapter()
        result = asyncio.run(adapter.count_available(MockConn(), user_id=1, bank_id="bank-1", primary_filter="unstarted", use_fsrs=False))
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
        results = asyncio.run(adapter.select_questions(MockConn(), user_id=1, bank_id="bank-1", primary_filter="all", sort_order="sequential", use_fsrs=False, limit=1))
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
        result = asyncio.run(adapter.count_available(MockConn(), user_id=1, bank_id="bank-1", primary_filter="all", use_fsrs=False))
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
        results = asyncio.run(adapter.select_questions(MockConn(), user_id=1, bank_id="bank-1", primary_filter="all", sort_order="sequential", use_fsrs=False, limit=5))
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
        results = asyncio.run(adapter.select_questions(MockConn(), user_id=1, bank_id="bank-1", primary_filter="mistake", sort_order="mistake_first", use_fsrs=False, limit=5))
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
        result = asyncio.run(adapter.count_available(MockConn(), user_id=1, bank_id="bank-1", primary_filter="all", use_fsrs=False))
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
        results = asyncio.run(adapter.select_questions(MockConn(), user_id=1, bank_id="bank-1", primary_filter="all", sort_order="sequential", use_fsrs=False, limit=10))
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
