from __future__ import annotations

import json
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request

from lib.question_selector import build_question_list
from lib.study_ledger import record_answer
from routes.auth_routes import _AuthUser, get_current_user
from routes.deliberate import repository as deliberate_repository

router = APIRouter(prefix="/api/focus-work/unified", tags=["focus-work-unified"])


def _pool(request: Request):
    pool = getattr(getattr(request.app, "state", None), "auth_pool", None)
    if pool is None:
        raise HTTPException(status_code=500, detail="Database not initialized")
    return pool


def _config_str(snapshot: dict[str, Any], key: str, default: str = "") -> str:
    val = snapshot.get(key, default)
    return str(val) if val is not None else default


def _config_bool(snapshot: dict[str, Any], key: str, default: bool = False) -> bool:
    val = snapshot.get(key, default)
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.lower() in ("true", "1", "yes")
    return bool(val)


def _config_int(snapshot: dict[str, Any], key: str, default: int = 10) -> int:
    val = snapshot.get(key, default)
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


async def _resolve_unified_config_snapshot(
    conn: Any,
    *,
    user_id: int,
    run_focus_work_type: str,
    snapshot: dict[str, Any],
) -> dict[str, Any]:
    resolved = dict(snapshot)

    bank_id = _config_str(resolved, "bank_id", "")
    if not bank_id:
        bank_id = (
            _config_str(resolved, "deck_id", "")
            or _config_str(resolved, "set_id", "")
            or _config_str(resolved, "input_bank_id", "")
        )
        choice_scope = resolved.get("choice_scope")
        if not bank_id and isinstance(choice_scope, dict):
            scoped_bank_id = choice_scope.get("bank_id")
            if scoped_bank_id is not None:
                bank_id = str(scoped_bank_id)
        if bank_id:
            resolved["bank_id"] = bank_id

    config_id = _config_str(resolved, "deliberate_config_id", "") or _config_str(resolved, "config_id", "")
    missing_fields = [
        key for key in ("kind", "target_count", "primary_filter", "sort_order", "use_fsrs", "backflow_rule")
        if key not in resolved
    ]
    if config_id and (not bank_id or missing_fields):
        config_row = await deliberate_repository.get_config(conn, user_id=user_id, config_id=config_id)
        if config_row is not None:
            resolved.setdefault("kind", str(config_row["kind"]))
            resolved.setdefault("focus_work_type", str(config_row["focus_work_type"]))
            resolved.setdefault("target_count", int(config_row["target_count"]))
            resolved.setdefault("primary_filter", str(config_row.get("primary_filter", "all")))
            resolved.setdefault("sort_order", str(config_row.get("sort_order", "sequential")))
            resolved.setdefault("use_fsrs", bool(config_row.get("use_fsrs", False)))
            resolved.setdefault("backflow_rule", str(config_row.get("backflow_rule", "none")))
            if not bank_id and config_row["bank_id"] is not None:
                resolved["bank_id"] = str(config_row["bank_id"])

    resolved.setdefault("kind", run_focus_work_type)
    return resolved


