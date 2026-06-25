from __future__ import annotations

import json
from typing import Annotated, Any

import asyncpg
from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile

from routes.auth_routes import _AuthUser, get_current_user

from . import repository
from .schemas import (
    InputBankUploadOut,
    InputNextOut,
    InputSetOptionOut,
    InputSubmitIn,
    InputSubmitOut,
)
from .service import import_input_bank, submit_answer

router = APIRouter(prefix="/api/input", tags=["input"])


def _pool(request: Request) -> asyncpg.Pool:
    pool = getattr(getattr(request.app, "state", None), "auth_pool", None)
    if pool is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="Database not initialized")
    return pool


def _parse_json_field(value: Any, default: Any = None) -> Any:
    if value is None:
        return default
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return default
    return value


def _question_to_dict(record: asyncpg.Record) -> dict[str, Any]:
    accepted = _parse_json_field(record.get("accepted_answers"), [])
    return {
        "id": str(record["id"]),
        "question_id": record["question_id"],
        "question_no": record["question_no"],
        "stem": record["stem"],
        "mode": record["mode"],
        "input_config": _parse_json_field(record.get("input_config"), {}),
        "accepted_answers": accepted,
        "match_rule": record.get("match_rule") or "exact",
        "case_sensitive": record.get("case_sensitive") or False,
        "rubric": record.get("rubric") or "",
        "reference_answer": record.get("reference_answer") or "",
        "explanation": record.get("explanation") or "",
        "sort_order": record.get("sort_order") or 0,
    }


@router.get("/banks", response_model=list[InputSetOptionOut])
async def list_banks(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
) -> list[InputSetOptionOut]:
    pool = _pool(request)
    async with pool.acquire() as conn:
        rows = await repository.list_input_sets(conn)
    return [InputSetOptionOut(id=r["id"], name=r["name"], count=r["question_count"]) for r in rows]


@router.post("/banks", response_model=InputBankUploadOut)
async def upload_bank(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    name: str = Form(...),
    description: str = Form(""),
    file: UploadFile = File(...),
) -> InputBankUploadOut:
    file_bytes = await file.read()
    filename = getattr(file, "filename", "unknown.json")
    pool = _pool(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            result = await import_input_bank(
                conn,
                name=name.strip(),
                description=description,
                filename=filename,
                file_bytes=file_bytes,
            )
    return InputBankUploadOut(**result)


@router.get("/next", response_model=InputNextOut)
async def get_next(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    bank_id: str = Query(...),
) -> InputNextOut:
    pool = _pool(request)
    async with pool.acquire() as conn:
        questions = await repository.list_all_questions_by_set(conn, set_id=bank_id, limit=200)
        if not questions:
            return InputNextOut(has_item=False, article=None, current_question_index=0)

        articles_map: dict[str, dict[str, Any]] = {}
        for q in questions:
            akey = q["article_id"]
            if akey not in articles_map:
                paragraphs = await repository.list_paragraphs_by_article(conn, q["article_pk"])
                articles_map[akey] = {
                    "id": q["article_pk"],
                    "article_id": akey,
                    "title": q.get("article_title") or "",
                    "paragraphs": [
                        {"id": str(p["id"]), "paragraph_no": p["paragraph_no"], "text": p["text"]}
                        for p in paragraphs
                    ],
                    "questions": [],
                }
            articles_map[akey]["questions"].append(_question_to_dict(q))

        first_article = next(iter(articles_map.values()))
        return InputNextOut(
            has_item=True,
            article=first_article,
            current_question_index=0,
        )


@router.post("/submit", response_model=InputSubmitOut)
async def submit(
    request: Request,
    user: Annotated[_AuthUser, Depends(get_current_user)],
    body: InputSubmitIn,
) -> InputSubmitOut:
    pool = _pool(request)
    async with pool.acquire() as conn:
        result = await submit_answer(
            conn,
            user_id=int(user.id),
            question_id=body.question_id,
            user_input=body.user_input,
            time_spent_ms=body.time_spent_ms,
        )
    return InputSubmitOut(**result)


@router.get("/snapshots")
async def get_snapshots(
    request: Request,
    user: Annotated[Any, Depends(get_current_user)],
    bank_id: str = Query(...),
    limit: int = Query(20, ge=1, le=100),
) -> list[dict[str, Any]]:
    pool = _pool(request)
    async with pool.acquire() as conn:
        rows = await repository.list_input_snapshots(
            conn, user_id=int(user.id), set_id=bank_id, limit=limit
        )
    results = []
    for row in rows:
        d = dict(row)
        for key in ("mode_breakdown", "wrong_question_ids", "focus_stats"):
            if isinstance(d.get(key), str):
                try:
                    d[key] = json.loads(d[key])
                except (json.JSONDecodeError, TypeError):
                    d[key] = {} if key != "wrong_question_ids" else []
        results.append(d)
    return results
