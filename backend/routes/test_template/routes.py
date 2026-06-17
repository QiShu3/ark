"""API endpoints for 模板子应用."""
from typing import Any
from typing import Annotated
from fastapi import APIRouter, Depends, Query, Request
from ..auth_routes import get_current_user
from . import schemas, service

router = APIRouter(prefix="/api/test-template", tags=["test-template"])


def _pool(request: Request) -> Any:
    pool = getattr(getattr(request.app, "state", None), "auth_pool", None)
    if pool is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="Database not initialized")
    return pool


@router.get("/sets", response_model=list[schemas.SetItem])
async def route_list_sets(request: Request, user: Annotated[Any, Depends(get_current_user)]):
    return [schemas.SetItem(**item) for item in await service.list_sets(_pool(request))]


@router.get("/overview", response_model=schemas.OverviewOut)
async def route_get_overview(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    set_id: str | None = Query(default=None),
):
    return schemas.OverviewOut(**await service.get_overview(_pool(request), user_id=int(user.id), set_id=set_id))


@router.get("/review/next", response_model=schemas.ReviewNextOut)
async def route_get_next_review(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    set_id: str | None = Query(default=None),
):
    return schemas.ReviewNextOut(**await service.get_next_review(_pool(request), user_id=int(user.id), set_id=set_id))


@router.post("/review/submit", response_model=schemas.ReviewSubmitOut)
async def route_submit_review(
    payload: schemas.ReviewSubmitIn,
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
):
    return schemas.ReviewSubmitOut(**await service.submit_review(
        _pool(request), user_id=int(user.id),
        question_id=payload.question_id, chosen_option=payload.chosen_option, rating=payload.rating,
    ))


@router.get("/mistakes", response_model=list[schemas.MistakeItem])
async def route_list_mistakes(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    set_id: str | None = Query(default=None),
):
    return [schemas.MistakeItem(**item) for item in await service.list_mistakes(_pool(request), user_id=int(user.id), set_id=set_id)]
