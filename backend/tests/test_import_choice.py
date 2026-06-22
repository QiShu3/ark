from __future__ import annotations

from routes.choice.importer import ERCArticleSeed, parse_content_bank_entries


def _choice_entry(**overrides) -> dict:
    entry = {
        "title": "2025年 408 数据结构 Text 1",
        "examination": "408",
        "tags": ["2025", "408", "数据结构"],
        "passage": "第一段内容。\n\n第二段内容。",
        "questions": [
            {
                "question_text": "下列程序段的时间复杂度是？",
                "options": {"A": "O(log n)", "B": "O(n)", "C": "O(n log n)", "D": "O(n^2)"},
                "correct_answer": "B",
                "analysis": "解析。",
            }
        ],
    }
    entry.update(overrides)
    return entry


def test_parse_basic() -> None:
    seeds = parse_content_bank_entries([_choice_entry()], set_key="test")
    assert len(seeds) == 1
    s = seeds[0]
    assert isinstance(s, ERCArticleSeed)
    assert s.article_id == "test_text1"
    assert s.year == 2025
    assert s.exam == "408"
    assert len(s.paragraphs) == 2
    assert s.paragraphs[0].paragraph_no == 1
    assert s.paragraphs[0].text == "第一段内容。"
    assert len(s.questions) == 1
    assert s.questions[0].stem == "下列程序段的时间复杂度是？"
    assert s.questions[0].answer == "B"
    assert s.questions[0].explanation == "解析。"
    assert s.questions[0].question_id == "test_text1_q1"


def test_parse_multiple_entries() -> None:
    raw = [_choice_entry(title=f"Text {i}") for i in range(1, 4)]
    seeds = parse_content_bank_entries(raw, set_key="multi")
    assert len(seeds) == 3
    assert seeds[0].article_id == "multi_text1"
    assert seeds[1].article_id == "multi_text2"
    assert seeds[2].article_id == "multi_text3"
    assert seeds[2].sort_order == 3


def test_parse_skips_invalid_questions() -> None:
    entry = _choice_entry()
    entry["questions"] = [
        {"question_text": "valid", "options": {"A": "x"}, "correct_answer": "A"},
        {"question_text": "", "options": {"A": "x"}, "correct_answer": "A"},
        {"question_text": "no answer", "options": {"A": "x"}},
        {"question_text": "bad answer", "options": {"A": "x"}, "correct_answer": "E"},
    ]
    seeds = parse_content_bank_entries([entry], set_key="skip")
    assert len(seeds[0].questions) == 1
    assert seeds[0].questions[0].stem == "valid"


def test_parse_empty_passage() -> None:
    seeds = parse_content_bank_entries([_choice_entry(passage="")], set_key="empty")
    assert len(seeds[0].paragraphs) == 0


def test_parse_no_examination_uses_tags() -> None:
    entry = _choice_entry(examination="", tags=["考研英语二"])
    seeds = parse_content_bank_entries([entry], set_key="tag")
    assert seeds[0].exam == "考研英语二"


def test_parse_year_from_title() -> None:
    entry = _choice_entry(title="2023年考研真题 Text 2")
    seeds = parse_content_bank_entries([entry], set_key="year")
    assert seeds[0].year == 2023


def test_parse_text_no_from_title() -> None:
    entry = _choice_entry(title="Text 3 阅读理解")
    seeds = parse_content_bank_entries([entry], set_key="tno")
    assert seeds[0].text_no == 3


def test_parse_skips_non_dict_entries() -> None:
    raw = ["invalid", _choice_entry(), None]
    seeds = parse_content_bank_entries(raw, set_key="skip")
    assert len(seeds) == 1


def test_parse_options_copied() -> None:
    opts = {"A": "选项A", "B": "选项B", "C": "选项C", "D": "选项D"}
    entry = _choice_entry(questions=[{
        "question_text": "test",
        "options": opts,
        "correct_answer": "C",
    }])
    seeds = parse_content_bank_entries([entry], set_key="opts")
    assert seeds[0].questions[0].options == opts


def test_parse_explanation_mapped() -> None:
    entry = _choice_entry(questions=[{
        "question_text": "q",
        "options": {"A": "x"},
        "correct_answer": "A",
        "analysis": "这是解析",
    }])
    seeds = parse_content_bank_entries([entry], set_key="expl")
    assert seeds[0].questions[0].explanation == "这是解析"
