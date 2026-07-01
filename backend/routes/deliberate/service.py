from __future__ import annotations

import hashlib
import io
import json
import re
import secrets
import zipfile
from dataclasses import dataclass
from typing import Any

import asyncpg
from fastapi import HTTPException

from lib.focus_work_types import (
    CHOICE_KIND,
    FLASH_CARD_KIND,
    INPUT_KIND,
    normalize_deliberate_kind,
    normalize_focus_work_type,
)
from routes.focus_work.choice.importer import parse_content_bank_entries
from routes.focus_work.choice.repository import refresh_set_counts, upsert_article_seed, upsert_set
from routes.focus_work.flash.importer import DeckSeed, SentenceSeed, TranslationSeed, WordSeed, detect_format, parse_word_entry
from routes.focus_work.flash.repository import import_deck


@dataclass(frozen=True)
class BankImportResult:
    bank_id: str
    kind: str
    name: str
    item_count: int
    question_count: int
    validation_summary: dict[str, Any]


def _slugify(text: str, fallback: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fff]+", "-", text).strip("-").lower()
    return slug or fallback


def _load_json_payload(file_bytes: bytes, filename: str) -> list[dict[str, Any]]:
    if filename.lower().endswith(".zip"):
        try:
            with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
                json_names = [n for n in zf.namelist() if n.lower().endswith(".json")]
                if not json_names:
                    raise HTTPException(status_code=400, detail={"message": "ZIP 中未找到 JSON 文件", "errors": ["ZIP 包内必须包含至少一个 .json 文件"]})
                file_bytes = zf.read(json_names[0])
        except zipfile.BadZipFile:
            raise HTTPException(status_code=400, detail={"message": "ZIP 文件损坏", "errors": ["无法解析 ZIP 文件"]})
    
    if not filename.lower().endswith((".json", ".zip")):
        raise HTTPException(status_code=400, detail={"message": "当前仅支持 JSON 或 ZIP 文件", "errors": ["文件扩展名必须是 .json 或 .zip"]})
    
    try:
        payload = json.loads(file_bytes.decode("utf-8"))
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail={"message": "文件必须使用 UTF-8 编码", "errors": [str(exc)]}) from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail={"message": "JSON 解析失败", "errors": [str(exc)]}) from exc
    if isinstance(payload, dict):
        for key in ("items", "words", "entries", "questions", "articles"):
            value = payload.get(key)
            if isinstance(value, list):
                payload = value
                break
    if not isinstance(payload, list):
        raise HTTPException(status_code=400, detail={"message": "题库结构无效", "errors": ["顶层结构必须是数组，或包含 items/words/entries 数组的对象"]})
    return [item for item in payload if isinstance(item, dict)]


def _validation_exception(errors: list[str]) -> HTTPException:
    return HTTPException(
        status_code=400,
        detail={
            "message": f"题库校验失败，共 {len(errors)} 个错误",
            "errors": errors[:100],
        },
    )


def _validate_choice_entries(entries: list[dict[str, Any]]) -> None:
    errors: list[str] = []
    if not entries:
        errors.append("题库为空")
    for idx, entry in enumerate(entries, start=1):
        questions = entry.get("questions")
        if not isinstance(questions, list) or not questions:
            errors.append(f"第 {idx} 条: questions 应为非空数组")
            continue
        for q_index, question in enumerate(questions, start=1):
            if not isinstance(question, dict):
                errors.append(f"第 {idx} 条第 {q_index} 题: 必须是对象")
                continue
            stem = str(question.get("question_text") or question.get("stem") or "").strip()
            if not stem:
                errors.append(f"第 {idx} 条第 {q_index} 题: 缺少 question_text")
            answer = str(question.get("correct_answer") or question.get("answer") or "").strip().upper()
            if not answer:
                errors.append(f"第 {idx} 条第 {q_index} 题: 缺少 correct_answer")
            options = question.get("options")
            if not isinstance(options, dict) or not options:
                errors.append(f"第 {idx} 条第 {q_index} 题: options 应为非空对象")
            elif answer and answer not in options:
                errors.append(f"第 {idx} 条第 {q_index} 题: correct_answer 不在 options 中")
    if errors:
        raise _validation_exception(errors)


def _normalize_choice_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for entry in entries:
        next_entry = dict(entry)
        questions: list[dict[str, Any]] = []
        for question in entry.get("questions") or []:
            if not isinstance(question, dict):
                continue
            next_question = dict(question)
            if "question_text" not in next_question and "stem" in next_question:
                next_question["question_text"] = next_question.get("stem")
            if "correct_answer" not in next_question and "answer" in next_question:
                next_question["correct_answer"] = str(next_question.get("answer") or "").upper()
            questions.append(next_question)
        next_entry["questions"] = questions
        normalized.append(next_entry)
    return normalized


