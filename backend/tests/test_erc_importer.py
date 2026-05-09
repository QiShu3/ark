from __future__ import annotations

import pytest

from routes.erc.importer import ERCArticleSeed, parse_article_payload


def _payload() -> dict:
    return {
        "article_id": "kaoyan2_2025_text1",
        "exam": "考研英语二",
        "year": 2025,
        "text_no": 1,
        "title": "",
        "content": [
            {"paragraph_no": 1, "text": "Paragraph one."},
            {"paragraph_no": 2, "text": "Paragraph two."},
        ],
        "questions": [
            {
                "question_id": "kaoyan2_2025_text1_q21",
                "question_no": 21,
                "stem": "According to Paragraph 1, ...",
                "options": {"A": "Alpha", "B": "Beta", "C": "Gamma", "D": "Delta"},
                "answer": "B",
                "evidence": {"paragraphs": [], "text": ""},
                "explanation": "",
                "question_type": "",
            }
        ],
    }


def test_parse_article_payload_extracts_article_paragraphs_and_questions() -> None:
    seed = parse_article_payload(_payload(), source_name="kaoyan2_2025_text1.json", sort_order=7)

    assert isinstance(seed, ERCArticleSeed)
    assert seed.article_id == "kaoyan2_2025_text1"
    assert seed.exam == "考研英语二"
    assert seed.year == 2025
    assert seed.text_no == 1
    assert seed.sort_order == 7
    assert seed.paragraphs[0].paragraph_no == 1
    assert seed.questions[0].question_id == "kaoyan2_2025_text1_q21"
    assert seed.questions[0].answer == "B"


def test_parse_article_payload_rejects_invalid_answer() -> None:
    payload = _payload()
    payload["questions"][0]["answer"] = "E"

    with pytest.raises(ValueError, match="answer"):
        parse_article_payload(payload, source_name="kaoyan2_2025_text1.json", sort_order=1)


def test_parse_article_payload_rejects_filename_article_mismatch() -> None:
    with pytest.raises(ValueError, match="filename"):
        parse_article_payload(_payload(), source_name="kaoyan2_2025_text2.json", sort_order=1)
