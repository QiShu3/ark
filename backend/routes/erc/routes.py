from __future__ import annotations

from typing import Annotated, Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Request

from routes.auth_routes import get_current_user
from routes.vocab.schemas import VocabReviewQueueItemOut, VocabReviewSubmitOut

from .schemas import (
    ERCArticleDetailOut,
    ERCArticleListItemOut,
    ERCArticleSubmitIn,
    ERCArticleSubmitOut,
    ERCMistakeItemOut,
    ERCOverviewOut,
    ERCReviewNextOut,
    ERCReviewSubmitIn,
    ERCReviewSubmitOut,
    ERCSetOut,
    ERCVocabularyPreheatSubmitIn,
)
from .service import (
    get_article_detail,
    get_next_review,
    get_overview,
    get_vocabulary_preheat,
    list_articles,
    list_mistakes,
    list_sets,
    submit_article_practice,
    submit_review,
    submit_vocabulary_preheat,
)

router = APIRouter(prefix="/api/erc", tags=["erc"])


def _pool_from_request(request: Request) -> asyncpg.Pool:
    pool = getattr(getattr(request.app, "state", None), "auth_pool", None)
    if pool is None:
        raise HTTPException(status_code=500, detail="数据库未初始化")
    return pool


@router.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


@router.get("/overview", response_model=ERCOverviewOut)
async def route_get_overview(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    set_id: str | None = Query(default=None),
) -> ERCOverviewOut:
    return ERCOverviewOut(**await get_overview(_pool_from_request(request), user_id=int(user.id), set_id=set_id))


@router.get("/sets", response_model=list[ERCSetOut])
async def route_list_sets(request: Request, user: Annotated[Any, Depends(get_current_user)]) -> list[ERCSetOut]:
    _ = user
    return [ERCSetOut(**item) for item in await list_sets(_pool_from_request(request))]


@router.get("/articles", response_model=list[ERCArticleListItemOut])
async def route_list_articles(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    set_id: str | None = Query(default=None),
    exam: str | None = Query(default=None),
) -> list[ERCArticleListItemOut]:
    rows = await list_articles(_pool_from_request(request), user_id=int(user.id), set_id=set_id, exam=exam)
    return [ERCArticleListItemOut(**item) for item in rows]


@router.get("/articles/{article_id}", response_model=ERCArticleDetailOut)
async def route_get_article_detail(
    request: Request,
    article_id: str,
    user: Annotated[Any, Depends(get_current_user)],
) -> ERCArticleDetailOut:
    return ERCArticleDetailOut(
        **await get_article_detail(_pool_from_request(request), user_id=int(user.id), article_id=article_id)
    )


@router.post("/articles/{article_id}/submit", response_model=ERCArticleSubmitOut)
async def route_submit_article(
    article_id: str,
    payload: ERCArticleSubmitIn,
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> ERCArticleSubmitOut:
    result = await submit_article_practice(
        _pool_from_request(request),
        user_id=int(user.id),
        article_id=article_id,
        answers=[item.model_dump() for item in payload.answers],
        time_spent_ms=payload.time_spent_ms,
        started_at=payload.started_at,
    )
    return ERCArticleSubmitOut(**result)


@router.get("/articles/{article_id}/vocabulary/preheat", response_model=list[VocabReviewQueueItemOut])
async def route_get_vocabulary_preheat(
    request: Request,
    article_id: str,
    user: Annotated[Any, Depends(get_current_user)],
    limit: int = Query(default=12, ge=1, le=30),
) -> list[VocabReviewQueueItemOut]:
    queue = await get_vocabulary_preheat(_pool_from_request(request), user_id=int(user.id), article_id=article_id, limit=limit)
    return [VocabReviewQueueItemOut(**item) for item in queue]


@router.post("/articles/{article_id}/vocabulary/reviews", response_model=VocabReviewSubmitOut)
async def route_submit_vocabulary_preheat(
    article_id: str,
    payload: ERCVocabularyPreheatSubmitIn,
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> VocabReviewSubmitOut:
    result = await submit_vocabulary_preheat(
        _pool_from_request(request),
        user_id=int(user.id),
        article_id=article_id,
        deck_id=payload.deck_id,
        word_id=payload.word_id,
        result=payload.result,
        prompt_type=payload.prompt_type,
        response_ms=payload.response_ms,
    )
    return VocabReviewSubmitOut(**result)


@router.get("/review/next", response_model=ERCReviewNextOut)
async def route_get_next_review(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    set_id: str | None = Query(default=None),
) -> ERCReviewNextOut:
    return ERCReviewNextOut(**await get_next_review(_pool_from_request(request), user_id=int(user.id), set_id=set_id))


@router.post("/review/submit", response_model=ERCReviewSubmitOut)
async def route_submit_review(
    payload: ERCReviewSubmitIn,
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> ERCReviewSubmitOut:
    return ERCReviewSubmitOut(
        **await submit_review(
            _pool_from_request(request),
            user_id=int(user.id),
            question_id=payload.question_id,
            chosen_option=payload.chosen_option,
            time_spent_ms=payload.time_spent_ms,
        )
    )


@router.get("/mistakes", response_model=list[ERCMistakeItemOut])
async def route_list_mistakes(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    set_id: str | None = Query(default=None),
) -> list[ERCMistakeItemOut]:
    return [ERCMistakeItemOut(**item) for item in await list_mistakes(_pool_from_request(request), user_id=int(user.id), set_id=set_id)]
