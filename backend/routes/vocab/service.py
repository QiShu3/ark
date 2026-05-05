from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta

import asyncpg
from fastapi import HTTPException

from .repository import (
    count_active_mistakes,
    count_due_reviews,
    count_new_words,
    count_studied_new_words_today,
    get_daily_new_limit,
    get_user_word_progress,
    get_word_detail_row,
    insert_review_log,
    list_mistake_rows,
    list_review_queue_rows,
    list_study_queue_rows,
    list_vocab_decks,
    list_word_phrases,
    list_word_sentences,
    list_word_translations,
    upsert_mistake_bucket,
    upsert_user_word_progress,
)

_SERIAL_SUFFIX_RE = re.compile(r"_(\d+)$")


def _deck_group_key(raw_value: str) -> str:
    return _SERIAL_SUFFIX_RE.sub("", raw_value)


def _natural_sort_key(raw_value: str) -> list[int | str]:
    parts = re.split(r"(\d+)", raw_value)
    return [int(part) if part.isdigit() else part.lower() for part in parts if part]


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
                "name": group_name,
                "description": f"{group_name} 词书",
                "word_count": 0,
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
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

    items = sorted(grouped.values(), key=lambda item: _natural_sort_key(str(item["name"])))
    for item in items:
        sorted_members = sorted(item["members"], key=lambda member: _natural_sort_key(member["name"]))
        item["member_deck_ids"] = [member["id"] for member in sorted_members]
        item["member_keys"] = [member["key"] for member in sorted_members]
        item["member_names"] = [member["name"] for member in sorted_members]
        item.pop("members", None)
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


def apply_review_result(progress: dict, *, result: str) -> dict:
    mastery_score = int(progress.get("mastery_score", 0))
    wrong_count = int(progress.get("wrong_count", 0))
    correct_count = int(progress.get("correct_count", 0))
    lapse_count = int(progress.get("lapse_count", 0))
    result_key = result.strip().lower()
    now = datetime.now(UTC)

    if result_key in {"wrong", "again"}:
        interval_days = 1
        next_review_at = now + timedelta(days=1)
        return {
            "mastery_score": max(0, mastery_score - 1),
            "wrong_count": wrong_count + 1,
            "correct_count": correct_count,
            "lapse_count": lapse_count + 1,
            "interval_days": interval_days,
            "next_review_at": next_review_at,
            "result": result_key,
        }

    if result_key == "hard":
        interval_days = 2
        next_review_at = now + timedelta(days=2)
        return {
            "mastery_score": mastery_score + 1,
            "wrong_count": wrong_count,
            "correct_count": correct_count + 1,
            "lapse_count": lapse_count,
            "interval_days": interval_days,
            "next_review_at": next_review_at,
            "result": result_key,
        }

    interval_days = 3
    next_review_at = now + timedelta(days=3)
    return {
        "mastery_score": mastery_score + 2,
        "wrong_count": wrong_count,
        "correct_count": correct_count + 1,
        "lapse_count": lapse_count,
        "interval_days": interval_days,
        "next_review_at": next_review_at,
        "result": result_key or "good",
    }


async def list_decks(pool: asyncpg.Pool) -> list[dict]:
    async with pool.acquire() as conn:
        rows = await list_vocab_decks(conn)
    return _group_deck_rows(rows)


async def get_today_summary(pool: asyncpg.Pool, *, user_id: int, deck_id: str) -> dict[str, int]:
    async with pool.acquire() as conn:
        grouped_decks = _group_deck_rows(await list_vocab_decks(conn))
        deck_group = _resolve_deck_group(grouped_decks, deck_id)
        member_deck_ids = list(deck_group["member_deck_ids"])

        daily_new_limit = await get_daily_new_limit(conn, user_id=user_id, deck_ids=member_deck_ids)
        unseen_new_count = await count_new_words(conn, user_id=user_id, deck_ids=member_deck_ids)
        studied_today_count = await count_studied_new_words_today(conn, user_id=user_id, deck_ids=member_deck_ids)
        remaining_new_quota = max(daily_new_limit - studied_today_count, 0)
        review_count = await count_due_reviews(conn, user_id=user_id, deck_ids=member_deck_ids)
        mistake_count = await count_active_mistakes(conn, user_id=user_id, deck_ids=member_deck_ids)
    return {
        "new_count": min(unseen_new_count, remaining_new_quota),
        "review_count": review_count,
        "mistake_count": mistake_count,
    }


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
        rows = await list_review_queue_rows(conn, user_id=user_id, deck_ids=list(deck_group["member_deck_ids"]), limit=limit)
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
        member_deck_ids = list(deck_group["member_deck_ids"])

        daily_new_limit = await get_daily_new_limit(conn, user_id=user_id, deck_ids=member_deck_ids)
        studied_today_count = await count_studied_new_words_today(conn, user_id=user_id, deck_ids=member_deck_ids)
        remaining_new_quota = max(daily_new_limit - studied_today_count, 0)
        if remaining_new_quota <= 0:
            return []

        items: list[dict] = []
        remaining_limit = min(limit, remaining_new_quota)

        for member_deck_id in member_deck_ids:
            if remaining_limit <= 0:
                break

            rows = await list_study_queue_rows(
                conn,
                user_id=user_id,
                deck_id=member_deck_id,
                limit=remaining_limit,
            )
            for row in rows:
                word_id = str(row["id"])
                translations = await list_word_translations(conn, word_id=word_id)
                phrases = await list_word_phrases(conn, word_id=word_id)
                sentences = await list_word_sentences(conn, word_id=word_id)
                payload = _detail_payload(row, translations=translations, phrases=phrases, sentences=sentences)
                payload["prompt_type"] = "en_to_zh"
                payload["review_mode"] = "study"
                items.append(payload)
            remaining_limit -= len(rows)
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
        progress_row = await get_user_word_progress(conn, user_id=user_id, deck_id=deck_id, word_id=word_id)
        current_progress = dict(progress_row) if progress_row is not None else {}
        updated = apply_review_result(current_progress, result=result)
        await upsert_user_word_progress(
            conn,
            user_id=user_id,
            deck_id=deck_id,
            word_id=word_id,
            mastery_score=int(updated["mastery_score"]),
            correct_count=int(updated["correct_count"]),
            wrong_count=int(updated["wrong_count"]),
            lapse_count=int(updated["lapse_count"]),
            interval_days=int(updated["interval_days"]),
            next_review_at=updated["next_review_at"],
            last_result=str(updated["result"]),
        )
        await insert_review_log(
            conn,
            user_id=user_id,
            deck_id=deck_id,
            word_id=word_id,
            review_mode=review_mode,
            prompt_type=prompt_type,
            result=str(updated["result"]),
            response_ms=response_ms,
        )
        await upsert_mistake_bucket(
            conn,
            user_id=user_id,
            deck_id=deck_id,
            word_id=word_id,
            is_active=str(updated["result"]) in {"wrong", "again"},
        )
    return {
        "mastery_score": int(updated["mastery_score"]),
        "next_review_at": updated["next_review_at"],
        "wrong_count": int(updated["wrong_count"]),
        "correct_count": int(updated["correct_count"]),
        "interval_days": int(updated["interval_days"]),
        "result": str(updated["result"]),
    }
