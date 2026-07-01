from __future__ import annotations

import json

import pytest

from routes.focus_work.choice.importer import (
    ERCArticleSeed,
    load_article_seeds,
    load_article_word_seeds,
    parse_article_payload,
    parse_article_word_payload,
)


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


def test_load_article_seeds_reads_sorted_json_files(tmp_path) -> None:
    first = _payload()
    second = _payload()
    second["article_id"] = "kaoyan2_2025_text2"
    second["text_no"] = 2
    second["questions"][0]["question_id"] = "kaoyan2_2025_text2_q26"
    (tmp_path / "kaoyan2_2025_text2.json").write_text(json.dumps(second), encoding="utf-8")
    (tmp_path / "kaoyan2_2025_text1.json").write_text(json.dumps(first), encoding="utf-8")

    seeds = load_article_seeds(tmp_path)

    assert [seed.article_id for seed in seeds] == ["kaoyan2_2025_text1", "kaoyan2_2025_text2"]
    assert [seed.sort_order for seed in seeds] == [1, 2]


def test_parse_article_word_payload_extracts_words() -> None:
    seed = parse_article_word_payload(
        {"article_id": "kaoyan2_2025_text1", "words": ["Visionary", "mortality"]},
        source_name="kaoyan2_2025_text1.words.json",
    )

    assert seed.article_id == "kaoyan2_2025_text1"
    assert seed.words == ["visionary", "mortality"]


def test_parse_article_word_payload_rejects_phrases() -> None:
    with pytest.raises(ValueError, match="spaces"):
        parse_article_word_payload(
            {"article_id": "kaoyan2_2025_text1", "words": ["minimum wage"]},
            source_name="kaoyan2_2025_text1.words.json",
        )


def test_load_article_word_seeds_reads_word_profiles(tmp_path) -> None:
    (tmp_path / "kaoyan2_2025_text1.words.json").write_text(
        json.dumps({"article_id": "kaoyan2_2025_text1", "words": ["visionary"]}),
        encoding="utf-8",
    )

    seeds = load_article_word_seeds(tmp_path)

    assert [seed.article_id for seed in seeds] == ["kaoyan2_2025_text1"]
    assert seeds[0].words == ["visionary"]
