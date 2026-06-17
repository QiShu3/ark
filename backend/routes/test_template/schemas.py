"""Pydantic models for 模板子应用."""
from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel


class SetItem(BaseModel):
    id: str
    key: str
    name: str
    item_count: int
    is_published: bool


class OverviewOut(BaseModel):
    practiced_count: int
    correct_count: int
    accuracy: float
    due_count: int
    mistake_count: int


class QuestionItem(BaseModel):
    question_id: str
    stem: str
    options: list[dict]
    meta: dict | None = None


class ReviewNextOut(BaseModel):
    has_item: bool = False
    next_due_at: datetime | None = None
    question: QuestionItem | None = None


class ReviewSubmitIn(BaseModel):
    question_id: str
    chosen_option: str
    rating: str | None = None


class ReviewSubmitOut(BaseModel):
    is_correct: bool
    next_due_at: datetime | None = None


class MistakeItem(BaseModel):
    question_id: str
    stem: str
    correct_option: str
    last_chosen_option: str | None
    wrong_count: int
    last_wrong_at: datetime | None
    is_due: bool
