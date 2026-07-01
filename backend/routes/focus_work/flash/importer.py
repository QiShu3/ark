from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class TranslationSeed:
    translation: str
    pos: str | None


@dataclass(frozen=True)
class PhraseSeed:
    phrase: str
    translation: str


@dataclass(frozen=True)
class SentenceSeed:
    sentence: str
    translation: str


@dataclass(frozen=True)
class WordSeed:
    word: str
    us_pronunciation: str | None
    uk_pronunciation: str | None
    sort_order: int
    translations: list[TranslationSeed]
    phrases: list[PhraseSeed]
    sentences: list[SentenceSeed]


@dataclass(frozen=True)
class DeckSeed:
    key: str
    name: str
    description: str
    source_version: str
    words: list[WordSeed]


def parse_sentence_entry(payload: dict, sort_order: int) -> WordSeed:
    translations = [
        TranslationSeed(
            translation=str(item.get("translation", "")).strip(),
            pos=(str(item.get("type", "")).strip() or None),
        )
        for item in payload.get("translations", [])
        if str(item.get("translation", "")).strip()
    ]
    phrases = [
        PhraseSeed(
            phrase=str(item.get("phrase", "")).strip(),
            translation=str(item.get("translation", "")).strip(),
        )
        for item in payload.get("phrases", [])
        if str(item.get("phrase", "")).strip() and str(item.get("translation", "")).strip()
    ]
    sentences = [
        SentenceSeed(
            sentence=str(item.get("sentence", "")).strip(),
            translation=str(item.get("translation", "")).strip(),
        )
        for item in payload.get("sentences", [])
        if str(item.get("sentence", "")).strip() and str(item.get("translation", "")).strip()
    ]
    return WordSeed(
        word=str(payload["word"]).strip(),
        us_pronunciation=(str(payload.get("us", "")).strip() or None),
        uk_pronunciation=(str(payload.get("uk", "")).strip() or None),
        sort_order=sort_order,
        translations=translations,
        phrases=phrases,
        sentences=sentences,
    )


def load_sentence_json(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))


def parse_full_entry(payload: dict, sort_order: int) -> WordSeed:
    """Parse a word entry in the 'json-full' format."""
    inner = payload.get("content", {}).get("word", {})
    word_text = inner.get("wordHead", "") or payload.get("headWord", "")
    content = inner.get("content", {})

    us = content.get("usphone") or None
    uk = content.get("ukphone") or None

    translations = [
        TranslationSeed(
            translation=str(t.get("tranCn", "")).strip(),
            pos=(str(t.get("pos", "")).strip() or None),
        )
        for t in content.get("trans", [])
        if str(t.get("tranCn", "")).strip()
    ]

    phrases = [
        PhraseSeed(
            phrase=str(p.get("pContent", "")).strip(),
            translation=str(p.get("pCn", "")).strip(),
        )
        for p in content.get("phrase", {}).get("phrases", [])
        if str(p.get("pContent", "")).strip() and str(p.get("pCn", "")).strip()
    ]

    sentences = [
        SentenceSeed(
            sentence=str(s.get("sContent", "")).strip(),
            translation=str(s.get("sCn", "")).strip(),
        )
        for s in content.get("sentence", {}).get("sentences", [])
        if str(s.get("sContent", "")).strip() and str(s.get("sCn", "")).strip()
    ]

    return WordSeed(
        word=word_text.strip(),
        us_pronunciation=us,
        uk_pronunciation=uk,
        sort_order=sort_order,
        translations=translations,
        phrases=phrases,
        sentences=sentences,
    )


def detect_format(payloads: list[dict]) -> str:
    """Detect whether the JSON is 'sentence' or 'full' format."""
    if not payloads:
        return "sentence"
    first = payloads[0]
    if "content" in first and "word" in first.get("content", {}):
        return "full"
    return "sentence"


def parse_word_entry(payload: dict, sort_order: int, fmt: str) -> WordSeed:
    """Parse a word entry using the detected format."""
    if fmt == "full":
        return parse_full_entry(payload, sort_order)
    return parse_sentence_entry(payload, sort_order)


def _deck_meta_from_filename(path: Path) -> tuple[str, str]:
    stem = path.stem
    if "-" not in stem:
        return stem.lower(), stem
    _, raw_name = stem.split("-", 1)
    name = raw_name.strip()
    key = name.lower().replace(" ", "-")
    key_map = {
        "cet4": "cet4",
        "cet6": "cet6",
        "sat": "sat",
        "初中": "junior",
        "高中": "senior",
        "考研": "postgraduate",
        "托福": "toefl",
    }
    return key_map.get(name.lower(), key_map.get(name, key)), name


def build_deck_seed(path: Path, *, source_version: str = "json-sentence") -> DeckSeed:
    key, name = _deck_meta_from_filename(path)
    payloads = load_sentence_json(path)
    words = [parse_sentence_entry(item, sort_order=index) for index, item in enumerate(payloads, start=1)]
    return DeckSeed(
        key=key,
        name=name,
        description=f"{name} 词书",
        source_version=source_version,
        words=words,
    )
