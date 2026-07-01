from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from lib.focus_work_types import normalize_deliberate_kind, normalize_focus_work_type, normalize_snapshot_type

DeliberateKind = Literal["flash_card", "choice", "input"]
DeliberateFocusWorkType = Literal["flash_card", "choice", "input"]
DeliberateRunStatus = Literal["started", "content_completed", "completed", "abandoned"]
DeliberateSnapshotType = Literal["choice_set", "flash_card_deck", "input_set"]


class _NormalizedDeliberateBase(BaseModel):
    @field_validator("kind", mode="before", check_fields=False)
    @classmethod
    def _normalize_kind(cls, value: Any) -> Any:
        return normalize_deliberate_kind(value)

    @field_validator("focus_work_type", mode="before", check_fields=False)
    @classmethod
    def _normalize_focus_work_type(cls, value: Any) -> Any:
        return normalize_focus_work_type(value)

    @field_validator("snapshot_type", mode="before", check_fields=False)
    @classmethod
    def _normalize_snapshot_type(cls, value: Any) -> Any:
        return normalize_snapshot_type(value)


class DeliberateBankSummary(_NormalizedDeliberateBase):
    id: str
    name: str
    kind: DeliberateKind
    item_count: int = 0
    question_count: int = 0


class DeliberateBankOptionOut(_NormalizedDeliberateBase):
    id: str
    name: str
    kind: DeliberateKind
    count: int
    item_count: int = 0
    question_count: int = 0


class DeliberateWorkflowRunSummary(_NormalizedDeliberateBase):
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


class DeliberateWorkflowConfigOut(_NormalizedDeliberateBase):
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
    children: list[dict[str, Any]] = Field(default_factory=list)
    bank_summary: DeliberateBankSummary | None = None
    latest_run: DeliberateWorkflowRunSummary | None = None
    created_at: str
    updated_at: str


class DeliberateWorkflowConfigCreate(_NormalizedDeliberateBase):
    name: str = Field(min_length=1)
    kind: DeliberateKind
    focus_work_type: DeliberateFocusWorkType
    bank_id: str | None = None
    task_id: str | None = None
    target_count: int = Field(default=10, ge=1, le=500)
    scope: dict[str, Any] = Field(default_factory=dict)
    completion: dict[str, Any] = Field(default_factory=dict)
    pass_criteria: dict[str, Any] = Field(default_factory=dict)
    children: list[dict[str, Any]] = Field(default_factory=list)


class DeliberateWorkflowConfigPatch(_NormalizedDeliberateBase):
    name: str | None = Field(default=None, min_length=1)
    kind: DeliberateKind | None = None
    focus_work_type: DeliberateFocusWorkType | None = None
    bank_id: str | None = None
    task_id: str | None = None
    target_count: int | None = Field(default=None, ge=1, le=500)
    scope: dict[str, Any] | None = None
    completion: dict[str, Any] | None = None
    pass_criteria: dict[str, Any] | None = None
    children: list[dict[str, Any]] | None = None


class DeliberateBankUploadOut(_NormalizedDeliberateBase):
    bank_id: str
    kind: DeliberateKind
    name: str
    item_count: int = 0
    question_count: int = 0
    validation_summary: dict[str, Any] = Field(default_factory=dict)


class DeliberateWorkflowRunOut(DeliberateWorkflowRunSummary):
    config_snapshot: dict[str, Any] = Field(default_factory=dict)
