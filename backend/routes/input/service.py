from __future__ import annotations

import hashlib
import io
import json
import re
import secrets
import zipfile
from pathlib import Path
from typing import Any

import asyncpg
from fastapi import HTTPException

from .repository import (
    get_input_set_id_by_question,
    get_question_by_id,
    insert_input_article,
    insert_input_paragraph,
    insert_input_question,
    insert_input_set,
    insert_input_user_answer,
    refresh_set_counts,
)

_UPLOADS_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"


def _slugify(text: str, fallback: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fff]+", "-", text).strip("-").lower()
    return slug or fallback


def match_fill_answer(user_input: str, question: dict[str, Any]) -> bool:
    accepted = question.get("accepted_answers") or []
    if isinstance(accepted, str):
        try:
            accepted = json.loads(accepted)
        except (json.JSONDecodeError, TypeError):
            accepted = [accepted]
    match_rule = question.get("match_rule", "exact")
    case_sensitive = question.get("case_sensitive", False)

    def compare(a: str, b: str) -> bool:
        if not case_sensitive:
            return a.lower() == b.lower()
        return a == b

    normalized_input = user_input.strip()

    for answer in accepted:
        answer_str = str(answer).strip()
        if match_rule == "exact":
            if compare(normalized_input, answer_str):
                return True
        elif match_rule == "contains":
            if case_sensitive:
                if answer_str in normalized_input:
                    return True
            else:
                if answer_str.lower() in normalized_input.lower():
                    return True
        elif match_rule == "regex":
            try:
                flags = 0 if case_sensitive else re.IGNORECASE
                if re.search(answer_str, normalized_input, flags):
                    return True
            except re.error:
                continue
    return False


async def ai_grade(
    *,
    user_input: str,
    stem: str,
    rubric: str,
    reference_answer: str,
) -> dict[str, Any]:
    """Grade a subjective answer using OpenAI API. Hardcoded for now."""
    import os

    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        return {"score": 0, "feedback": "AI 评分服务未配置"}

    import httpx

    prompt = f"""你是一个严格的评分助手。请根据以下标准对用户的回答进行评分。

题目：{stem}
评分标准：{rubric}
参考答案：{reference_answer}

用户回答：{user_input}

请返回 JSON 格式：
{{"score": 0-100, "feedback": "简短的评分反馈"}}

只返回 JSON，不要其他内容。"""

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.3,
            },
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        try:
            result = json.loads(content)
            return {"score": int(result.get("score", 0)), "feedback": str(result.get("feedback", ""))}
        except (json.JSONDecodeError, KeyError, ValueError):
            return {"score": 0, "feedback": "AI 评分解析失败"}


async def submit_answer(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    question_id: str,
    user_input: str,
    time_spent_ms: int | None,
) -> dict[str, Any]:
    question = await get_question_by_id(conn, question_id)
    if question is None:
        raise HTTPException(status_code=404, detail="题目不存在")

    q = dict(question)

    # Get set_id for this question
    set_id = await get_input_set_id_by_question(conn, question_id)

    if q["mode"] == "fill":
        correct = match_fill_answer(user_input, q)
        accepted = q.get("accepted_answers") or []
        if isinstance(accepted, str):
            try:
                accepted = json.loads(accepted)
            except (json.JSONDecodeError, TypeError):
                accepted = [accepted]

        # Save answer record
        if set_id:
            await insert_input_user_answer(
                conn,
                user_id=user_id,
                question_id=question_id,
                set_id=set_id,
                user_input=user_input,
                is_correct=correct,
                score=None,
                time_spent_ms=time_spent_ms,
            )

        return {
            "question_id": question_id,
            "correct": correct,
            "accepted_answers": accepted,
            "explanation": q.get("explanation", ""),
        }

    result = await ai_grade(
        user_input=user_input,
        stem=q["stem"],
        rubric=q.get("rubric", ""),
        reference_answer=q.get("reference_answer", ""),
    )

    # Save answer record for subjective questions
    if set_id:
        await insert_input_user_answer(
            conn,
            user_id=user_id,
            question_id=question_id,
            set_id=set_id,
            user_input=user_input,
            is_correct=None,
            score=result["score"],
            time_spent_ms=time_spent_ms,
        )

    return {
        "question_id": question_id,
        "score": result["score"],
        "feedback": result["feedback"],
        "explanation": q.get("explanation", ""),
    }


