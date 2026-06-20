"""API endpoints for the unified choice question bank."""
from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from routes.auth_routes import get_current_user
from routes.erc.service import (
    get_next_review,
    get_overview,
    list_mistakes,
)
from routes.erc.service import (
    submit_review as submit_erc_question_answer,
)

from .adapters import (
    ensure_erc_set_synced,
    get_choice_filters,
    get_erc_choice_filters,
    list_choice_banks,
    list_choice_items,
    list_erc_as_choice_banks,
    list_erc_as_choice_items,
)
from .schemas import (
    ChoiceAnswerSubmitIn,
    ChoiceAnswerSubmitOut,
    ChoiceBankOut,
    ChoiceFiltersOut,
    ChoiceItemOut,
    ChoiceMistakeItemOut,
    ChoiceOverviewOut,
    ChoicePracticeCompletion,
    ChoicePracticeScope,
    ChoicePracticeStartRequest,
    ChoicePracticeStartResponse,
    ChoiceReviewNextOut,
)

router = APIRouter(prefix="/api/choice", tags=["choice"])


def _pool(request: Request) -> Any:
    pool = getattr(getattr(request.app, "state", None), "auth_pool", None)
    if pool is None:
        from fastapi import HTTPException as _Exc
        raise _Exc(status_code=500, detail="Database not initialized")
    return pool


@router.get("/banks", response_model=list[ChoiceBankOut])
async def route_list_banks(
    request: Request,
    _user: Annotated[Any, Depends(get_current_user)],
) -> list[ChoiceBankOut]:
    pool = _pool(request)
    async with pool.acquire() as conn:
        choice_banks = await list_choice_banks(conn)
        erc_banks = await list_erc_as_choice_banks(conn)
    return choice_banks + erc_banks


@router.get("/filters", response_model=ChoiceFiltersOut)
async def route_get_filters(
    request: Request,
    _user: Annotated[Any, Depends(get_current_user)],
    bank_id: str = Query(..., description="Bank ID (content_bank or erc_set)"),
    year: int | None = Query(default=None),
    subject: str | None = Query(default=None),
    tag: str | None = Query(default=None),
) -> ChoiceFiltersOut:
    pool = _pool(request)
    async with pool.acquire() as conn:
        erc_row = await conn.fetchrow(
            "SELECT id FROM erc_sets WHERE id = $1::uuid AND is_published = TRUE",
            bank_id,
        )
        if erc_row is not None:
            return await get_erc_choice_filters(conn, bank_id=bank_id, year=year, subject=subject)
        return await get_choice_filters(conn, bank_id=bank_id, year=year, subject=subject, tag=tag)


@router.get("/items", response_model=list[ChoiceItemOut])
async def route_list_items(
    request: Request,
    _user: Annotated[Any, Depends(get_current_user)],
    bank_id: str = Query(...),
    year: int | None = Query(default=None),
    subject: str | None = Query(default=None),
    tag: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> list[ChoiceItemOut]:
    pool = _pool(request)
    async with pool.acquire() as conn:
        erc_row = await conn.fetchrow(
            "SELECT id FROM erc_sets WHERE id = $1::uuid AND is_published = TRUE",
            bank_id,
        )
        if erc_row is not None:
            return await list_erc_as_choice_items(
                conn, bank_id=bank_id, year=year, subject=subject, limit=limit, offset=offset,
            )
        return await list_choice_items(
            conn, bank_id=bank_id, year=year, subject=subject, tag=tag, limit=limit, offset=offset,
        )


# ---- Scope-based practice start ----

def _build_scope_completion_from_legacy(
    focus_work_type: str,
    bank_id: str | None,
    target_count: int,
) -> tuple[ChoicePracticeScope, ChoicePracticeCompletion]:
    scope = ChoicePracticeScope(bank_id=bank_id or "", status="all", mode="sequential")
    completion = ChoicePracticeCompletion(mode="question_count", question_count=max(1, target_count))
    return scope, completion


@router.post("/practice/start", response_model=ChoicePracticeStartResponse)
async def route_start_practice(
    request: Request,
    body: ChoicePracticeStartRequest,
    user: Annotated[Any, Depends(get_current_user)],
) -> ChoicePracticeStartResponse:
    pool = _pool(request)
    scope = body.scope
    completion = body.completion

    if not scope.bank_id:
        raise HTTPException(status_code=400, detail="bank_id is required")

    async with pool.acquire() as conn:
        erc_row = await conn.fetchrow(
            "SELECT id, name FROM erc_sets WHERE id = $1::uuid AND is_published = TRUE",
            scope.bank_id,
        )
        if erc_row is not None:
            items = await list_erc_as_choice_items(
                conn, bank_id=scope.bank_id, year=scope.years[0] if scope.years else None,
                subject=scope.subjects[0] if scope.subjects else None, limit=200,
            )
        else:
            items = await list_choice_items(
                conn, bank_id=scope.bank_id, year=scope.years[0] if scope.years else None,
                subject=scope.subjects[0] if scope.subjects else None,
                tag=scope.tags[0] if scope.tags else None, limit=200,
            )

    total_questions = sum(it.question_count for it in items)

    return ChoicePracticeStartResponse(
        workflow_id="pending",
        scope_snapshot=scope.model_dump(),
        completion_snapshot=completion.model_dump(),
        total_in_scope=total_questions,
    )


@router.post("/questions/{question_id}/submit", response_model=ChoiceAnswerSubmitOut)
async def route_submit_choice_answer(
    question_id: str,
    body: ChoiceAnswerSubmitIn,
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> ChoiceAnswerSubmitOut:
    result = await submit_erc_question_answer(
        _pool(request),
        user_id=int(user.id),
        question_id=question_id,
        chosen_option=body.chosen_option,
        time_spent_ms=body.time_spent_ms,
        mode="practice",
    )
    return ChoiceAnswerSubmitOut(**result)


# ---- Overview / Review / Mistakes (delegated to ERC service) ----

@router.get("/overview", response_model=ChoiceOverviewOut)
async def route_choice_overview(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    bank_id: str = Query(...),
) -> ChoiceOverviewOut:
    pool = _pool(request)
    async with pool.acquire() as conn:
        erc_set_id = await ensure_erc_set_synced(conn, bank_id)
    result = await get_overview(pool, user_id=int(user.id), set_id=erc_set_id)
    return ChoiceOverviewOut(**result)


@router.get("/review/next", response_model=ChoiceReviewNextOut)
async def route_choice_review_next(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    bank_id: str = Query(...),
) -> ChoiceReviewNextOut:
    pool = _pool(request)
    async with pool.acquire() as conn:
        erc_set_id = await ensure_erc_set_synced(conn, bank_id)
    result = await get_next_review(pool, user_id=int(user.id), set_id=erc_set_id)
    return ChoiceReviewNextOut(**result)


@router.get("/mistakes", response_model=list[ChoiceMistakeItemOut])
async def route_choice_mistakes(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    bank_id: str = Query(...),
) -> list[ChoiceMistakeItemOut]:
    pool = _pool(request)
    async with pool.acquire() as conn:
        erc_set_id = await ensure_erc_set_synced(conn, bank_id)
    rows = await list_mistakes(pool, user_id=int(user.id), set_id=erc_set_id)
    return [ChoiceMistakeItemOut(**row) for row in rows]
