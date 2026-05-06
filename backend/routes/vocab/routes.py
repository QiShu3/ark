from __future__ import annotations

from typing import Annotated, Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Request

from routes.auth_routes import get_current_user

from .schemas import (
    VocabDeckOut,
    VocabMistakeItemOut,
    VocabReviewQueueItemOut,
    VocabReviewSubmitIn,
    VocabReviewSubmitOut,
    VocabTodaySettingsIn,
    VocabTodaySummaryOut,
    VocabWordDetailOut,
)
from .service import (
    get_learning_queue,
    get_review_queue,
    get_study_queue,
    get_today_summary,
    get_word_detail,
    list_decks,
    list_mistakes,
    submit_review,
    update_today_plan,
)

router = APIRouter(prefix="/api/vocab", tags=["vocab"])


def _pool_from_request(request: Request) -> asyncpg.Pool:
    pool = getattr(getattr(request.app, "state", None), "auth_pool", None)
    if pool is None:
        raise HTTPException(status_code=500, detail="数据库未初始化")
    return pool


@router.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


@router.get("/decks", response_model=list[VocabDeckOut])
async def route_list_decks(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> list[VocabDeckOut]:
    _ = user
    decks = await list_decks(_pool_from_request(request))
    return [VocabDeckOut(**deck) for deck in decks]


@router.get("/decks/{deck_id}/today", response_model=VocabTodaySummaryOut)
async def route_get_today_summary(
    request: Request,
    deck_id: str,
    user: Annotated[Any, Depends(get_current_user)],
) -> VocabTodaySummaryOut:
    payload = await get_today_summary(_pool_from_request(request), user_id=int(user.id), deck_id=deck_id)
    return VocabTodaySummaryOut(**payload)


@router.get("/decks/{deck_id}/study", response_model=list[VocabReviewQueueItemOut])
async def route_get_study_queue(
    request: Request,
    deck_id: str,
    user: Annotated[Any, Depends(get_current_user)],
    limit: int = Query(default=10, ge=1, le=50),
) -> list[VocabReviewQueueItemOut]:
    queue = await get_study_queue(_pool_from_request(request), user_id=int(user.id), deck_id=deck_id, limit=limit)
    return [VocabReviewQueueItemOut(**item) for item in queue]


@router.get("/decks/{deck_id}/learning", response_model=list[VocabReviewQueueItemOut])
async def route_get_learning_queue(
    request: Request,
    deck_id: str,
    user: Annotated[Any, Depends(get_current_user)],
    limit: int = Query(default=10, ge=1, le=50),
) -> list[VocabReviewQueueItemOut]:
    queue = await get_learning_queue(_pool_from_request(request), user_id=int(user.id), deck_id=deck_id, limit=limit)
    return [VocabReviewQueueItemOut(**item) for item in queue]


@router.get("/decks/{deck_id}/review", response_model=list[VocabReviewQueueItemOut])
async def route_get_review_queue(
    request: Request,
    deck_id: str,
    user: Annotated[Any, Depends(get_current_user)],
    limit: int = Query(default=10, ge=1, le=50),
) -> list[VocabReviewQueueItemOut]:
    queue = await get_review_queue(_pool_from_request(request), user_id=int(user.id), deck_id=deck_id, limit=limit)
    return [VocabReviewQueueItemOut(**item) for item in queue]


@router.get("/decks/{deck_id}/mistakes", response_model=list[VocabMistakeItemOut])
async def route_list_mistakes(
    request: Request,
    deck_id: str,
    user: Annotated[Any, Depends(get_current_user)],
    limit: int = Query(default=50, ge=1, le=200),
) -> list[VocabMistakeItemOut]:
    items = await list_mistakes(_pool_from_request(request), user_id=int(user.id), deck_id=deck_id, limit=limit)
    return [VocabMistakeItemOut(**item) for item in items]


@router.post("/reviews", response_model=VocabReviewSubmitOut)
async def route_submit_review(
    payload: VocabReviewSubmitIn,
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> VocabReviewSubmitOut:
    result = await submit_review(
        _pool_from_request(request),
        user_id=int(user.id),
        deck_id=payload.deck_id,
        word_id=payload.word_id,
        result=payload.result,
        review_mode=payload.review_mode,
        prompt_type=payload.prompt_type,
        response_ms=payload.response_ms,
    )
    return VocabReviewSubmitOut(**result)


@router.put("/decks/{deck_id}/today/settings", response_model=VocabTodaySummaryOut)
async def route_update_today_settings(
    deck_id: str,
    payload: VocabTodaySettingsIn,
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> VocabTodaySummaryOut:
    result = await update_today_plan(
        _pool_from_request(request),
        user_id=int(user.id),
        deck_id=deck_id,
        total_target_count=payload.total_target_count,
    )
    return VocabTodaySummaryOut(**result)


@router.get("/words/{word_id}", response_model=VocabWordDetailOut)
async def route_get_word_detail(
    request: Request,
    word_id: str,
    user: Annotated[Any, Depends(get_current_user)],
) -> VocabWordDetailOut:
    detail = await get_word_detail(_pool_from_request(request), user_id=int(user.id), word_id=word_id)
    return VocabWordDetailOut(**detail)
