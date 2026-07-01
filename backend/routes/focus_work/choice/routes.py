"""API endpoints for the unified choice question bank."""
from __future__ import annotations

import json
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from routes.auth_routes import get_current_user
from routes.focus_work.flash.repository import list_vocab_snapshots

from .adapters import (
    ensure_choice_set,
    get_erc_choice_filters,
    list_choice_items,
    list_erc_as_choice_banks,
    list_erc_as_choice_items,
    resolve_choice_set_id,
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
    SetSnapshotOut,
)
from .service import (
    get_next_review,
    get_overview,
    get_set_snapshots,
    list_mistakes,
)
from .service import (
    submit_review as submit_erc_question_answer,
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
        return await list_erc_as_choice_banks(conn)


@router.get("/filters", response_model=ChoiceFiltersOut)
async def route_get_filters(
    request: Request,
    _user: Annotated[Any, Depends(get_current_user)],
    bank_id: str = Query(..., description="Bank ID (choice_set)"),
    year: int | None = Query(default=None),
    subject: str | None = Query(default=None),
    tag: str | None = Query(default=None),
) -> ChoiceFiltersOut:
    pool = _pool(request)
    async with pool.acquire() as conn:
        return await get_erc_choice_filters(conn, bank_id=bank_id, year=year, subject=subject)


@router.get("/items", response_model=list[ChoiceItemOut])
async def route_list_items(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    bank_id: str = Query(...),
    year: int | None = Query(default=None),
    subject: str | None = Query(default=None),
    tag: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    exclude_answered: bool = Query(default=False),
) -> list[ChoiceItemOut]:
    pool = _pool(request)
    async with pool.acquire() as conn:
        return await list_erc_as_choice_items(
            conn,
            bank_id=bank_id,
            year=year,
            subject=subject,
            limit=limit,
            offset=offset,
            user_id=int(user.id),
            exclude_answered=exclude_answered,
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
            "SELECT id, name FROM choice_sets WHERE id = $1::uuid AND is_published = TRUE",
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
        choice_set_id = await ensure_choice_set(conn, bank_id)
    result = await get_overview(pool, user_id=int(user.id), set_id=choice_set_id)
    return ChoiceOverviewOut(**result)


@router.get("/review/next", response_model=ChoiceReviewNextOut)
async def route_choice_review_next(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    bank_id: str = Query(...),
) -> ChoiceReviewNextOut:
    pool = _pool(request)
    async with pool.acquire() as conn:
        choice_set_id = await ensure_choice_set(conn, bank_id)
    result = await get_next_review(pool, user_id=int(user.id), set_id=choice_set_id)
    return ChoiceReviewNextOut(**result)


@router.get("/mistakes", response_model=list[ChoiceMistakeItemOut])
async def route_choice_mistakes(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    bank_id: str = Query(...),
) -> list[ChoiceMistakeItemOut]:
    pool = _pool(request)
    async with pool.acquire() as conn:
        choice_set_id = await ensure_choice_set(conn, bank_id)
    rows = await list_mistakes(pool, user_id=int(user.id), set_id=choice_set_id)
    return [ChoiceMistakeItemOut(**row) for row in rows]


@router.get("/snapshots", response_model=list[SetSnapshotOut])
async def route_list_snapshots(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    bank_id: str = Query(...),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[SetSnapshotOut]:
    pool = _pool(request)
    async with pool.acquire() as conn:
        # Check if it's a choice_set
        resolved = await resolve_choice_set_id(conn, bank_id)
        if resolved is not None:
            rows = await get_set_snapshots(pool, user_id=int(user.id), set_id=resolved, limit=limit, offset=offset)
            return [SetSnapshotOut(**row) for row in rows]

        # Check if it's a vocab_deck directly
        deck_row = await conn.fetchrow(
            "SELECT id::text FROM vocab_decks WHERE id = $1::uuid",
            bank_id,
        )
        deck_id = deck_row["id"] if deck_row else None

        # If not found, check if it's a content_banks ID (vocab type) and resolve to vocab_decks
        if deck_id is None:
            cb_row = await conn.fetchrow(
                "SELECT id::text, item_type, fw_type FROM content_banks WHERE id = $1::uuid",
                bank_id,
            )
            if cb_row and cb_row["item_type"] == "word":
                # Find matching vocab_decks by name
                vd_row = await conn.fetchrow(
                    """
                    SELECT vd.id::text FROM vocab_decks vd
                    JOIN content_banks cb ON cb.name = vd.name
                    WHERE cb.id = $1::uuid
                    """,
                    bank_id,
                )
                if vd_row:
                    deck_id = vd_row["id"]

        if deck_id is not None:
            rows = await list_vocab_snapshots(
                conn, user_id=int(user.id), deck_id=deck_id, limit=limit, offset=offset,
            )
            result: list[SetSnapshotOut] = []
            for r in rows:
                by_mastery = r["by_mastery"]
                due_status = r["due_status"]
                focus_stats = r["focus_stats"]
                if isinstance(by_mastery, str):
                    by_mastery = json.loads(by_mastery)
                if isinstance(due_status, str):
                    due_status = json.loads(due_status)
                if isinstance(focus_stats, str):
                    focus_stats = json.loads(focus_stats)
                result.append(SetSnapshotOut(
                    id=str(r["id"]),
                    set_id=str(r["deck_id"]),
                    total_questions=r["total_words"],
                    total_articles=0,
                    by_state=by_mastery,
                    mastery={},
                    fsrs_stats={},
                    due_status=due_status,
                    focus_stats=focus_stats,
                    trigger_reason=r["trigger_reason"],
                    focus_run_id=r["focus_run_id"],
                    created_at=r["created_at"].isoformat() if r["created_at"] else "",
                ))
            return result

        raise HTTPException(status_code=422, detail="题库不存在")