def _parse_articles(raw_articles: list[dict[str, Any]], set_key: str) -> list[dict[str, Any]]:
    """Parse articles from JSON payload into structured data."""
    articles = []
    for idx, article in enumerate(raw_articles, start=1):
        article_id = article.get("article_id") or f"{set_key}_a{idx}"
        title = article.get("title") or ""
        content = article.get("content") or []
        questions_raw = article.get("questions") or []

        paragraphs = []
        for p in content:
            if isinstance(p, dict):
                paragraphs.append({
                    "paragraph_no": p.get("paragraph_no", len(paragraphs) + 1),
                    "text": str(p.get("text", "")),
                })
            elif isinstance(p, str):
                paragraphs.append({
                    "paragraph_no": len(paragraphs) + 1,
                    "text": p,
                })

        paragraphs_text = [p["text"] for p in paragraphs]

        questions = []
        for qidx, q in enumerate(questions_raw, start=1):
            if not isinstance(q, dict):
                continue
            stem = str(q.get("stem") or "").strip()
            if not stem:
                stem = "\n".join(paragraphs_text).strip() if paragraphs_text else ""
            if not stem:
                continue
            mode = q.get("mode", "fill")
            if mode not in ("fill", "subjective"):
                continue
            accepted = q.get("acceptedAnswers") or q.get("accepted_answers") or []
            if mode == "fill" and not accepted:
                continue
            questions.append({
                "question_id": q.get("question_id") or f"{article_id}_q{qidx}",
                "question_no": q.get("question_no", qidx),
                "stem": stem,
                "mode": mode,
                "input_config": q.get("inputConfig") or q.get("input_config") or {},
                "accepted_answers": accepted if isinstance(accepted, list) else [str(accepted)],
                "match_rule": q.get("matchRule") or q.get("match_rule") or "exact",
                "case_sensitive": bool(q.get("caseSensitive") or q.get("case_sensitive")),
                "rubric": q.get("rubric") or "",
                "reference_answer": q.get("referenceAnswer") or q.get("reference_answer") or "",
                "explanation": q.get("explanation") or "",
                "sort_order": q.get("sort_order", qidx),
            })

        articles.append({
            "article_id": article_id,
            "title": title,
            "paragraphs": paragraphs,
            "questions": questions,
        })
    return articles


_IMAGE_MD_PATTERN = re.compile(r"!\[([^\]]*)\]\(((?!/)[^)]+)\)")


def _rewrite_image_paths(raw_articles: list[dict[str, Any]], set_id: str) -> None:
    """Rewrite inline markdown image paths from images/xxx.jpg to /uploads/content-images/{set_id}/xxx.jpg."""
    prefix = f"/uploads/content-images/{set_id}/"

    def _replace(text: str) -> str:
        if not text or not isinstance(text, str):
            return text
        return _IMAGE_MD_PATTERN.sub(rf"![\1]({prefix}\2)", text)

    for article in raw_articles:
        for p in article.get("content", []):
            if isinstance(p, dict) and "text" in p:
                p["text"] = _replace(p["text"])
        for q in article.get("questions", []):
            if isinstance(q, dict):
                q["stem"] = _replace(q.get("stem", ""))
                q["explanation"] = _replace(q.get("explanation", ""))


