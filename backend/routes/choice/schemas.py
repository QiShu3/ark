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
    mode: Literal["sequential", "random", "review"] = "sequential"


class ChoicePracticeCompletion(BaseModel):
    mode: Literal["question_count", "exhaust_scope", "time_box"] = "question_count"
    question_count: int = 10
    duration_seconds: int | None = None


class ChoicePracticeStartRequest(BaseModel):
    focus_work_type: str = "erc_practice"
    scope: ChoicePracticeScope
    completion: ChoicePracticeCompletion = Field(default_factory=ChoicePracticeCompletion)
    name: str = ""


class ChoicePracticeStartResponse(BaseModel):
    workflow_id: str
    scope_snapshot: dict[str, Any] = {}
    completion_snapshot: dict[str, Any] = {}
    total_in_scope: int = 0
