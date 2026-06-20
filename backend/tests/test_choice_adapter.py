"""Tests for the unified choice question adapter layer."""
from __future__ import annotations

import asyncio
from unittest.mock import MagicMock


def _make_record(data: dict) -> MagicMock:
    """Create a mock asyncpg Record-like object."""
    record = MagicMock()
    record.__getitem__ = lambda self, key: data[key]
    record.get = lambda key, default=None: data.get(key, default)
    for k, v in data.items():
        setattr(record, k, v)
    return record


class TestContentBlockParsing:
    def test_text_to_paragraph_blocks_single(self):
        from routes.choice.adapters import _text_to_paragraph_blocks
        blocks = _text_to_paragraph_blocks("Hello world")
        assert len(blocks) == 1
        assert blocks[0].type == "paragraph"
        assert blocks[0].text == "Hello world"

    def test_text_to_paragraph_blocks_multi(self):
        from routes.choice.adapters import _text_to_paragraph_blocks
        blocks = _text_to_paragraph_blocks("Para 1\n\nPara 2\n\nPara 3")
        assert len(blocks) == 3
        assert blocks[0].text == "Para 1"
        assert blocks[1].text == "Para 2"
        assert blocks[2].text == "Para 3"

    def test_text_to_paragraph_blocks_empty(self):
        from routes.choice.adapters import _text_to_paragraph_blocks
        blocks = _text_to_paragraph_blocks("")
        assert blocks == []

    def test_detect_table_block(self):
        from routes.choice.adapters import _detect_table_block
        result = _detect_table_block("<table><tr><td>A</td></tr></table>")
        assert result is not None
        assert result.type == "html"

    def test_detect_table_block_none(self):
        from routes.choice.adapters import _detect_table_block
        result = _detect_table_block("Just text")
        assert result is None


class TestParseOptions:
    def test_dict_options(self):
        from routes.choice.adapters import _parse_options
        options = _parse_options({"A": "opt A", "B": "opt B", "C": "opt C", "D": "opt D"})
        assert len(options) == 4
        assert options[0]["key"] == "A"
        assert options[0]["text"] == "opt A"

    def test_list_options(self):
        from routes.choice.adapters import _parse_options
        options = _parse_options([{"key": "A", "text": "opt A"}, {"key": "B", "text": "opt B"}])
        assert len(options) == 2
        assert options[0]["key"] == "A"

    def test_json_string_options(self):
        from routes.choice.adapters import _parse_options
        options = _parse_options('{"A": "opt A", "B": "opt B"}')
        assert len(options) == 2
        assert options[0]["key"] == "A"
        assert options[0]["text"] == "opt A"

    def test_empty_options(self):
        from routes.choice.adapters import _parse_options
        assert _parse_options(None) == []
        assert _parse_options({}) == []


class TestExtractHelpers:
    def test_extract_year_from_title(self):
        from routes.choice.adapters import _extract_year_from_title_or_body
        assert _extract_year_from_title_or_body("2025年408真题", {}) == 2025
        assert _extract_year_from_title_or_body("No year", {}) == 0

    def test_extract_year_from_body(self):
        from routes.choice.adapters import _extract_year_from_title_or_body
        assert _extract_year_from_title_or_body("", {"examination": "2024考研"}) == 2024

    def test_extract_tags(self):
        from routes.choice.adapters import _extract_tags_from_body
        body = {"tags": ["408", "数据结构"], "subject": "计算机"}
        tags = _extract_tags_from_body(body)
        assert "408" in tags
        assert "数据结构" in tags
        assert "计算机" in tags

    def test_extract_tags_empty(self):
        from routes.choice.adapters import _extract_tags_from_body
        assert _extract_tags_from_body({}) == []