async def import_input_bank(
    conn: asyncpg.Connection,
    *,
    name: str,
    description: str,
    filename: str,
    file_bytes: bytes,
) -> dict[str, Any]:
    """Import an input question bank from JSON or ZIP file."""
    if not file_bytes:
        raise HTTPException(status_code=400, detail="文件为空")

    # Determine file type and extract JSON + images
    json_data: bytes | None = None
    image_files: dict[str, bytes] = {}

    if filename.lower().endswith(".zip"):
        try:
            with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
                # Find JSON file
                json_names = [n for n in zf.namelist() if n.lower().endswith(".json")]
                if not json_names:
                    raise HTTPException(status_code=400, detail="ZIP 中未找到 JSON 文件")
                json_data = zf.read(json_names[0])

                # Find images
                image_exts = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}
                for name_in_zip in zf.namelist():
                    ext = Path(name_in_zip).suffix.lower()
                    if ext in image_exts:
                        image_files[name_in_zip] = zf.read(name_in_zip)
        except zipfile.BadZipFile:
            raise HTTPException(status_code=400, detail="ZIP 文件损坏")
    else:
        json_data = file_bytes

    if json_data is None:
        raise HTTPException(status_code=400, detail="未找到 JSON 数据")

    try:
        payload = json.loads(json_data.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail=f"JSON 解析失败: {exc}")

    # Extract articles from payload
    raw_articles: list[dict[str, Any]] = []
    if isinstance(payload, dict):
        name = payload.get("name") or name
        raw_articles = payload.get("articles") or payload.get("items") or []
        # Support flat question format: wrap in a single article
        if not raw_articles and payload.get("questions"):
            raw_articles = [{"article_id": "default", "title": name, "questions": payload["questions"]}]
    elif isinstance(payload, list):
        raw_articles = payload
    else:
        raise HTTPException(status_code=400, detail="JSON 结构无效")

    if not raw_articles:
        raise HTTPException(status_code=400, detail="题库为空")

    digest = hashlib.sha1(file_bytes).hexdigest()[:8]
    set_key = f"input-{_slugify(name, 'bank')}-{digest}-{secrets.token_hex(3)}"

    # Validate
    articles = _parse_articles(raw_articles, set_key)
    errors: list[str] = []
    total_questions = 0
    for aidx, article in enumerate(articles, start=1):
        if not article["questions"]:
            errors.append(f"第 {aidx} 篇文章: 无有效题目")
            continue
        total_questions += len(article["questions"])
    if errors and total_questions == 0:
        raise HTTPException(
            status_code=400,
            detail={"message": f"校验失败，共 {len(errors)} 个错误", "errors": errors[:100]},
        )

    # Insert set first to get set_id for image storage
    set_id = await insert_input_set(
        conn,
        key=set_key,
        name=name,
        description=description or f"{name} 输入题库",
        exam=str(payload.get("exam", "")) if isinstance(payload, dict) else "",
    )

    # Store images if ZIP upload
    if image_files:
        img_dir = _UPLOADS_DIR / "content-images" / set_id
        img_dir.mkdir(parents=True, exist_ok=True)
        for img_name, img_bytes_data in image_files.items():
            (img_dir / Path(img_name).name).write_bytes(img_bytes_data)

        # Rewrite image paths in articles
        _rewrite_image_paths(raw_articles, set_id)

        # Re-parse after path rewrite
        articles = _parse_articles(raw_articles, set_key)

    # Insert articles, paragraphs, questions
    for aidx, article in enumerate(articles, start=1):
        article_pk = await insert_input_article(
            conn,
            set_id=set_id,
            article_id=article["article_id"],
            title=article["title"],
            sort_order=aidx,
        )
        for p in article["paragraphs"]:
            await insert_input_paragraph(
                conn,
                article_pk=article_pk,
                paragraph_no=p["paragraph_no"],
                text=p["text"],
            )
        for q in article["questions"]:
            await insert_input_question(
                conn,
                article_pk=article_pk,
                question_id=q["question_id"],
                question_no=q["question_no"],
                stem=q["stem"],
                mode=q["mode"],
                input_config=q["input_config"],
                accepted_answers=q["accepted_answers"],
                match_rule=q["match_rule"],
                case_sensitive=q["case_sensitive"],
                rubric=q["rubric"],
                reference_answer=q["reference_answer"],
                explanation=q["explanation"],
                sort_order=q["sort_order"],
            )

    await refresh_set_counts(conn, set_id=set_id)

    return {
        "bank_id": set_id,
        "name": name,
        "question_count": total_questions,
        "validation_summary": {"accepted": True, "question_count": total_questions, "article_count": len(articles)},
    }
