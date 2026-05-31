from __future__ import annotations

import json
import re
from datetime import UTC, datetime, timedelta
from math import floor

import asyncpg
from fastapi import HTTPException

from .repository import (
    count_active_mistakes,
    count_global_mastered_word_keys,
    count_memorized_words,
    create_daily_plan,
    delete_pending_daily_plan_items,
    get_daily_plan,
    get_daily_plan_item,
    get_daily_plan_summary,
    get_daily_total_target,
    get_user_word_progress,
    get_word_detail_row,
    insert_daily_plan_items,
    insert_review_log,
    list_daily_plan_queue_rows,
    list_daily_plan_word_ids,
    list_deck_mastery_rows,
    list_deck_word_rows,
    list_due_review_candidate_rows,
    list_inheritable_mastered_progress_rows,
    list_mastered_word_rows,
    list_mistake_rows,
    list_study_queue_rows,
    list_vocab_decks,
    list_word_phrases,
    list_word_sentences,
    list_word_translations,
    update_daily_plan_item,
    upsert_daily_total_target,
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
_LEARNING_STATE_VALUES = {1, 3}
_REVIEW_STATE_VALUES = {"2", "review", "Review"}


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


def _ratio_targets(total_target: int) -> dict[str, int]:
    ratios = [("learning", 0.3), ("review", 0.1), ("new", 0.6)]
    base_targets: dict[str, int] = {}
    remainders: list[tuple[float, str]] = []

    assigned = 0
    for key, ratio in ratios:
        raw_value = total_target * ratio
        base_value = floor(raw_value)
        base_targets[key] = base_value
        assigned += base_value
        remainders.append((raw_value - base_value, key))

    missing = max(total_target - assigned, 0)
    for _remainder, key in sorted(remainders, key=lambda item: item[0], reverse=True)[:missing]:
        base_targets[key] += 1
    return base_targets


def _split_due_rows(rows: list[asyncpg.Record | dict]) -> tuple[list[dict], list[dict]]:
    learning_rows: list[dict] = []
    review_rows: list[dict] = []
    for raw_row in rows:
        row = dict(raw_row)
        fsrs_payload = row.get("fsrs_card_json") or {}
        state_value = None
        if isinstance(fsrs_payload, str):
            try:
                fsrs_payload = json.loads(fsrs_payload)
            except Exception:
                fsrs_payload = {}
        if isinstance(fsrs_payload, dict):
            state_value = fsrs_payload.get("state")

        if state_value in _LEARNING_STATE_VALUES:
            learning_rows.append(row)
        else:
            review_rows.append(row)
    return learning_rows, review_rows


def _take_rows(pool: list[dict], count: int) -> tuple[list[dict], list[dict]]:
    if count <= 0:
        return [], pool
    return pool[:count], pool[count:]


async def _build_today_plan_items(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    deck_group: dict,
    remaining_target: int,
    excluded_word_ids: set[str],
) -> list[dict]:
    member_deck_ids = list(deck_group["member_deck_ids"])
    due_rows = await list_due_review_candidate_rows(conn, user_id=user_id, deck_ids=member_deck_ids)
    filtered_due_rows = [dict(row) for row in due_rows if str(row["id"]) not in excluded_word_ids]
    learning_pool, review_pool = _split_due_rows(filtered_due_rows)

    new_pool: list[dict] = []
    remaining_scan_limit = remaining_target
    for member_deck_id in member_deck_ids:
        if remaining_scan_limit <= 0:
            break
        rows = await list_study_queue_rows(conn, user_id=user_id, deck_id=member_deck_id, limit=remaining_scan_limit)
        for row in rows:
            if str(row["id"]) in excluded_word_ids:
                continue
            new_pool.append(dict(row))
        remaining_scan_limit -= len(rows)

    targets = _ratio_targets(remaining_target)
    chosen_learning, learning_left = _take_rows(learning_pool, targets["learning"])
    chosen_review, review_left = _take_rows(review_pool, targets["review"])
    chosen_new, new_left = _take_rows(new_pool, targets["new"])

    selected = [
        {"word_id": str(row["id"]), "item_type": "learning", "fsrs_due_at_snapshot": row.get("next_review_at")}
        for row in chosen_learning
    ]
    selected.extend(
        {"word_id": str(row["id"]), "item_type": "review", "fsrs_due_at_snapshot": row.get("next_review_at")}
        for row in chosen_review
    )
    selected.extend(
        {"word_id": str(row["id"]), "item_type": "new", "fsrs_due_at_snapshot": None}
        for row in chosen_new
    )

    still_needed = max(remaining_target - len(selected), 0)
    fallback_rows = (
        [("learning", row) for row in learning_left]
        + [("review", row) for row in review_left]
        + [("new", row) for row in new_left]
    )
    for item_type, row in fallback_rows[:still_needed]:
        selected.append(
            {
                "word_id": str(row["id"]),
                "item_type": item_type,
                "fsrs_due_at_snapshot": row.get("next_review_at") if item_type != "new" else None,
            }
        )

    return selected


def _aggregate_group_mastery(deck_group: dict, deck_stats: dict[str, dict]) -> dict[str, int | str]:
    total_word_count = 0
    mastered_word_count = 0
    learning_word_count = 0
    unstarted_word_count = 0

    for member_deck_id in deck_group["member_deck_ids"]:
        stats = deck_stats.get(member_deck_id, {})
        total_word_count += int(stats.get("total_word_count", 0))
        mastered_word_count += int(stats.get("mastered_word_count", 0))
        learning_word_count += int(stats.get("learning_word_count", 0))
        unstarted_word_count += int(stats.get("unstarted_word_count", 0))

    return {
        "deck_id": str(deck_group["id"]),
        "deck_name": str(deck_group["name"]),
        "total_word_count": total_word_count,
        "mastered_word_count": mastered_word_count,
        "learning_word_count": learning_word_count,
        "unstarted_word_count": unstarted_word_count,
    }


def _is_review_state(raw_state: object) -> bool:
    return str(raw_state).strip() in _REVIEW_STATE_VALUES


def _word_mastery_state(raw_state: object) -> str:
    if _is_review_state(raw_state):
        return "mastered"
    if str(raw_state).strip():
        return "learning"
    return "unstarted"


def _append_translation_unique(target: list[dict], *, pos: object, translation: object) -> None:
    if translation is None:
        return
    item = {
        "pos": str(pos) if pos not in {None, ""} else None,
        "translation": str(translation),
    }
    if item not in target:
        target.append(item)


def _normalize_inherited_progress_row(row: dict, *, now: datetime) -> dict:
    next_review_at = row.get("next_review_at") or now
    if next_review_at <= now:
        next_review_at = now.replace(microsecond=0) + timedelta(days=1)

    card_json = row.get("fsrs_card_json")
    if isinstance(card_json, str):
        card_json = json.loads(card_json)
    card_payload = dict(card_json or {})
    card_payload["state"] = card_payload.get("state") or "review"
    card_payload["due"] = next_review_at.isoformat()

    return {
        "mastery_score": max(int(row.get("mastery_score", 0)), 1),
        "correct_count": max(int(row.get("correct_count", 0)), 1),
        "wrong_count": int(row.get("wrong_count", 0)),
        "lapse_count": int(row.get("lapse_count", 0)),
        "interval_days": max(int((next_review_at - now).total_seconds() // 86400), 1),
        "next_review_at": next_review_at,
        "last_result": str(row.get("last_result") or "good"),
        "fsrs_card_json": card_payload,
    }


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
    daily_total_target = await get_daily_total_target(conn, user_id=user_id, deck_ids=member_deck_ids)
    plan_items = await _build_today_plan_items(
        conn,
        user_id=user_id,
        deck_group=deck_group,
        remaining_target=daily_total_target,
        excluded_word_ids=set(),
    )

    plan_row = await create_daily_plan(
        conn,
        user_id=user_id,
        deck_key=str(deck_group["key"]),
        plan_date=today,
        new_target_count=sum(1 for item in plan_items if item["item_type"] == "new"),
        review_target_count=sum(1 for item in plan_items if item["item_type"] in {"learning", "review"}),
    )
    await insert_daily_plan_items(conn, plan_id=str(plan_row["id"]), items=plan_items)
    return dict(plan_row)


async def list_decks(pool: asyncpg.Pool, *, published_only: bool = False) -> list[dict]:
    async with pool.acquire() as conn:
        rows = await list_vocab_decks(conn, published_only=published_only)
    return _group_deck_rows(rows)


async def get_today_summary(pool: asyncpg.Pool, *, user_id: int, deck_id: str) -> dict[str, int]:
    async with pool.acquire() as conn:
        grouped_decks = _group_deck_rows(await list_vocab_decks(conn))
        deck_group = _resolve_deck_group(grouped_decks, deck_id)
        member_deck_ids = list(deck_group["member_deck_ids"])
        plan = await _ensure_today_plan(conn, user_id=user_id, deck_group=deck_group)
        summary = await get_daily_plan_summary(conn, plan_id=str(plan["id"]))
        summary["daily_target_count"] = await get_daily_total_target(
            conn,
            user_id=user_id,
            deck_ids=member_deck_ids,
        )
        summary["memorized_count"] = await count_memorized_words(
            conn,
            user_id=user_id,
            deck_ids=member_deck_ids,
        )
        if "mistake_count" not in summary:
            summary["mistake_count"] = await count_active_mistakes(
                conn,
                user_id=user_id,
                deck_ids=member_deck_ids,
            )
    return summary


async def get_overview(pool: asyncpg.Pool, *, user_id: int, deck_id: str) -> dict:
    async with pool.acquire() as conn:
        grouped_decks = _group_deck_rows(await list_vocab_decks(conn))
        deck_group = _resolve_deck_group(grouped_decks, deck_id)
        deck_mastery_rows = await list_deck_mastery_rows(conn, user_id=user_id)
        total_mastered_word_count = await count_global_mastered_word_keys(conn, user_id=user_id)
        deck_stats = {str(row["deck_id"]): dict(row) for row in deck_mastery_rows}

    completed_deck_count = 0
    current_deck_snapshot: dict | None = None

    for grouped_deck in grouped_decks:
        snapshot = _aggregate_group_mastery(grouped_deck, deck_stats)
        if int(snapshot["total_word_count"]) > 0 and int(snapshot["mastered_word_count"]) == int(snapshot["total_word_count"]):
            completed_deck_count += 1
        if grouped_deck["id"] == deck_group["id"]:
            current_deck_snapshot = snapshot

    if current_deck_snapshot is None:
        current_deck_snapshot = _aggregate_group_mastery(deck_group, deck_stats)

    return {
        "completed_deck_count": completed_deck_count,
        "total_deck_count": len(grouped_decks),
        "mastered_word_count": total_mastered_word_count,
        "current_deck": current_deck_snapshot,
    }


async def list_overview_completed_decks(pool: asyncpg.Pool, *, user_id: int, deck_id: str) -> list[dict]:
    async with pool.acquire() as conn:
        grouped_decks = _group_deck_rows(await list_vocab_decks(conn))
        _resolve_deck_group(grouped_decks, deck_id)
        deck_mastery_rows = await list_deck_mastery_rows(conn, user_id=user_id)
        deck_stats = {str(row["deck_id"]): dict(row) for row in deck_mastery_rows}

    completed: list[dict] = []
    for grouped_deck in grouped_decks:
        snapshot = _aggregate_group_mastery(grouped_deck, deck_stats)
        if int(snapshot["total_word_count"]) > 0 and int(snapshot["mastered_word_count"]) == int(snapshot["total_word_count"]):
            completed.append(snapshot)
    return completed


async def list_overview_mastered_words(pool: asyncpg.Pool, *, user_id: int, deck_id: str) -> list[dict]:
    async with pool.acquire() as conn:
        grouped_decks = _group_deck_rows(await list_vocab_decks(conn))
        _resolve_deck_group(grouped_decks, deck_id)
        rows = await list_mastered_word_rows(conn, user_id=user_id)

    items: dict[str, dict] = {}
    for raw_row in rows:
        row = dict(raw_row)
        word_key = str(row["word_key"])
        item = items.get(word_key)
        if item is None:
            item = {
                "id": str(row["id"]),
                "word": str(row["word"]),
                "us_pronunciation": row.get("us_pronunciation"),
                "uk_pronunciation": row.get("uk_pronunciation"),
                "translations": [],
                "source_deck_names": [],
            }
            items[word_key] = item

        if not item["us_pronunciation"] and row.get("us_pronunciation"):
            item["us_pronunciation"] = row.get("us_pronunciation")
        if not item["uk_pronunciation"] and row.get("uk_pronunciation"):
            item["uk_pronunciation"] = row.get("uk_pronunciation")

        source_deck_name = _deck_display_name(_deck_group_key(str(row["deck_name"])))
        if source_deck_name not in item["source_deck_names"]:
            item["source_deck_names"].append(source_deck_name)
        _append_translation_unique(item["translations"], pos=row.get("pos"), translation=row.get("translation"))

    return list(items.values())


async def list_overview_current_words(
    pool: asyncpg.Pool,
    *,
    user_id: int,
    deck_id: str,
    state: str = "all",
    target_deck_id: str | None = None,
) -> list[dict]:
    normalized_state = state.strip().lower()
    if normalized_state not in {"all", "unstarted", "learning", "mastered"}:
        raise HTTPException(status_code=400, detail="无效的掌握状态筛选")

    async with pool.acquire() as conn:
        grouped_decks = _group_deck_rows(await list_vocab_decks(conn))
        _resolve_deck_group(grouped_decks, deck_id)
        target_group = _resolve_deck_group(grouped_decks, target_deck_id or deck_id)
        rows = await list_deck_word_rows(conn, user_id=user_id, deck_ids=list(target_group["member_deck_ids"]))

    items_by_id: dict[str, dict] = {}
    order: list[str] = []
    for raw_row in rows:
        row = dict(raw_row)
        word_id = str(row["id"])
        item = items_by_id.get(word_id)
        if item is None:
            mastery_state = _word_mastery_state(row.get("fsrs_state"))
            item = {
                "id": word_id,
                "deck_id": target_group["id"],
                "deck_name": str(target_group["name"]),
                "word": str(row["word"]),
                "us_pronunciation": row.get("us_pronunciation"),
                "uk_pronunciation": row.get("uk_pronunciation"),
                "mastery_state": mastery_state,
                "translations": [],
            }
            items_by_id[word_id] = item
            order.append(word_id)

        _append_translation_unique(item["translations"], pos=row.get("pos"), translation=row.get("translation"))

    items = [items_by_id[word_id] for word_id in order]
    if normalized_state == "all":
        return items
    return [item for item in items if item["mastery_state"] == normalized_state]


async def _rebuild_today_plan_for_group(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    deck_group: dict,
) -> dict[str, int]:
    plan = await _ensure_today_plan(conn, user_id=user_id, deck_group=deck_group)
    member_deck_ids = list(deck_group["member_deck_ids"])
    total_target_count = await get_daily_total_target(conn, user_id=user_id, deck_ids=member_deck_ids)

    completed_word_ids = set(await list_daily_plan_word_ids(conn, plan_id=str(plan["id"]), statuses=["done"]))
    await delete_pending_daily_plan_items(conn, plan_id=str(plan["id"]))
    remaining_target = max(total_target_count - len(completed_word_ids), 0)
    items = await _build_today_plan_items(
        conn,
        user_id=user_id,
        deck_group=deck_group,
        remaining_target=remaining_target,
        excluded_word_ids=completed_word_ids,
    )
    await insert_daily_plan_items(conn, plan_id=str(plan["id"]), items=items)
    summary = await get_daily_plan_summary(conn, plan_id=str(plan["id"]))
    summary["daily_target_count"] = total_target_count
    summary["mistake_count"] = await count_active_mistakes(
        conn,
        user_id=user_id,
        deck_ids=member_deck_ids,
    )
    summary["memorized_count"] = await count_memorized_words(
        conn,
        user_id=user_id,
        deck_ids=member_deck_ids,
    )
    return summary


async def get_inheritance_preview(pool: asyncpg.Pool, *, user_id: int, deck_id: str) -> dict[str, int]:
    async with pool.acquire() as conn:
        grouped_decks = _group_deck_rows(await list_vocab_decks(conn))
        deck_group = _resolve_deck_group(grouped_decks, deck_id)
        rows = await list_inheritable_mastered_progress_rows(
            conn,
            user_id=user_id,
            deck_ids=list(deck_group["member_deck_ids"]),
        )
    return {"inheritable_word_count": len(rows)}


async def inherit_mastered_words(pool: asyncpg.Pool, *, user_id: int, deck_id: str) -> dict[str, int]:
    async with pool.acquire() as conn:
        grouped_decks = _group_deck_rows(await list_vocab_decks(conn))
        deck_group = _resolve_deck_group(grouped_decks, deck_id)
        rows = await list_inheritable_mastered_progress_rows(
            conn,
            user_id=user_id,
            deck_ids=list(deck_group["member_deck_ids"]),
        )
        now = datetime.now(UTC)
        inherited_count = 0
        for raw_row in rows:
            row = dict(raw_row)
            normalized = _normalize_inherited_progress_row(row, now=now)
            await upsert_user_word_progress(
                conn,
                user_id=user_id,
                deck_id=str(row["deck_id"]),
                word_id=str(row["word_id"]),
                mastery_score=int(normalized["mastery_score"]),
                correct_count=int(normalized["correct_count"]),
                wrong_count=int(normalized["wrong_count"]),
                lapse_count=int(normalized["lapse_count"]),
                interval_days=int(normalized["interval_days"]),
                next_review_at=normalized["next_review_at"],
                fsrs_card_json=normalized["fsrs_card_json"],
                last_result=str(normalized["last_result"]),
            )
            inherited_count += 1

        if inherited_count > 0:
            await _rebuild_today_plan_for_group(conn, user_id=user_id, deck_group=deck_group)

    return {"inherited_word_count": inherited_count}


async def update_today_plan(pool: asyncpg.Pool, *, user_id: int, deck_id: str, total_target_count: int) -> dict[str, int]:
    async with pool.acquire() as conn:
        grouped_decks = _group_deck_rows(await list_vocab_decks(conn))
        deck_group = _resolve_deck_group(grouped_decks, deck_id)
        member_deck_ids = list(deck_group["member_deck_ids"])

        await upsert_daily_total_target(
            conn,
            user_id=user_id,
            deck_ids=member_deck_ids,
            daily_total_target=total_target_count,
        )
        summary = await _rebuild_today_plan_for_group(conn, user_id=user_id, deck_group=deck_group)
    return summary


async def get_learning_queue(pool: asyncpg.Pool, *, user_id: int, deck_id: str, limit: int = 10) -> list[dict]:
    async with pool.acquire() as conn:
        grouped_decks = _group_deck_rows(await list_vocab_decks(conn))
        deck_group = _resolve_deck_group(grouped_decks, deck_id)
        plan = await _ensure_today_plan(conn, user_id=user_id, deck_group=deck_group)
        rows = await list_daily_plan_queue_rows(conn, plan_id=str(plan["id"]), item_type="learning", limit=limit)
        items: list[dict] = []
        for row in rows:
            word_id = str(row["id"])
            translations = await list_word_translations(conn, word_id=word_id)
            phrases = await list_word_phrases(conn, word_id=word_id)
            sentences = await list_word_sentences(conn, word_id=word_id)
            payload = _detail_payload(row, translations=translations, phrases=phrases, sentences=sentences)
            payload["prompt_type"] = "en_to_zh"
            payload["review_mode"] = "learning"
            items.append(payload)
    return items


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