@router.post("/{run_id}/init")
async def init_question_pool(
    run_id: str,
    request: Request,
    user: Annotated[_AuthUser, Depends(get_current_user)],
) -> dict[str, Any]:
    pool = _pool(request)
    async with pool.acquire() as conn:
        run = await conn.fetchrow(
            "SELECT id, user_id, config_snapshot, progress_snapshot, focus_work_type, status "
            "FROM focus_work_runs WHERE id = $1::uuid AND user_id = $2",
            run_id,
            int(user.id),
        )
        if run is None:
            raise HTTPException(status_code=404, detail="专注运行记录不存在")
        if run["status"] != "running":
            raise HTTPException(status_code=400, detail="专注运行已结束")

        config_snapshot = run["config_snapshot"]
        if isinstance(config_snapshot, str):
            config_snapshot = json.loads(config_snapshot)
        if not isinstance(config_snapshot, dict):
            config_snapshot = {}
        config_snapshot = await _resolve_unified_config_snapshot(
            conn,
            user_id=int(user.id),
            run_focus_work_type=str(run["focus_work_type"]),
            snapshot=config_snapshot,
        )

        kind = _config_str(config_snapshot, "kind", run["focus_work_type"])
        bank_id = _config_str(config_snapshot, "bank_id", "")
        target_count = _config_int(config_snapshot, "target_count", 10)
        primary_filter = _config_str(config_snapshot, "primary_filter", "all")
        sort_order = _config_str(config_snapshot, "sort_order", "sequential")
        use_fsrs = _config_bool(config_snapshot, "use_fsrs", False)
        backflow_rule = _config_str(config_snapshot, "backflow_rule", "none")

        if not bank_id:
            raise HTTPException(status_code=400, detail="题库未配置")

        questions, warning = await build_question_list(
            conn,
            kind=kind,
            user_id=int(user.id),
            bank_id=bank_id,
            target_count=target_count,
            primary_filter=primary_filter,
            sort_order=sort_order,
            use_fsrs=use_fsrs,
        )

        def _parse_paragraphs(raw: Any) -> list[str]:
            if raw is None:
                return []
            if isinstance(raw, list):
                return [str(p) for p in raw if p is not None]
            if isinstance(raw, str):
                try:
                    parsed = json.loads(raw)
                    if isinstance(parsed, list):
                        return [str(p) for p in parsed if p is not None]
                except (json.JSONDecodeError, TypeError):
                    pass
                return [raw] if raw.strip() else []
            return []

        question_pool = [
            {
                "index": i,
                "id": str(q.get("question_pk", "")),
                "question_id": q.get("question_id", ""),
                "stem": q.get("stem", ""),
                "options_json": q.get("options_json"),
                "answer": q.get("answer", ""),
                "wrong_count": q.get("wrong_count", 0),
                "right_count": q.get("right_count", 0),
                "answered": False,
                "backflow_count": 0,
                "article_pk": str(q.get("article_pk", "")) if q.get("article_pk") else None,
                "article_title": q.get("article_title", ""),
                "article_paragraphs": _parse_paragraphs(q.get("article_paragraphs")),
                "explanation": q.get("explanation", ""),
            }
            for i, q in enumerate(questions)
        ]

        progress = {
            "unified_question_pool": question_pool,
            "unified_total": len(question_pool),
            "unified_matched": len(questions),
            "unified_warning": warning,
            "unified_kind": kind,
            "unified_primary_filter": primary_filter,
            "unified_sort_order": sort_order,
            "unified_use_fsrs": use_fsrs,
            "unified_backflow_rule": backflow_rule,
            "run_summary": {
                "answered_count": 0,
                "correct_count": 0,
                "total_questions": len(questions),
            },
        }

        await conn.execute(
            "UPDATE focus_work_runs SET progress_snapshot = $1::jsonb, updated_at = NOW() "
            "WHERE id = $2::uuid AND user_id = $3",
            json.dumps(progress, ensure_ascii=False, default=str),
            run_id,
            int(user.id),
        )

        first_question = question_pool[0] if question_pool else None

        return {
            "kind": kind,
            "total": len(question_pool),
            "matched": len(questions),
            "warning": warning,
            "first_question": first_question,
            "target_count": target_count,
        }


@router.get("/{run_id}/next")
async def get_next_question(
    run_id: str,
    request: Request,
    user: Annotated[_AuthUser, Depends(get_current_user)],
) -> dict[str, Any]:
    pool = _pool(request)
    async with pool.acquire() as conn:
        run = await conn.fetchrow(
            "SELECT id, user_id, progress_snapshot, status FROM focus_work_runs "
            "WHERE id = $1::uuid AND user_id = $2",
            run_id,
            int(user.id),
        )
        if run is None:
            raise HTTPException(status_code=404, detail="专注运行记录不存在")

        progress_snapshot = run["progress_snapshot"]
        if isinstance(progress_snapshot, str):
            progress_snapshot = json.loads(progress_snapshot)
        if not isinstance(progress_snapshot, dict):
            progress_snapshot = {}

        pool_data = progress_snapshot.get("unified_question_pool", [])
        if not pool_data:
            return {"question": None, "done": True, "message": "题单为空"}

        for q in pool_data:
            if not q.get("answered"):
                kind = progress_snapshot.get("unified_kind", "")
                return {
                    "question": q,
                    "done": False,
                    "index": q["index"],
                    "kind": kind,
                    "total": len(pool_data),
                    "answered_count": progress_snapshot.get("run_summary", {}).get("answered_count", 0),
                }

        return {"question": None, "done": True, "message": "所有题目已完成"}


