from __future__ import annotations

from typing import Annotated, Any

import asyncpg
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile

from routes.auth_routes import _AuthUser, get_current_user
from routes.choice.repository import (
    count_questions_by_set as count_choice_questions,
    get_subjects_by_set as get_choice_subjects,
    list_questions_by_set as list_choice_questions,
    list_set_rows as list_choice_set_rows,
)
from routes.input.repository import list_all_questions_by_set as list_input_questions, list_input_sets
from routes.vocab.repository import list_admin_deck_words_paginated as list_vocab_words, list_vocab_decks

from . import repository
from .schemas import (
    DeliberateBankOptionOut,
    DeliberateBankSummary,
    DeliberateBankUploadOut,
    DeliberateWorkflowConfigCreate,
    DeliberateWorkflowConfigOut,
    DeliberateWorkflowConfigPatch,
    DeliberateWorkflowRunOut,
    DeliberateWorkflowRunSummary,
)
from .service import import_deliberate_bank, validate_config_shape

router = APIRouter(prefix="/api/admin", tags=["admin-deliberate"])


def _pool(request: Request) -> asyncpg.Pool:
    pool = getattr(getattr(request.app, "state", None), "auth_pool", None)
    if pool is None:
        raise HTTPException(status_code=500, detail="Database not initialized")
    return pool


async def _require_admin(user: Annotated[_AuthUser, Depends(get_current_user)]) -> _AuthUser:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def _bank_summary(conn: asyncpg.Connection, *, kind: str, bank_id: str | None) -> dict[str, Any] | None:
    if not bank_id:
        return None
    if kind == "flashcard":
        row = await conn.fetchrow(
            """
            SELECT d.id::text AS id, d.name, COALESCE(stats.count, 0)::int AS item_count
            FROM vocab_decks d
            LEFT JOIN (
              SELECT deck_id, COUNT(*)::int AS count
              FROM vocab_words
              GROUP BY deck_id
            ) stats ON stats.deck_id = d.id
            WHERE d.id = $1::uuid
            """,
            bank_id,
        )
        if row is None:
            return None
        return DeliberateBankSummary(
            id=row["id"],
            name=row["name"],
            kind="flashcard",
            item_count=row["item_count"],
            question_count=0,
        ).model_dump()
    if kind == "input":
        row = await conn.fetchrow(
            """
            SELECT id::text AS id, name, question_count
            FROM input_sets
            WHERE id = $1::uuid
            """,
            bank_id,
        )
        if row is None:
            return None
        return DeliberateBankSummary(
            id=row["id"],
            name=row["name"],
            kind="input",
            item_count=0,
            question_count=row["question_count"],
        ).model_dump()
    row = await conn.fetchrow(
        """
        SELECT id::text AS id, name, article_count, question_count
        FROM choice_sets
        WHERE id = $1::uuid
        """,
        bank_id,
    )
    if row is None:
        return None
    return DeliberateBankSummary(
        id=row["id"],
        name=row["name"],
        kind="choice",
        item_count=row["article_count"],
        question_count=row["question_count"],
    ).model_dump()


async def _config_out(conn: asyncpg.Connection, row: Any, *, user_id: int) -> DeliberateWorkflowConfigOut:
    latest = await repository.latest_run_for_config(conn, user_id=user_id, config_id=str(row["id"]))
    latest_data = repository.run_to_summary(latest) if latest is not None else None
    summary = await _bank_summary(conn, kind=row["kind"], bank_id=row["bank_id"])
    return DeliberateWorkflowConfigOut(
        **repository.config_to_dict(row, bank_summary=summary, latest_run=latest_data)
    )


