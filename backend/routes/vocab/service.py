from __future__ import annotations

import json
import re
from datetime import UTC, datetime

import asyncpg
from fastapi import HTTPException

from .repository import (
    count_active_mistakes,
    create_daily_plan,
    get_daily_new_limit,
    get_daily_plan,
    get_daily_plan_item,
    get_daily_plan_summary,
    get_user_word_progress,
    get_word_detail_row,
    insert_daily_plan_items,
    insert_review_log,
    list_daily_plan_queue_rows,
    list_due_review_candidate_rows,
    list_mistake_rows,
    list_study_queue_rows,
    list_vocab_decks,
    list_word_phrases,
    list_word_sentences,
    list_word_translations,
    update_daily_plan_item,
    upsert_mistake_bucket,
    upsert_user_word_progress,
)

_SERIAL_SUFFIX_RE = re.compile(r"_(\d+)$")
_DECK_DISPLAY_NAME_MAP = {
    "beishigaozhong": "北师高中",
    "chuzhong": "初中",
    "gaozhong": "高中",
    "kaoyan": "考研",
}


def _deck_group_key(raw_value: str) -> str:
    return _SERIAL_SUFFIX_RE.sub("", raw_value)


def _natural_sort_key(raw_value: str) -> list[int | str]:
    parts = re.split(r"(\d+)", raw_value)
    return [int(part) if part.isdigit() else part.lower() for part in parts if part]


def _deck_display_name(raw_value: str) -> str:
    normalized = raw_value.strip()
    lowered = normalized.lower()
    is_luan = lowered.endswith("luan")
    base_name = normalized[:-4] if is_luan else normalized
    base_key = lowered[:-4] if is_luan else lowered
    display_name = _DECK_DISPLAY_NAME_MAP.get(base_key, base_name)
    if is_luan:
        return f"{display_name}（乱序版）"
    return display_name


def _group_deck_rows(rows: list[asyncpg.Record | dict]) -> list[dict]:
    grouped: dict[str, dict] = {}

    for raw_row in rows:
        row = dict(raw_row)
        group_key = _deck_group_key(str(row["key"]))
        group_name = _deck_group_key(str(row["name"]))
        group = grouped.get(group_key)

        if group is None:
            group = {
                "id": group_key,
                "key": group_key,
                "name": _deck_display_name(group_name),
                "description": f"{_deck_display_name(group_name)} 词书",
                "word_count": 0,
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
                "sort_name": group_name,
                "member_deck_ids": [],
                "member_keys": [],
                "member_names": [],
                "members": [],
            }
            grouped[group_key] = group

        group["word_count"] += int(row["word_count"])
        group["created_at"] = min(group["created_at"], row["created_at"])
        group["updated_at"] = max(group["updated_at"], row["updated_at"])
        group["members"].append(
            {
                "id": str(row["id"]),
                "key": str(row["key"]),
                "name": str(row["name"]),
            }
        )

    items = sorted(grouped.values(), key=lambda item: _natural_sort_key(str(item["sort_name"])))
    for item in items:
        sorted_members = sorted(item["members"], key=lambda member: _natural_sort_key(member["name"]))
        item["member_deck_ids"] = [member["id"] for member in sorted_members]
        item["member_keys"] = [member["key"] for member in sorted_members]
        item["member_names"] = [member["name"] for member in sorted_members]
        item.pop("members", None)
        item.pop("sort_name", None)
        member_count = len(item["member_deck_ids"])
        if member_count > 1:
            item["description"] = f"{item['name']} 词书（{member_count} 册，共 {item['word_count']} 个单词）"
        else:
            item["description"] = f"{item['name']} 词书"
    return items


def _resolve_deck_group(grouped_decks: list[dict], deck_id: str) -> dict:
    for deck in grouped_decks:
        if deck_id == deck["id"] or deck_id == deck["key"]:
            return deck
        if deck_id in deck["member_deck_ids"] or deck_id in deck["member_keys"]:
            return deck
    raise HTTPException(status_code=404, detail="词书不存在")


