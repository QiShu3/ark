"""Migrate choice-type content banks to choice_sets.

This script reads all content_banks with item_type='choice' and migrates
their data into the choice_sets tables (choice_sets, choice_articles,
choice_paragraphs, choice_questions).

Banks that already exist in choice_sets (matched by name) are skipped.
"""

from __future__ import annotations

import asyncio
import json
import re
import secrets
import sys
from pathlib import Path

import asyncpg

# Add parent dir to path so we can import routes
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from routes.choice.importer import parse_content_bank_entries


def _slugify(name: str) -> str:
    """Convert a name to a safe key for choice_sets."""
    key = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fff]", "_", name).strip("_").lower()
    if not key:
        key = f"bank_{secrets.token_hex(4)}"
    return key


async def migrate(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        # Find all choice content banks
        banks = await conn.fetch(
            "SELECT id, name, description, fw_type FROM content_banks WHERE item_type = 'choice' ORDER BY name"
        )
        print(f"Found {len(banks)} choice content banks")

        for bank in banks:
            bank_id = str(bank["id"])
            name = bank["name"]
            description = bank["description"] or ""
            fw_type = bank["fw_type"] or ""

            # Check if this bank already exists in choice_sets
            existing = await conn.fetchval(
                "SELECT id FROM choice_sets WHERE name = $1", name
            )
            if existing:
                print(f"  Skipping '{name}' (already exists in choice_sets)")
                continue

            # Read all items for this bank
            items = await conn.fetch(
                """SELECT ci.id, ci.title, ci.body
                   FROM content_items ci
                   WHERE ci.bank_id = $1::uuid
                   ORDER BY ci.sort_order""",
                bank_id,
            )
            if not items:
                print(f"  Skipping '{name}' (no items)")
                continue

            print(f"  Migrating '{name}' ({len(items)} items)...")

            # Build raw entries for parse_content_bank_entries
            raw = []
            for item in items:
                body = item["body"] if isinstance(item["body"], dict) else json.loads(item["body"])
                # Read questions for this item
                questions = await conn.fetch(
                    """SELECT question_text, options, correct_answer, analysis, paragraph_no
                       FROM content_questions
                       WHERE item_id = $1::uuid
                       ORDER BY sort_order""",
                    item["id"],
                )
                q_list = []
                for q in questions:
                    opts = q["options"] if isinstance(q["options"], dict) else json.loads(q["options"])
                    q_list.append({
                        "question_text": q["question_text"],
                        "options": opts,
                        "correct_answer": q["correct_answer"],
                        "analysis": q["analysis"] or "",
                        "paragraph_no": q["paragraph_no"],
                    })
                raw.append({
                    "title": item["title"] or "",
                    "passage": body.get("passage", ""),
                    "tags": body.get("tags", []),
                    "examination": body.get("examination", ""),
                    "questions": q_list,
                })

            # Convert to choice_sets format
            set_key = _slugify(name)
            seeds = parse_content_bank_entries(raw, set_key=set_key)

            if not seeds:
                print(f"    No valid seeds generated, skipping")
                continue

            # Insert into choice_sets
            exam = raw[0].get("examination", "") if raw else ""
            tags = raw[0].get("tags", []) if raw else []
            if not exam and tags:
                exam = str(tags[0])

            set_id = await conn.fetchval(
                """INSERT INTO choice_sets (key, name, description, exam, source_version)
                   VALUES ($1, $2, $3, $4, 'migration') RETURNING id""",
                set_key, name, description or f"{name} 选择题", exam,
            )

            # Insert articles, paragraphs, questions
            for seed in seeds:
                article_pk = await conn.fetchval(
                    """INSERT INTO choice_articles (set_id, article_id, exam, year, text_no, title, sort_order)
                       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7) RETURNING id""",
                    set_id, seed.article_id, seed.exam, seed.year, seed.text_no,
                    seed.title, seed.sort_order,
                )

                for para in seed.paragraphs:
                    await conn.execute(
                        "INSERT INTO choice_paragraphs (article_pk, paragraph_no, text) VALUES ($1::uuid, $2, $3)",
                        article_pk, para.paragraph_no, para.text,
                    )

                for q in seed.questions:
                    await conn.execute(
                        """INSERT INTO choice_questions
                           (article_pk, question_id, question_no, stem, options_json, answer, explanation)
                           VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6, $7)""",
                        article_pk, q.question_id, q.question_no, q.stem,
                        json.dumps(q.options, ensure_ascii=False), q.answer, q.explanation,
                    )

            # Refresh counts
            await conn.execute(
                """UPDATE choice_sets SET
                   article_count = (SELECT COUNT(*) FROM choice_articles WHERE set_id = $1::uuid),
                   question_count = (SELECT COUNT(*) FROM choice_questions q JOIN choice_articles a ON a.id = q.article_pk WHERE a.set_id = $1::uuid),
                   updated_at = NOW()
                   WHERE id = $1::uuid""",
                set_id,
            )

            total_articles = len(seeds)
            total_questions = sum(len(s.questions) for s in seeds)
            print(f"    Done: {total_articles} articles, {total_questions} questions")


async def main() -> None:
    import os
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")

    dsn = os.getenv("DATABASE_URL", "postgresql://qishu:12345678@localhost:5432/ark")
    pool = await asyncpg.create_pool(dsn)
    try:
        await migrate(pool)
    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
