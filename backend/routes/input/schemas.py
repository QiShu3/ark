from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

InputQuestionMode = Literal["fill", "subjective"]
InputMatchRule = Literal["exact", "contains", "regex"]


class InputParagraphOut(BaseModel):
    id: str
    paragraph_no: int
    text: str


class InputQuestionOut(BaseModel):
    id: str
    question_id: str
    question_no: int
    stem: str
    mode: InputQuestionMode
    input_config: dict[str, Any] = Field(default_factory=dict)
    accepted_answers: list[str] = Field(default_factory=list)
    match_rule: InputMatchRule = "exact"
    case_sensitive: bool = False
    rubric: str = ""
    reference_answer: str = ""
    explanation: str = ""
    sort_order: int = 0


class InputArticleOut(BaseModel):
    id: str
    article_id: str
    title: str
    paragraphs: list[InputParagraphOut] = Field(default_factory=list)
    questions: list[InputQuestionOut] = Field(default_factory=list)


class InputSetOptionOut(BaseModel):
    id: str
    name: str
    count: int


class InputSubmitIn(BaseModel):
    question_id: str
    user_input: str
    time_spent_ms: int | None = None


class InputSubmitOut(BaseModel):
    question_id: str
    correct: bool | None = None
    accepted_answers: list[str] = Field(default_factory=list)
    score: int | None = None
    feedback: str = ""
    explanation: str = ""


class InputNextOut(BaseModel):
    has_item: bool
    article: InputArticleOut | None = None
    current_question_index: int = 0


class InputBankUploadOut(BaseModel):
    bank_id: str
    name: str
    question_count: int
    validation_summary: dict[str, Any] = Field(default_factory=dict)