@router.post("/{run_id}/submit")
async def submit_answer(
    run_id: str,
    payload: dict[str, Any],
    request: Request,
    user: Annotated[_AuthUser, Depends(get_current_user)],
) -> dict[str, Any]:
    question_id = payload.get("question_id", "")
    is_correct = bool(payload.get("is_correct", False))
    time_spent_ms = int(payload.get("time_spent_ms", 0))
    user_input = str(payload.get("user_input", ""))
    rating = payload.get("rating")  # flashcard four-point rating: again/hard/good/easy

    pool = _pool(request)
    async with pool.acquire() as conn:
        run = await conn.fetchrow(
            "SELECT id, user_id, config_snapshot, progress_snapshot, focus_work_type, status FROM focus_work_runs "
            "WHERE id = $1::uuid AND user_id = $2",
            run_id,
            int(user.id),
        )
        if run is None:
            raise HTTPException(status_code=404, detail="专注运行记录不存在")
        if run["status"] != "running":
            raise HTTPException(status_code=400, detail="专注运行已结束")

        config_snapshot = run["config_snapshot"]
        if isinstance(config_snapshot, str):
            config_snapshot = json.loads(config_snapshot)
        if not isinstance(config_snapshot, dict):
            config_snapshot = {}
        config_snapshot = await _resolve_unified_config_snapshot(
            conn,
            user_id=int(user.id),
            run_focus_work_type=str(run["focus_work_type"]),
            snapshot=config_snapshot,
        )

        progress_snapshot = run["progress_snapshot"]
        if isinstance(progress_snapshot, str):
            progress_snapshot = json.loads(progress_snapshot)
        if not isinstance(progress_snapshot, dict):
            progress_snapshot = {}

        kind = progress_snapshot.get("unified_kind", _config_str(config_snapshot, "kind", ""))
        bank_id = _config_str(config_snapshot, "bank_id", "")
        use_fsrs = _config_bool(config_snapshot, "use_fsrs", False)
        backflow_rule = _config_str(config_snapshot, "backflow_rule", "none")

        if not kind or not bank_id:
            raise HTTPException(status_code=400, detail="配置不完整")

        triggered_action, state = await record_answer(
            conn,
            kind=kind,
            user_id=int(user.id),
            bank_id=bank_id,
            question_pk=question_id,
            is_correct=is_correct,
            use_fsrs=use_fsrs,
            backflow_rule=backflow_rule,
            time_spent_ms=time_spent_ms,
            detail={"user_input": user_input, "backflow_rule": backflow_rule},
            rating=rating,
        )

        pool_data = progress_snapshot.get("unified_question_pool", [])
        run_summary = progress_snapshot.get("run_summary", {})
        run_summary["answered_count"] = (run_summary.get("answered_count", 0)) + 1
        # For flashcards with four-point rating, "correct" means not "again"
        if kind == "flash_card" and rating:
            is_actually_correct = rating != "again"
        else:
            is_actually_correct = is_correct
        if is_actually_correct:
            run_summary["correct_count"] = (run_summary.get("correct_count", 0)) + 1
        run_summary["accuracy"] = (
            run_summary["correct_count"] / run_summary["answered_count"]
            if run_summary["answered_count"] > 0
            else 0.0
        )

        next_question = None
        for q in pool_data:
            if str(q.get("id", "")) == question_id:
                q["answered"] = True
                q["is_correct"] = is_actually_correct
                if rating:
                    q["rating"] = rating
                if triggered_action == "requeue":
                    q["backflow_count"] = q.get("backflow_count", 0) + 1
                    q["answered"] = False
                    pool_data.append(dict(q))
                elif triggered_action == "retry":
                    q["backflow_count"] = q.get("backflow_count", 0) + 1
                    q["answered"] = False

        for q in pool_data:
            if not q.get("answered"):
                next_question = q
                break

        progress_snapshot["unified_question_pool"] = pool_data
        progress_snapshot["run_summary"] = run_summary

        max_target = _config_int(config_snapshot, "target_count", 0)
        answered_count = run_summary.get("answered_count", 0)
        done = (max_target > 0 and answered_count >= max_target and next_question is None)

        await conn.execute(
            "UPDATE focus_work_runs SET progress_snapshot = $1::jsonb, updated_at = NOW() "
            "WHERE id = $2::uuid AND user_id = $3",
            json.dumps(progress_snapshot, ensure_ascii=False, default=str),
            run_id,
            int(user.id),
        )

        backflow_info = None
        if triggered_action == "requeue":
            backflow_info = "答错题已放到队尾"
        elif triggered_action == "retry":
            backflow_info = "请重新作答本题"

        return {
            "is_correct": is_actually_correct,
            "rating": rating,
            "next_question": next_question,
            "done": done,
            "answered_count": answered_count,
            "correct_count": run_summary.get("correct_count", 0),
            "total": len([q for q in pool_data if not q.get("answered") or q.get("backflow_count", 0) > 0]),
            "backflow_action": triggered_action,
            "backflow_info": backflow_info,
            "warning": progress_snapshot.get("unified_warning"),
        }
