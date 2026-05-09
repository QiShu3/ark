from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class ERCParagraphSeed:
    paragraph_no: int
    text: str


@dataclass(frozen=True)
class ERCQuestionSeed:
    question_id: str
    question_no: int
    stem: str
    options: dict[str, str]
    answer: str
    evidence: dict[str, Any]
    explanation: str
    question_type: str
    sort_order: int


@dataclass(frozen=True)
class ERCArticleSeed:
    article_id: str
    exam: str
    year: int
    text_no: int
    title: str
    sort_order: int
    paragraphs: list[ERCParagraphSeed]
    questions: list[ERCQuestionSeed]


@dataclass(frozen=True)
class ERCArticleWordSeed:
    article_id: str
    words: list[str]


def _require_text(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{key} must be a non-empty string")
    return value.strip()


def parse_article_payload(payload: dict[str, Any], *, source_name: str, sort_order: int) -> ERCArticleSeed:
    article_id = _require_text(payload, "article_id")
    expected_name = f"{article_id}.json"
    if source_name != expected_name:
        raise ValueError(f"filename {source_name} does not match article_id {article_id}")

    content = payload.get("content")
    if not isinstance(content, list) or not content:
        raise ValueError("content must be a non-empty list")
    paragraphs = [
        ERCParagraphSeed(paragraph_no=int(item["paragraph_no"]), text=_require_text(item, "text")) for item in content
    ]

    questions_payload = payload.get("questions")
    if not isinstance(questions_payload, list) or not questions_payload:
        raise ValueError("questions must be a non-empty list")

    questions: list[ERCQuestionSeed] = []
    seen_question_ids: set[str] = set()
    for index, item in enumerate(questions_payload, start=1):
        question_id = _require_text(item, "question_id")
        if question_id in seen_question_ids:
            raise ValueError(f"duplicate question_id {question_id}")
        seen_question_ids.add(question_id)
        options = item.get("options")
        if not isinstance(options, dict):
            raise ValueError(f"{question_id} options must be an object")
        normalized_options = {key: _require_text(options, key) for key in ("A", "B", "C", "D")}
        answer = _require_text(item, "answer")
        if answer not in normalized_options:
            raise ValueError(f"{question_id} answer must be one of A/B/C/D")
        evidence = item.get("evidence") if isinstance(item.get("evidence"), dict) else {"paragraphs": [], "text": ""}
        questions.append(
            ERCQuestionSeed(
                question_id=question_id,
                question_no=int(item["question_no"]),
                stem=_require_text(item, "stem"),
                options=normalized_options,
                answer=answer,
                evidence=evidence,
                explanation=str(item.get("explanation") or ""),
                question_type=str(item.get("question_type") or ""),
                sort_order=index,
            )
        )

    return ERCArticleSeed(
        article_id=article_id,
        exam=_require_text(payload, "exam"),
        year=int(payload["year"]),
        text_no=int(payload["text_no"]),
        title=str(payload.get("title") or ""),
        sort_order=sort_order,
        paragraphs=paragraphs,
        questions=questions,
    )


def load_article_seeds(directory: Path) -> list[ERCArticleSeed]:
    files = sorted(directory.glob("*.json"))
    seeds: list[ERCArticleSeed] = []
    seen_article_ids: set[str] = set()
    for sort_order, file_path in enumerate(files, start=1):
        payload = json.loads(file_path.read_text(encoding="utf-8"))
        seed = parse_article_payload(payload, source_name=file_path.name, sort_order=sort_order)
        if seed.article_id in seen_article_ids:
            raise ValueError(f"duplicate article_id {seed.article_id}")
        seen_article_ids.add(seed.article_id)
        seeds.append(seed)
    return seeds


def parse_article_word_payload(payload: dict[str, Any], *, source_name: str) -> ERCArticleWordSeed:
    article_id = _require_text(payload, "article_id")
    expected_name = f"{article_id}.words.json"
    if source_name != expected_name:
        raise ValueError(f"filename {source_name} does not match article_id {article_id}")

    words_payload = payload.get("words")
    if not isinstance(words_payload, list):
        raise ValueError("words must be a list")

    words: list[str] = []
    seen_words: set[str] = set()
    for raw_word in words_payload:
        if not isinstance(raw_word, str) or not raw_word.strip():
            raise ValueError(f"{article_id} words must contain non-empty strings")
        word = raw_word.strip().lower()
        if " " in word:
            raise ValueError(f"{article_id} word must not contain spaces: {word}")
        if word in seen_words:
            raise ValueError(f"{article_id} duplicate word {word}")
        seen_words.add(word)
        words.append(word)

    return ERCArticleWordSeed(article_id=article_id, words=words)


def load_article_word_seeds(directory: Path) -> list[ERCArticleWordSeed]:
    files = sorted(directory.glob("*.words.json"))
    seeds: list[ERCArticleWordSeed] = []
    seen_article_ids: set[str] = set()
    for file_path in files:
        payload = json.loads(file_path.read_text(encoding="utf-8"))
        seed = parse_article_word_payload(payload, source_name=file_path.name)
        if seed.article_id in seen_article_ids:
            raise ValueError(f"duplicate article_id {seed.article_id}")
        seen_article_ids.add(seed.article_id)
        seeds.append(seed)
    return seeds
