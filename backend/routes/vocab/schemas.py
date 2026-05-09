from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class VocabDeckOut(BaseModel):
    id: str
    key: str
    name: str
    description: str
    word_count: int
    created_at: datetime
    updated_at: datetime


class VocabTodaySummaryOut(BaseModel):
    learning_count: int = 0
    new_count: int
    review_count: int
    mistake_count: int
    total_count: int = 0
    pending_count: int = 0
    completed_count: int = 0
    daily_target_count: int = 0
    memorized_count: int = 0


class VocabDeckMasteryOut(BaseModel):
    deck_id: str
    deck_name: str
    total_word_count: int = 0
    mastered_word_count: int = 0
    learning_word_count: int = 0
    unstarted_word_count: int = 0


class VocabOverviewOut(BaseModel):
    completed_deck_count: int = 0
    total_deck_count: int = 0
    mastered_word_count: int = 0
    current_deck: VocabDeckMasteryOut


class VocabTranslationOut(BaseModel):
    pos: str | None = None
    translation: str


class VocabOverviewCurrentWordOut(BaseModel):
    id: str
    deck_id: str
    deck_name: str
    word: str
    us_pronunciation: str | None = None
    uk_pronunciation: str | None = None
    mastery_state: Literal["unstarted", "learning", "mastered"]
    translations: list[VocabTranslationOut] = Field(default_factory=list)


class VocabOverviewMasteredWordOut(BaseModel):
    id: str
    word: str
    us_pronunciation: str | None = None
    uk_pronunciation: str | None = None
    translations: list[VocabTranslationOut] = Field(default_factory=list)
    source_deck_names: list[str] = Field(default_factory=list)


class VocabInheritancePreviewOut(BaseModel):
    inheritable_word_count: int = 0


class VocabInheritanceApplyOut(BaseModel):
    inherited_word_count: int = 0


class VocabPhraseOut(BaseModel):
    phrase: str
    translation: str


class VocabSentenceOut(BaseModel):
    sentence: str
    translation: str


class VocabWordDetailOut(BaseModel):
    id: str
    deck_id: str
    word: str
    us_pronunciation: str | None = None
    uk_pronunciation: str | None = None
    translations: list[VocabTranslationOut] = Field(default_factory=list)
    phrases: list[VocabPhraseOut] = Field(default_factory=list)
    sentences: list[VocabSentenceOut] = Field(default_factory=list)


class VocabReviewQueueItemOut(VocabWordDetailOut):
    prompt_type: Literal["en_to_zh", "zh_to_en"] = "en_to_zh"
    review_mode: Literal["study", "review", "learning", "mistake", "erc_preheat"] = "review"
    mastery_score: int = 0


class VocabTodaySettingsIn(BaseModel):
    total_target_count: int = Field(ge=1, le=500)


class VocabReviewSubmitIn(BaseModel):
    deck_id: str
    word_id: str
    result: Literal["again", "hard", "good", "easy"]
    review_mode: str
    prompt_type: str
    response_ms: int | None = Field(default=None, ge=0)


class VocabReviewSubmitOut(BaseModel):
    mastery_score: int
    next_review_at: datetime
    wrong_count: int
    correct_count: int
    interval_days: int
    result: str
    should_repeat_today: bool = False


class VocabMistakeItemOut(VocabWordDetailOut):
    last_wrong_at: datetime | None = None
    wrong_count: int = 0