@router.get("/deliberate-workflows", response_model=list[DeliberateWorkflowConfigOut])
async def list_deliberate_workflows(
    request: Request,
    admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> list[DeliberateWorkflowConfigOut]:
    pool = _pool(request)
    async with pool.acquire() as conn:
        rows = await repository.list_configs(conn, user_id=int(admin.id))
        return [await _config_out(conn, row, user_id=int(admin.id)) for row in rows]


@router.post("/deliberate-workflows", response_model=DeliberateWorkflowConfigOut)
async def create_deliberate_workflow(
    payload: DeliberateWorkflowConfigCreate,
    request: Request,
    admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> DeliberateWorkflowConfigOut:
    validate_config_shape(payload.kind, payload.focus_work_type, payload.target_count)
    pool = _pool(request)
    async with pool.acquire() as conn:
        row = await repository.create_config(
            conn,
            user_id=int(admin.id),
            name=payload.name.strip(),
            kind=payload.kind,
            focus_work_type=payload.focus_work_type,
            bank_id=payload.bank_id,
            task_id=payload.task_id,
            target_count=payload.target_count,
            scope=payload.scope,
            completion=payload.completion,
        )
        return await _config_out(conn, row, user_id=int(admin.id))


@router.patch("/deliberate-workflows/{config_id}", response_model=DeliberateWorkflowConfigOut)
async def update_deliberate_workflow(
    config_id: str,
    payload: DeliberateWorkflowConfigPatch,
    request: Request,
    admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> DeliberateWorkflowConfigOut:
    patch = payload.model_dump(exclude_unset=True)
    pool = _pool(request)
    async with pool.acquire() as conn:
        current = await repository.get_config(conn, user_id=int(admin.id), config_id=config_id)
        if current is None:
            raise HTTPException(status_code=404, detail="配置不存在")
        next_kind = patch.get("kind", current["kind"])
        next_type = patch.get("focus_work_type", current["focus_work_type"])
        next_count = patch.get("target_count", current["target_count"])
        validate_config_shape(next_kind, next_type, int(next_count))
        row = await repository.update_config(conn, user_id=int(admin.id), config_id=config_id, patch=patch)
        if row is None:
            raise HTTPException(status_code=404, detail="配置不存在")
        return await _config_out(conn, row, user_id=int(admin.id))


@router.delete("/deliberate-workflows/{config_id}")
async def delete_deliberate_workflow(
    config_id: str,
    request: Request,
    admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> dict[str, str]:
    pool = _pool(request)
    async with pool.acquire() as conn:
        ok = await repository.delete_config(conn, user_id=int(admin.id), config_id=config_id)
    if not ok:
        raise HTTPException(status_code=404, detail="配置不存在")
    return {"detail": "配置已删除"}


@router.post("/deliberate-workflows/banks", response_model=DeliberateBankUploadOut)
async def upload_deliberate_bank(
    request: Request,
    admin: Annotated[_AuthUser, Depends(_require_admin)],
    kind: str = Form(...),
    name: str = Form(...),
    description: str = Form(""),
    file: UploadFile = File(...),
) -> DeliberateBankUploadOut:
    file_bytes = await file.read()
    filename = getattr(file, "filename", "unknown.json")
    pool = _pool(request)
    async with pool.acquire() as conn:
        async with conn.transaction():
            result = await import_deliberate_bank(
                conn,
                kind=kind,
                name=name.strip(),
                description=description,
                filename=filename,
                file_bytes=file_bytes,
            )
    return DeliberateBankUploadOut(**result.__dict__)


@router.get("/deliberate-workflows/banks", response_model=list[DeliberateBankOptionOut])
async def list_deliberate_banks(
    request: Request,
    admin: Annotated[_AuthUser, Depends(_require_admin)],
    kind: str = Query(...),
) -> list[DeliberateBankOptionOut]:
    pool = _pool(request)
    async with pool.acquire() as conn:
        if kind == "flashcard":
            rows = await list_vocab_decks(conn)
            return [
                DeliberateBankOptionOut(
                    id=row["id"],
                    name=row["name"],
                    kind="flashcard",
                    count=row["word_count"],
                    item_count=row["word_count"],
                    question_count=0,
                )
                for row in rows
            ]
        if kind == "choice":
            rows = await list_choice_set_rows(conn)
            return [
                DeliberateBankOptionOut(
                    id=row["id"],
                    name=row["name"],
                    kind="choice",
                    count=row["question_count"],
                    item_count=row["article_count"],
                    question_count=row["question_count"],
                )
                for row in rows
            ]
        if kind == "input":
            rows = await list_input_sets(conn)
            return [
                DeliberateBankOptionOut(
                    id=row["id"],
                    name=row["name"],
                    kind="input",
                    count=row["question_count"],
                    item_count=0,
                    question_count=row["question_count"],
                )
                for row in rows
            ]
    raise HTTPException(status_code=400, detail="kind 必须是 flashcard、choice 或 input")


@router.get("/deliberate-workflows/{config_id}/runs", response_model=list[DeliberateWorkflowRunSummary])
async def list_deliberate_runs(
    config_id: str,
    request: Request,
    admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> list[DeliberateWorkflowRunSummary]:
    pool = _pool(request)
    async with pool.acquire() as conn:
        if await repository.get_config(conn, user_id=int(admin.id), config_id=config_id) is None:
            raise HTTPException(status_code=404, detail="配置不存在")
        rows = await repository.list_runs_for_config(conn, user_id=int(admin.id), config_id=config_id)
    return [DeliberateWorkflowRunSummary(**repository.run_to_summary(row)) for row in rows]


@router.get("/deliberate-runs/{run_id}", response_model=DeliberateWorkflowRunOut)
async def get_deliberate_run(
    run_id: str,
    request: Request,
    admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> DeliberateWorkflowRunOut:
    pool = _pool(request)
    async with pool.acquire() as conn:
        row = await repository.get_run(conn, user_id=int(admin.id), run_id=run_id)
    if row is None:
        raise HTTPException(status_code=404, detail="运行档案不存在")
    return DeliberateWorkflowRunOut(**repository.run_to_dict(row))


@router.get("/deliberate-workflows/banks/{bank_id}/preview")
async def get_bank_preview(
    bank_id: str,
    request: Request,
    admin: Annotated[_AuthUser, Depends(_require_admin)],
) -> dict[str, Any]:
    pool = _pool(request)
    async with pool.acquire() as conn:
        choice_row = await conn.fetchrow(
            "SELECT id::text AS id, name, question_count FROM choice_sets WHERE id = $1::uuid",
            bank_id,
        )
        if choice_row:
            questions = await list_choice_questions(conn, set_id=bank_id, limit=10, offset=0)
            total = await count_choice_questions(conn, set_id=bank_id)
            subjects = await get_choice_subjects(conn, set_id=bank_id)
            return {
                "bank_id": bank_id,
                "name": choice_row["name"],
                "kind": "choice",
                "total_count": total,
                "subjects": subjects,
                "questions": [
                    {
                        "id": q["question_pk"],
                        "question_id": q["question_id"],
                        "stem": q["stem"],
                        "type": "choice",
                        "options": q["options_json"],
                        "answer": q["answer"],
                        "subject": q.get("exam", ""),
                        "evidence": q.get("evidence_json", {}),
                        "explanation": q.get("explanation", ""),
                    }
                    for q in questions
                ],
            }

        input_row = await conn.fetchrow(
            "SELECT id::text AS id, name, question_count FROM input_sets WHERE id = $1::uuid",
            bank_id,
        )
        if input_row:
            questions = await list_input_questions(conn, set_id=bank_id, limit=10, offset=0)
            return {
                "bank_id": bank_id,
                "name": input_row["name"],
                "kind": "input",
                "total_count": input_row["question_count"],
                "subjects": [],
                "questions": [
                    {
                        "id": q["id"],
                        "question_id": q["question_id"],
                        "stem": q["stem"],
                        "type": q["mode"],
                        "options": None,
                        "answer": ", ".join(q.get("accepted_answers", [])),
                        "subject": q.get("article_title", ""),
                        "reference_answer": q.get("reference_answer", ""),
                        "explanation": q.get("explanation", ""),
                    }
                    for q in questions
                ],
            }

        vocab_row = await conn.fetchrow(
            "SELECT id::text AS id, name, word_count FROM vocab_decks WHERE id = $1::uuid",
            bank_id,
        )
        if vocab_row:
            words = await list_vocab_words(conn, deck_id=bank_id, limit=10, offset=0)
            return {
                "bank_id": bank_id,
                "name": vocab_row["name"],
                "kind": "flashcard",
                "total_count": vocab_row["word_count"],
                "subjects": [],
                "questions": [
                    {
                        "id": w["id"],
                        "question_id": w["word"],
                        "stem": w["word"],
                        "type": "word",
                        "options": None,
                        "answer": w.get("us_pronunciation", ""),
                        "subject": "",
                    }
                    for w in words
                ],
            }

    raise HTTPException(status_code=404, detail="题库不存在")


@router.get("/deliberate-workflows/banks/{bank_id}/questions")
async def list_bank_questions(
    bank_id: str,
    request: Request,
    admin: Annotated[_AuthUser, Depends(_require_admin)],
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: str = Query(""),
) -> dict[str, Any]:
    pool = _pool(request)
    offset = (page - 1) * limit
    async with pool.acquire() as conn:
        choice_row = await conn.fetchrow(
            "SELECT id::text AS id, name, question_count FROM choice_sets WHERE id = $1::uuid",
            bank_id,
        )
        if choice_row:
            questions = await list_choice_questions(
                conn, set_id=bank_id, limit=limit, offset=offset, search=search or None
            )
            total = await count_choice_questions(conn, set_id=bank_id)
            return {
                "bank_id": bank_id,
                "name": choice_row["name"],
                "kind": "choice",
                "total_count": total,
                "page": page,
                "limit": limit,
                "questions": [
                    {
                        "id": q["question_pk"],
                        "question_id": q["question_id"],
                        "stem": q["stem"],
                        "type": "choice",
                        "options": q["options_json"],
                        "answer": q["answer"],
                        "subject": q.get("exam", ""),
                        "evidence": q.get("evidence_json", {}),
                        "explanation": q.get("explanation", ""),
                    }
                    for q in questions
                ],
            }

        input_row = await conn.fetchrow(
            "SELECT id::text AS id, name, question_count FROM input_sets WHERE id = $1::uuid",
            bank_id,
        )
        if input_row:
            questions = await list_input_questions(
                conn, set_id=bank_id, limit=limit, offset=offset
            )
            return {
                "bank_id": bank_id,
                "name": input_row["name"],
                "kind": "input",
                "total_count": input_row["question_count"],
                "page": page,
                "limit": limit,
                "questions": [
                    {
                        "id": q["id"],
                        "question_id": q["question_id"],
                        "stem": q["stem"],
                        "type": q["mode"],
                        "options": None,
                        "answer": ", ".join(q.get("accepted_answers", [])),
                        "subject": q.get("article_title", ""),
                        "reference_answer": q.get("reference_answer", ""),
                        "explanation": q.get("explanation", ""),
                    }
                    for q in questions
                ],
            }

        vocab_row = await conn.fetchrow(
            "SELECT id::text AS id, name, word_count FROM vocab_decks WHERE id = $1::uuid",
            bank_id,
        )
        if vocab_row:
            words = await list_vocab_words(
                conn, deck_id=bank_id, limit=limit, offset=offset, search=search or None
            )
            return {
                "bank_id": bank_id,
                "name": vocab_row["name"],
                "kind": "flashcard",
                "total_count": vocab_row["word_count"],
                "page": page,
                "limit": limit,
                "questions": [
                    {
                        "id": w["id"],
                        "question_id": w["word"],
                        "stem": w["word"],
                        "type": "word",
                        "options": None,
                        "answer": w.get("us_pronunciation", ""),
                        "subject": "",
                    }
                    for w in words
                ],
            }

    raise HTTPException(status_code=404, detail="题库不存在")
