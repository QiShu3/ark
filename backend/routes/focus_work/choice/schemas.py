"""Pydantic DTOs for the unified choice question model."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

# ---- Content blocks ----

class ContentBlock(BaseModel):
    type: Literal["paragraph", "table", "image", "math", "html"]
    text: str = ""
    content: Any = None
    src: str | None = None
    alt: str | None = None


# ---- Bank / Paper / Item / Question ----

class ChoiceBankOut(BaseModel):
    id: str
    name: str
    source: str
    item_type: str
    item_count: int = 0
    question_count: int = 0


class ChoicePaperOut(BaseModel):
    id: str
    bank_id: str
    year: int = 0
    exam: str = ""
    subject: str = ""
    title: str = ""
    item_count: int = 0


class ChoiceQuestionOut(BaseModel):
    id: str
    question_no: int = 0
    stem_blocks: list[ContentBlock] = []
    options: list[dict[str, str]] = []
    answer: str = ""
    explanation_blocks: list[ContentBlock] = []
    tags: list[str] = []
    sort_order: int = 0


class ChoiceItemOut(BaseModel):
    id: str
    bank_id: str
    paper_id: str | None = None
    title: str = ""
    material_blocks: list[ContentBlock] = []
    group_type: Literal["single", "passage", "case", "composite"] = "single"
    subject_area: str | None = None
    tags: list[str] = []
    sort_order: int = 0
    question_count: int = 0
    questions: list[ChoiceQuestionOut] = []


# ---- Filters ----

class ChoiceFiltersOut(BaseModel):
    years: list[int] = []
    subjects: list[str] = []
    tags: list[str] = []
    total_items: int = 0
    total_questions: int = 0


# ---- Scope & Completion ----

class ChoicePracticeScope(BaseModel):
    bank_id: str
    paper_id: str | None = None
    years: list[int] | None = None
    subjects: list[str] | None = None
    tags: list[str] | None = None
    status: Literal["all", "unstarted", "mistake", "due_review"] = "all"
    mode: Literal["sequential", "random"] = "sequential"


class ChoicePracticeCompletion(BaseModel):
    mode: Literal["question_count", "exhaust_scope", "time_box"] = "question_count"
    question_count: int = 10
    duration_seconds: int | None = None


class ChoicePracticeStartRequest(BaseModel):
    scope: ChoicePracticeScope
    completion: ChoicePracticeCompletion = Field(default_factory=ChoicePracticeCompletion)
    name: str = ""


class ChoicePracticeStartResponse(BaseModel):
    workflow_id: str
    scope_snapshot: dict[str, Any] = {}
    completion_snapshot: dict[str, Any] = {}
    total_in_scope: int = 0


class ChoiceAnswerSubmitIn(BaseModel):
    chosen_option: Literal["A", "B", "C", "D"]
    time_spent_ms: int | None = Field(default=None, ge=0)


class ChoiceAnswerSubmitOut(BaseModel):
    question_id: str
    chosen_option: str
    correct_option: str
    is_correct: bool
    rating: Literal["again", "hard", "good", "easy"]
    next_review_at: Any = None


# ---- Overview / Review / Mistakes (delegated to ERC service) ----

class ChoiceOverviewRecommendedArticle(BaseModel):
    article_id: str
    year: int
    text_no: int
    title: str


class ChoiceOverviewOut(BaseModel):
    due_review_count: int
    practiced_article_count: int
    practiced_question_count: int
    accuracy: float
    mistake_count: int
    recommended_article: ChoiceOverviewRecommendedArticle | None = None


class ChoiceReviewNextParagraph(BaseModel):
    paragraph_no: int
    text: str


class ChoiceReviewNextQuestion(BaseModel):
    question_id: str
    question_no: int
    stem: str
    options: dict[str, str]
    answer: str | None = None


class ChoiceReviewNextArticle(BaseModel):
    article_id: str
    year: int
    text_no: int
    title: str


class ChoiceReviewNextOut(BaseModel):
    has_item: bool
    next_due_at: Any = None
    article: ChoiceReviewNextArticle | None = None
    paragraphs: list[ChoiceReviewNextParagraph] = []
    question: ChoiceReviewNextQuestion | None = None


class ChoiceMistakeItemOut(BaseModel):
    article_id: str
    year: int
    text_no: int
    question_id: str
    question_no: int
    stem: str
    correct_option: str
    last_chosen_option: str | None = None
    wrong_count: int
    last_wrong_at: Any = None
    is_due: bool = False


# ---- Set Snapshots ----

class SetSnapshotOut(BaseModel):
    id: str
    set_id: str
    total_questions: int
    total_articles: int
    by_state: dict[str, Any]
    mastery: dict[str, Any]
    fsrs_stats: dict[str, Any]
    due_status: dict[str, Any]
    focus_stats: dict[str, Any]
    trigger_reason: str
    focus_run_id: str | None = None
    created_at: Any