class TestContentBlockSafeParsing:
    def test_html_table_parsing(self):
        from routes.choice.adapters import _detect_table_block
        html = "<table><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table>"
        block = _detect_table_block(html)
        assert block is not None
        assert block.type == "html"
        assert "<table" in block.text

    def test_paragraph_with_table(self):
        from routes.choice.adapters import _detect_table_block
        text = "Some text with <table><tr><td>1</td></tr></table>"
        block = _detect_table_block(text)
        assert block is not None
        assert block.type == "html"


class TestChoiceFilters:
    def test_choice_filters_count_selected_year(self):
        from routes.choice.adapters import get_choice_filters

        class Conn:
            async def fetch(self, query: str, *args: object):
                assert "FROM content_items" in query
                return [
                    {"id": "00000000-0000-0000-0000-000000000001", "title": "2025年 数据结构 第1题", "body": {"subject": "数据结构"}},
                    {"id": "00000000-0000-0000-0000-000000000002", "title": "2024年 数据结构 第1题", "body": {"subject": "数据结构"}},
                ]

            async def fetchval(self, query: str, *args: object):
                assert args[0] == ["00000000-0000-0000-0000-000000000001"]
                return 1

        result = asyncio.run(get_choice_filters(Conn(), bank_id="bank-1", year=2025))

        assert result.years == [2024, 2025]
        assert result.total_items == 1
        assert result.total_questions == 1


class TestERCChoiceAdapter:
    def test_erc_single_question_article_is_single_group(self):
        from routes.choice.adapters import list_erc_as_choice_items

        class Conn:
            async def fetch(self, query: str, *args: object):
                if "FROM erc_articles" in query:
                    return [
                        {
                            "article_pk": "00000000-0000-0000-0000-000000000001",
                            "article_id": "article-1",
                            "year": 2025,
                            "text_no": 1,
                            "title": "2025年 数据结构 第1题",
                            "exam": "408",
                            "sort_order": 1,
                        }
                    ]
                if "FROM erc_paragraphs" in query:
                    return [{"paragraph_no": 1, "text": "2025年 数据结构 第1题"}]
                if "FROM erc_questions" in query:
                    return [
                        {
                            "question_pk": "00000000-0000-0000-0000-000000000101",
                            "question_id": "q1",
                            "question_no": 1,
                            "stem": "单题题干",
                            "options_json": {"A": "选项 A", "B": "选项 B"},
                            "answer": "A",
                        }
                    ]
                return []

        items = asyncio.run(list_erc_as_choice_items(Conn(), bank_id="00000000-0000-0000-0000-000000000999"))

        assert items[0].group_type == "single"
        assert items[0].question_count == 1

    def test_erc_multi_question_article_is_passage_group(self):
        from routes.choice.adapters import list_erc_as_choice_items

        class Conn:
            async def fetch(self, query: str, *args: object):
                if "FROM erc_articles" in query:
                    return [
                        {
                            "article_pk": "00000000-0000-0000-0000-000000000001",
                            "article_id": "article-1",
                            "year": 2025,
                            "text_no": 1,
                            "title": "阅读 Text 1",
                            "exam": "英语",
                            "sort_order": 1,
                        }
                    ]
                if "FROM erc_paragraphs" in query:
                    return [{"paragraph_no": 1, "text": "阅读材料"}]
                if "FROM erc_questions" in query:
                    return [
                        {
                            "question_pk": "00000000-0000-0000-0000-000000000101",
                            "question_id": "q1",
                            "question_no": 1,
                            "stem": "题干 1",
                            "options_json": {"A": "选项 A", "B": "选项 B"},
                            "answer": "A",
                        },
                        {
                            "question_pk": "00000000-0000-0000-0000-000000000102",
                            "question_id": "q2",
                            "question_no": 2,
                            "stem": "题干 2",
                            "options_json": {"A": "选项 A", "B": "选项 B"},
                            "answer": "B",
                        },
                    ]
                return []

        items = asyncio.run(list_erc_as_choice_items(Conn(), bank_id="00000000-0000-0000-0000-000000000999"))

        assert items[0].group_type == "passage"
        assert items[0].question_count == 2
