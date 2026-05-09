from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class ERCSetOut(BaseModel):
    id: str
    key: str
    name: str
    description: str
    exam: str
    article_count: int
    question_count: int


class ERCOverviewArticleOut(BaseModel):
    article_id: str
    year: int
    text_no: int
    title: str


class ERCOverviewOut(BaseModel):
    due_review_count: int
    practiced_article_count: int
    practiced_question_count: int
    accuracy: float
    mistake_count: int
    recommended_article: ERCOverviewArticleOut | None = None


class ERCArticleListItemOut(BaseModel):
    article_id: str
    set_id: str
    year: int
    text_no: int
    title: str
    status: Literal["unstarted", "practiced", "has_due_review"]
    question_count: int
    mistake_count: int
    last_attempt_at: datetime | None = None


class ERCParagraphOut(BaseModel):
    paragraph_no: int
    text: str


class ERCQuestionOut(BaseModel):
    question_id: str
    question_no: int
    stem: str
    options: dict[str, str]
    answer: str | None = None


class ERCArticleVocabularyWordOut(BaseModel):
    word: str
    state: Literal["mastered", "learning", "unstarted", "unknown"]


class ERCArticleVocabularySummaryOut(BaseModel):
    total_word_count: int = 0
    mastered_count: int = 0
    learning_count: int = 0
    unstarted_count: int = 0
    unknown_count: int = 0
    unfamiliar_count: int = 0
    mastery_rate: float = 0.0
    preview_words: list[ERCArticleVocabularyWordOut] = Field(default_factory=list)


class ERCArticleDetailOut(BaseModel):
    article_id: str
    set_id: str
    exam: str
    year: int
    text_no: int
    title: str
    paragraphs: list[ERCParagraphOut]
    questions: list[ERCQuestionOut]
    last_attempt_at: datetime | None = None
    vocabulary_summary: ERCArticleVocabularySummaryOut | None = None


class ERCAnswerIn(BaseModel):
    question_id: str
    chosen_option: Literal["A", "B", "C", "D"]
    time_spent_ms: int | None = Field(default=None, ge=0)


class ERCArticleSubmitIn(BaseModel):
    answers: list[ERCAnswerIn]
    time_spent_ms: int | None = Field(default=None, ge=0)
    started_at: datetime | None = None


class ERCArticleSubmitItemOut(BaseModel):
    question_id: str
    question_no: int
    chosen_option: str
    correct_option: str
    is_correct: bool
    rating: Literal["again", "hard", "good", "easy"]
    next_review_at: datetime | None = None
    entered_mistakes: bool


class ERCArticleSubmitOut(BaseModel):
    attempt_id: str
    article_id: str
    correct_count: int
    question_count: int
    items: list[ERCArticleSubmitItemOut]


class ERCReviewNextOut(BaseModel):
    has_item: bool
    next_due_at: datetime | None = None
    article: ERCOverviewArticleOut | None = None
    paragraphs: list[ERCParagraphOut] = []
    question: ERCQuestionOut | None = None


class ERCReviewSubmitIn(BaseModel):
    question_id: str
    chosen_option: Literal["A", "B", "C", "D"]
    time_spent_ms: int | None = Field(default=None, ge=0)


class ERCReviewSubmitOut(BaseModel):
    question_id: str
    chosen_option: str
    correct_option: str
    is_correct: bool
    rating: Literal["again", "hard", "good", "easy"]
    next_review_at: datetime | None = None


class ERCMistakeItemOut(BaseModel):
    article_id: str
    year: int
    text_no: int
    question_id: str
    question_no: int
    stem: str
    correct_option: str
    last_chosen_option: str | None = None
    wrong_count: int
    last_wrong_at: datetime
    is_due: bool