def _simple_word_seed(entry: dict[str, Any], sort_order: int) -> WordSeed:
    translation = str(entry.get("translation") or entry.get("definition") or "").strip()
    pos = str(entry.get("pos") or entry.get("type") or "").strip() or None
    translations = [TranslationSeed(translation=translation, pos=pos)] if translation else []
    sentence = str(entry.get("example") or entry.get("sentence") or "").strip()
    sentence_translation = str(entry.get("example_translation") or entry.get("sentence_translation") or "").strip()
    sentences = [SentenceSeed(sentence=sentence, translation=sentence_translation)] if sentence else []
    return WordSeed(
        word=str(entry.get("word") or "").strip(),
        us_pronunciation=str(entry.get("us") or entry.get("us_pronunciation") or "").strip() or None,
        uk_pronunciation=str(entry.get("uk") or entry.get("uk_pronunciation") or "").strip() or None,
        sort_order=sort_order,
        translations=translations,
        phrases=[],
        sentences=sentences,
    )


def _parse_flashcard_words(entries: list[dict[str, Any]]) -> list[WordSeed]:
    errors: list[str] = []
    if not entries:
        errors.append("词书为空")
    fmt = detect_format(entries)
    words: list[WordSeed] = []
    for idx, entry in enumerate(entries, start=1):
        word = str(entry.get("word") or entry.get("headWord") or "").strip()
        if not word:
            errors.append(f"第 {idx} 条: 缺少 word 字段")
            continue
        try:
            if "translations" in entry or "content" in entry:
                words.append(parse_word_entry(entry, idx, fmt))
            else:
                words.append(_simple_word_seed(entry, idx))
        except Exception as exc:
            errors.append(f"第 {idx} 条: {exc}")
    if errors:
        raise _validation_exception(errors)
    return words


async def import_deliberate_bank(
    conn: asyncpg.Connection,
    *,
    kind: str,
    name: str,
    description: str,
    filename: str,
    file_bytes: bytes,
) -> BankImportResult:
    kind = normalize_deliberate_kind(kind)
    if kind not in {FLASH_CARD_KIND, CHOICE_KIND, INPUT_KIND}:
        raise HTTPException(status_code=400, detail="kind 必须是 flash_card、choice 或 input")
    if kind == INPUT_KIND:
        from routes.focus_work.input.service import import_input_bank as _import_input_bank
        result = await _import_input_bank(
            conn,
            name=name,
            description=description,
            filename=filename,
            file_bytes=file_bytes,
        )
        return BankImportResult(
            bank_id=result["bank_id"],
            kind=kind,
            name=name,
            item_count=0,
            question_count=result["question_count"],
            validation_summary=result["validation_summary"],
        )
    entries = _load_json_payload(file_bytes, filename)
    digest = hashlib.sha1(file_bytes).hexdigest()[:8]
    if kind == FLASH_CARD_KIND:
        words = _parse_flashcard_words(entries)
        key = f"deliberate-{_slugify(name, 'deck')}-{digest}-{secrets.token_hex(3)}"
        deck_id = await import_deck(
            conn,
            DeckSeed(
                key=key,
                name=name,
                description=description or f"{name} 词书",
                source_version="deliberate-upload",
                words=words,
            ),
        )
        return BankImportResult(
            bank_id=deck_id,
            kind=kind,
            name=name,
            item_count=len(words),
            question_count=0,
            validation_summary={"accepted": True, "format": "flash_card_deck", "word_count": len(words)},
        )

    _validate_choice_entries(entries)
    normalized = _normalize_choice_entries(entries)
    set_key = f"deliberate-{_slugify(name, 'choice-set')}-{digest}-{secrets.token_hex(3)}"
    set_id = await upsert_set(
        conn,
        key=set_key,
        name=name,
        description=description or f"{name} 选择题",
        exam=str(normalized[0].get("examination") or "") if normalized else "",
        source_version="deliberate-upload",
    )
    seeds = parse_content_bank_entries(normalized, set_key=set_key)
    for seed in seeds:
        await upsert_article_seed(conn, set_id=set_id, seed=seed)
    await refresh_set_counts(conn, set_id=set_id)
    question_count = sum(len(seed.questions) for seed in seeds)
    return BankImportResult(
        bank_id=set_id,
        kind=kind,
        name=name,
        item_count=len(seeds),
        question_count=question_count,
        validation_summary={"accepted": True, "format": "choice_set", "question_count": question_count},
    )


def validate_config_shape(kind: str, focus_work_type: str, target_count: int) -> None:
    normalized_kind = normalize_deliberate_kind(kind)
    normalized_focus_work_type = normalize_focus_work_type(focus_work_type)
    if normalized_kind not in {FLASH_CARD_KIND, CHOICE_KIND, INPUT_KIND}:
        raise HTTPException(status_code=400, detail="kind 必须是 flash_card、choice 或 input")
    if normalized_kind != normalized_focus_work_type:
        raise HTTPException(status_code=400, detail="专注工作类型必须与工作流类型一致")
    if target_count < 1 or target_count > 500:
        raise HTTPException(status_code=400, detail="目标数量必须在 1-500 之间")
