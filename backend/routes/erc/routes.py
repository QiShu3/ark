from __future__ import annotations

from typing import Annotated, Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from routes.auth_routes import get_current_user

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
)
from .service import (
    get_article_detail,
    get_next_review,
    get_overview,
    list_articles,
    list_mistakes,
    list_sets,
    submit_article_practice,
    submit_review,
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
    response: Response = ...,
) -> ERCOverviewOut:
    response.headers["X-Deprecated"] = "true; use /api/choice/overview?bank_id= instead"
    return ERCOverviewOut(**await get_overview(_pool_from_request(request), user_id=int(user.id), set_id=set_id))


@router.get("/sets", response_model=list[ERCSetOut])
async def route_list_sets(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    response: Response = ...,
) -> list[ERCSetOut]:
    response.headers["X-Deprecated"] = "true; use /api/choice/banks instead"
    _ = user
    return [ERCSetOut(**item) for item in await list_sets(_pool_from_request(request))]


@router.get("/articles", response_model=list[ERCArticleListItemOut])
async def route_list_articles(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    set_id: str | None = Query(default=None),
    exam: str | None = Query(default=None),
    response: Response = ...,
) -> list[ERCArticleListItemOut]:
    response.headers["X-Deprecated"] = "true; use /api/choice/items?bank_id= instead"
    rows = await list_articles(_pool_from_request(request), user_id=int(user.id), set_id=set_id, exam=exam)
    return [ERCArticleListItemOut(**item) for item in rows]


@router.get("/articles/{article_id}", response_model=ERCArticleDetailOut)
async def route_get_article_detail(
    request: Request,
    article_id: str,
    user: Annotated[Any, Depends(get_current_user)],
    response: Response = ...,
) -> ERCArticleDetailOut:
    response.headers["X-Deprecated"] = "true; use /api/choice/items?bank_id= instead"
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


@router.get("/review/next", response_model=ERCReviewNextOut)
async def route_get_next_review(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    set_id: str | None = Query(default=None),
    response: Response = ...,
) -> ERCReviewNextOut:
    response.headers["X-Deprecated"] = "true; use /api/choice/review/next?bank_id= instead"
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
    response: Response = ...,
) -> list[ERCMistakeItemOut]:
    response.headers["X-Deprecated"] = "true; use /api/choice/mistakes?bank_id= instead"
    return [ERCMistakeItemOut(**item) for item in await list_mistakes(_pool_from_request(request), user_id=int(user.id), set_id=set_id)]
