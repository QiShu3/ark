from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

DeliberateKind = Literal["flashcard", "choice", "input"]
DeliberateFocusWorkType = Literal["vocab_today", "practice", "review", "input"]
DeliberateRunStatus = Literal["started", "content_completed", "completed", "abandoned"]
DeliberateSnapshotType = Literal["choice_set", "vocab_deck", "input_set"]


class DeliberateBankSummary(BaseModel):
    id: str
    name: str
    kind: DeliberateKind
    item_count: int = 0
    question_count: int = 0


class DeliberateBankOptionOut(BaseModel):
    id: str
    name: str
    kind: DeliberateKind
    count: int
    item_count: int = 0
    question_count: int = 0


class DeliberateWorkflowRunSummary(BaseModel):
    id: str
    config_id: str | None = None
    workflow_id: str | None = None
    focus_run_id: str | None = None
    focus_work_type: DeliberateFocusWorkType
    bank_id: str | None = None
    snapshot_id: str | None = None
    snapshot_type: DeliberateSnapshotType | None = None
    status: DeliberateRunStatus
    progress_snapshot: dict[str, Any] = Field(default_factory=dict)
    created_at: str
    updated_at: str
    completed_at: str | None = None


class DeliberateWorkflowConfigOut(BaseModel):
    id: str
    name: str
    kind: DeliberateKind
    focus_work_type: DeliberateFocusWorkType
    bank_id: str | None = None
    task_id: str | None = None
    target_count: int = Field(default=10, ge=1, le=500)
    scope: dict[str, Any] = Field(default_factory=dict)
    completion: dict[str, Any] = Field(default_factory=dict)
    pass_criteria: dict[str, Any] = Field(default_factory=dict)
    bank_summary: DeliberateBankSummary | None = None
    latest_run: DeliberateWorkflowRunSummary | None = None
    created_at: str
    updated_at: str


class DeliberateWorkflowConfigCreate(BaseModel):
    name: str = Field(min_length=1)
    kind: DeliberateKind
    focus_work_type: DeliberateFocusWorkType
    bank_id: str | None = None
    task_id: str | None = None
    target_count: int = Field(default=10, ge=1, le=500)
    scope: dict[str, Any] = Field(default_factory=dict)
    completion: dict[str, Any] = Field(default_factory=dict)
    pass_criteria: dict[str, Any] = Field(default_factory=dict)


class DeliberateWorkflowConfigPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    kind: DeliberateKind | None = None
    focus_work_type: DeliberateFocusWorkType | None = None
    bank_id: str | None = None
    task_id: str | None = None
    target_count: int | None = Field(default=None, ge=1, le=500)
    scope: dict[str, Any] | None = None
    completion: dict[str, Any] | None = None
    pass_criteria: dict[str, Any] | None = None


class DeliberateBankUploadOut(BaseModel):
    bank_id: str
    kind: DeliberateKind
    name: str
    item_count: int = 0
    question_count: int = 0
    validation_summary: dict[str, Any] = Field(default_factory=dict)


class DeliberateWorkflowRunOut(DeliberateWorkflowRunSummary):
    config_snapshot: dict[str, Any] = Field(default_factory=dict)