def _detail_payload(
    base: asyncpg.Record | dict,
    *,
    translations: list[asyncpg.Record],
    phrases: list[asyncpg.Record],
    sentences: list[asyncpg.Record],
) -> dict:
    payload = dict(base)
    payload["translations"] = [dict(item) for item in translations]
    payload["phrases"] = [dict(item) for item in phrases]
    payload["sentences"] = [dict(item) for item in sentences]
    return payload


def _normalize_review_result(result: str) -> str:
    result_key = result.strip().lower()
    if result_key not in {"again", "hard", "good", "easy"}:
        raise HTTPException(status_code=400, detail="无效的复习结果")
    return result_key


def _result_mastery_delta(result_key: str) -> int:
    return {"again": -1, "hard": 1, "good": 2, "easy": 3}[result_key]


def _serialize_fsrs_card(card: object) -> dict:
    if hasattr(card, "to_dict"):
        return dict(card.to_dict())
    if hasattr(card, "to_json"):
        raw_payload = card.to_json()
        if isinstance(raw_payload, str):
            return json.loads(raw_payload)
        return dict(raw_payload)
    if hasattr(card, "model_dump"):
        return dict(card.model_dump(mode="json"))

    payload: dict[str, object] = {}
    for field in ("due", "stability", "difficulty", "elapsed_days", "scheduled_days", "reps", "lapses", "state", "last_review"):
        value = getattr(card, field, None)
        if value is not None:
            payload[field] = value
    return payload


def _deserialize_fsrs_card(raw_payload: object) -> object | None:
    if raw_payload is None:
        return None

    if isinstance(raw_payload, str):
        payload = json.loads(raw_payload)
    else:
        payload = dict(raw_payload)

    from fsrs import Card

    if hasattr(Card, "from_dict"):
        return Card.from_dict(payload)
    if hasattr(Card, "from_json"):
        return Card.from_json(payload)
    return Card(**payload)


