from __future__ import annotations

from typing import Final

FLASH_CARD_KIND: Final[str] = "flash_card"
CHOICE_KIND: Final[str] = "choice"
INPUT_KIND: Final[str] = "input"

LEGACY_FLASH_CARD_KIND: Final[str] = "flashcard"
LEGACY_FLASH_CARD_WORK_TYPE: Final[str] = "vocab_today"
LEGACY_CHOICE_WORK_TYPES: Final[frozenset[str]] = frozenset({"practice", "review"})
LEGACY_FLASH_CARD_SNAPSHOT_TYPE: Final[str] = "vocab_deck"
LEGACY_INPUT_WORK_TYPE: Final[str] = "input"

_DELIBERATE_KIND_ALIASES: Final[dict[str, str]] = {
    LEGACY_FLASH_CARD_KIND: FLASH_CARD_KIND,
}

_FOCUS_WORK_TYPE_ALIASES: Final[dict[str, str]] = {
    LEGACY_FLASH_CARD_WORK_TYPE: FLASH_CARD_KIND,
    LEGACY_FLASH_CARD_KIND: FLASH_CARD_KIND,
    "flash": FLASH_CARD_KIND,
    "choice_question": CHOICE_KIND,
    "flash_card": FLASH_CARD_KIND,
    "choice": CHOICE_KIND,
    LEGACY_INPUT_WORK_TYPE: INPUT_KIND,
    "practice": CHOICE_KIND,
    "review": CHOICE_KIND,
    "erc_practice": CHOICE_KIND,
    "erc_review": CHOICE_KIND,
}

_SNAPSHOT_TYPE_ALIASES: Final[dict[str, str]] = {
    LEGACY_FLASH_CARD_SNAPSHOT_TYPE: "flash_card_deck",
}


def _normalize_text(value: object) -> str:
    return str(value or "").strip()


def normalize_deliberate_kind(value: object) -> str:
    text = _normalize_text(value)
    return _DELIBERATE_KIND_ALIASES.get(text, text)


def normalize_focus_work_type(value: object) -> str:
    text = _normalize_text(value)
    return _FOCUS_WORK_TYPE_ALIASES.get(text, text)


def normalize_snapshot_type(value: object) -> str:
    text = _normalize_text(value)
    return _SNAPSHOT_TYPE_ALIASES.get(text, text)


def is_flash_card_work_type(value: object) -> bool:
    return normalize_focus_work_type(value) == FLASH_CARD_KIND


def is_choice_work_type(value: object) -> bool:
    return normalize_focus_work_type(value) == CHOICE_KIND