def _schedule_fsrs_review(progress: dict, *, result: str, now: datetime) -> dict:
    from fsrs import Card, Rating, Scheduler

    result_key = _normalize_review_result(result)
    scheduler = Scheduler()
    current_card = _deserialize_fsrs_card(progress.get("fsrs_card_json")) or Card()
    rating_name = {"again": "Again", "hard": "Hard", "good": "Good", "easy": "Easy"}[result_key]
    reviewed_card, _review_log = scheduler.review_card(current_card, getattr(Rating, rating_name), review_datetime=now)
    card_json = _serialize_fsrs_card(reviewed_card)
    next_review_at = getattr(reviewed_card, "due", now)

    mastery_score = max(0, int(progress.get("mastery_score", 0)) + _result_mastery_delta(result_key))
    wrong_count = int(progress.get("wrong_count", 0)) + (1 if result_key == "again" else 0)
    correct_count = int(progress.get("correct_count", 0)) + (0 if result_key == "again" else 1)
    lapse_count = int(progress.get("lapse_count", 0)) + (1 if result_key == "again" else 0)
    interval_days = max(int((next_review_at - now).total_seconds() // 86400), 0)

    return {
        "card_json": card_json,
        "mastery_score": mastery_score,
        "wrong_count": wrong_count,
        "correct_count": correct_count,
        "lapse_count": lapse_count,
        "interval_days": interval_days,
        "next_review_at": next_review_at,
        "result": result_key,
    }


async def _ensure_today_plan(conn: asyncpg.Connection, *, user_id: int, deck_group: dict) -> dict:
    today = datetime.now(UTC).date()
    existing_plan = await get_daily_plan(conn, user_id=user_id, deck_key=str(deck_group["key"]), plan_date=today)
    if existing_plan is not None:
        return dict(existing_plan)

    member_deck_ids = list(deck_group["member_deck_ids"])
    daily_new_limit = await get_daily_new_limit(conn, user_id=user_id, deck_ids=member_deck_ids)
    review_rows = await list_due_review_candidate_rows(conn, user_id=user_id, deck_ids=member_deck_ids)

    new_items: list[dict] = []
    remaining_limit = daily_new_limit
    for member_deck_id in member_deck_ids:
        if remaining_limit <= 0:
            break
        rows = await list_study_queue_rows(conn, user_id=user_id, deck_id=member_deck_id, limit=remaining_limit)
        for row in rows:
            new_items.append({"word_id": str(row["id"]), "item_type": "new", "fsrs_due_at_snapshot": None})
        remaining_limit -= len(rows)

    plan_row = await create_daily_plan(
        conn,
        user_id=user_id,
        deck_key=str(deck_group["key"]),
        plan_date=today,
        new_target_count=len(new_items),
        review_target_count=len(review_rows),
    )

    plan_items = [
        {
            "word_id": str(row["id"]),
            "item_type": "review",
            "fsrs_due_at_snapshot": row.get("next_review_at"),
        }
        for row in review_rows
    ]
    plan_items.extend(new_items)
    await insert_daily_plan_items(conn, plan_id=str(plan_row["id"]), items=plan_items)
    return dict(plan_row)


async def list_decks(pool: asyncpg.Pool) -> list[dict]:
    async with pool.acquire() as conn:
        rows = await list_vocab_decks(conn)
    return _group_deck_rows(rows)


async def get_today_summary(pool: asyncpg.Pool, *, user_id: int, deck_id: str) -> dict[str, int]:
    async with pool.acquire() as conn:
        grouped_decks = _group_deck_rows(await list_vocab_decks(conn))
        deck_group = _resolve_deck_group(grouped_decks, deck_id)
        plan = await _ensure_today_plan(conn, user_id=user_id, deck_group=deck_group)
        summary = await get_daily_plan_summary(conn, plan_id=str(plan["id"]))
        if "mistake_count" not in summary:
            summary["mistake_count"] = await count_active_mistakes(
                conn,
                user_id=user_id,
                deck_ids=list(deck_group["member_deck_ids"]),
            )
    return summary


async def get_word_detail(pool: asyncpg.Pool, *, user_id: int, word_id: str) -> dict:
    _ = user_id
    async with pool.acquire() as conn:
        row = await get_word_detail_row(conn, word_id=word_id)
        if row is None:
            raise HTTPException(status_code=404, detail="单词不存在")
        translations = await list_word_translations(conn, word_id=word_id)
        phrases = await list_word_phrases(conn, word_id=word_id)
        sentences = await list_word_sentences(conn, word_id=word_id)
    return _detail_payload(row, translations=translations, phrases=phrases, sentences=sentences)


async def get_review_queue(pool: asyncpg.Pool, *, user_id: int, deck_id: str, limit: int = 10) -> list[dict]:
    async with pool.acquire() as conn:
        grouped_decks = _group_deck_rows(await list_vocab_decks(conn))
        deck_group = _resolve_deck_group(grouped_decks, deck_id)
        plan = await _ensure_today_plan(conn, user_id=user_id, deck_group=deck_group)
        rows = await list_daily_plan_queue_rows(conn, plan_id=str(plan["id"]), item_type="review", limit=limit)
        items: list[dict] = []
        for row in rows:
            word_id = str(row["id"])
            translations = await list_word_translations(conn, word_id=word_id)
            phrases = await list_word_phrases(conn, word_id=word_id)
            sentences = await list_word_sentences(conn, word_id=word_id)
            payload = _detail_payload(row, translations=translations, phrases=phrases, sentences=sentences)
            payload["prompt_type"] = "en_to_zh"
            payload["review_mode"] = "review"
            items.append(payload)
    return items


async def get_study_queue(pool: asyncpg.Pool, *, user_id: int, deck_id: str, limit: int = 10) -> list[dict]:
    async with pool.acquire() as conn:
        grouped_decks = _group_deck_rows(await list_vocab_decks(conn))
        deck_group = _resolve_deck_group(grouped_decks, deck_id)
        plan = await _ensure_today_plan(conn, user_id=user_id, deck_group=deck_group)
        rows = await list_daily_plan_queue_rows(conn, plan_id=str(plan["id"]), item_type="new", limit=limit)
        items: list[dict] = []
        for row in rows:
            word_id = str(row["id"])
            translations = await list_word_translations(conn, word_id=word_id)
            phrases = await list_word_phrases(conn, word_id=word_id)
            sentences = await list_word_sentences(conn, word_id=word_id)
            payload = _detail_payload(row, translations=translations, phrases=phrases, sentences=sentences)
            payload["prompt_type"] = "en_to_zh"
            payload["review_mode"] = "study"
            items.append(payload)
    return items


async def list_mistakes(pool: asyncpg.Pool, *, user_id: int, deck_id: str, limit: int = 50) -> list[dict]:
    async with pool.acquire() as conn:
        grouped_decks = _group_deck_rows(await list_vocab_decks(conn))
        deck_group = _resolve_deck_group(grouped_decks, deck_id)
        rows = await list_mistake_rows(conn, user_id=user_id, deck_ids=list(deck_group["member_deck_ids"]), limit=limit)
        items: list[dict] = []
        for row in rows:
            word_id = str(row["id"])
            translations = await list_word_translations(conn, word_id=word_id)
            phrases = await list_word_phrases(conn, word_id=word_id)
            sentences = await list_word_sentences(conn, word_id=word_id)
            items.append(_detail_payload(row, translations=translations, phrases=phrases, sentences=sentences))
    return items


async def submit_review(
    pool: asyncpg.Pool,
    *,
    user_id: int,
    deck_id: str,
    word_id: str,
    result: str,
    review_mode: str,
    prompt_type: str,
    response_ms: int | None,
) -> dict:
    async with pool.acquire() as conn:
        grouped_decks = _group_deck_rows(await list_vocab_decks(conn))
        deck_group = _resolve_deck_group(grouped_decks, deck_id)
        plan = await _ensure_today_plan(conn, user_id=user_id, deck_group=deck_group)
        plan_item = await get_daily_plan_item(conn, plan_id=str(plan["id"]), word_id=word_id)
        if plan_item is None:
            raise HTTPException(status_code=400, detail="单词不在今日计划中")

        word_row = await get_word_detail_row(conn, word_id=word_id)
        if word_row is None:
            raise HTTPException(status_code=404, detail="单词不存在")

        actual_deck_id = str(word_row["deck_id"])
        if actual_deck_id not in deck_group["member_deck_ids"]:
            raise HTTPException(status_code=400, detail="单词不属于当前词书")

        progress_row = await get_user_word_progress(conn, user_id=user_id, deck_id=actual_deck_id, word_id=word_id)
        current_progress = dict(progress_row) if progress_row is not None else {}
        updated = _schedule_fsrs_review(current_progress, result=result, now=datetime.now(UTC))
        await upsert_user_word_progress(
            conn,
            user_id=user_id,
            deck_id=actual_deck_id,
            word_id=word_id,
            mastery_score=int(updated["mastery_score"]),
            correct_count=int(updated["correct_count"]),
            wrong_count=int(updated["wrong_count"]),
            lapse_count=int(updated["lapse_count"]),
            interval_days=int(updated["interval_days"]),
            next_review_at=updated["next_review_at"],
            fsrs_card_json=updated["card_json"],
            last_result=str(updated["result"]),
        )
        await insert_review_log(
            conn,
            user_id=user_id,
            deck_id=actual_deck_id,
            word_id=word_id,
            review_mode=review_mode,
            prompt_type=prompt_type,
            result=str(updated["result"]),
            response_ms=response_ms,
        )
        await upsert_mistake_bucket(
            conn,
            user_id=user_id,
            deck_id=actual_deck_id,
            word_id=word_id,
            is_active=str(updated["result"]) == "again",
        )
        should_repeat_today = str(updated["result"]) == "again"
        await update_daily_plan_item(
            conn,
            plan_id=str(plan["id"]),
            word_id=word_id,
            status="pending" if should_repeat_today else "done",
            last_result=str(updated["result"]),
        )
    return {
        "mastery_score": int(updated["mastery_score"]),
        "next_review_at": updated["next_review_at"],
        "wrong_count": int(updated["wrong_count"]),
        "correct_count": int(updated["correct_count"]),
        "interval_days": int(updated["interval_days"]),
        "result": str(updated["result"]),
        "should_repeat_today": should_repeat_today,
    }
