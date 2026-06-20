from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

ENV_PATH = ROOT / ".env"
load_dotenv(dotenv_path=ENV_PATH, override=False)

from routes.auth_routes import _database_url  # noqa: E402
from routes.choice.importer import load_article_seeds  # noqa: E402


async def _run(args: argparse.Namespace) -> None:
    pool = await asyncpg.create_pool(dsn=_database_url(), min_size=1, max_size=2, command_timeout=60)
    try:
        seeds = load_article_seeds(Path(args.directory))
        async with pool.acquire() as conn:
            async with conn.transaction():
                set_id = await conn.fetchval(
                    """INSERT INTO choice_sets (key, name, description, exam, source_version)
                       VALUES ($1, $2, $3, $4, $5) RETURNING id::text""",
                    args.set_key, args.name, args.description, args.exam, args.source_version,
                )

                for i, seed in enumerate(seeds, 1):
                    article_pk = await conn.fetchval(
                        """INSERT INTO choice_articles (set_id, article_id, exam, year, text_no, title, sort_order)
                           VALUES ($1::uuid, $2, $3, $4, $5, $6, $7) RETURNING id::text""",
                        set_id, seed.article_id, seed.exam, seed.year, seed.text_no, seed.title, i,
                    )
                    for p in seed.paragraphs:
                        await conn.execute(
                            "INSERT INTO choice_paragraphs (article_pk, paragraph_no, text) VALUES ($1::uuid, $2, $3)",
                            article_pk, p.paragraph_no, p.text,
                        )
                    for q in seed.questions:
                        await conn.execute(
                            """INSERT INTO choice_questions
                               (article_pk, question_id, question_no, stem, options_json, answer, explanation)
                               VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6, $7)""",
                            article_pk, q.question_id, q.question_no, q.stem,
                            json.dumps(q.options, ensure_ascii=False), q.answer, q.explanation,
                        )

                await conn.execute(
                    """UPDATE choice_sets SET
                       article_count = (SELECT COUNT(*) FROM choice_articles WHERE set_id = $1::uuid),
                       question_count = (SELECT COUNT(*) FROM choice_questions q JOIN choice_articles a ON a.id = q.article_pk WHERE a.set_id = $1::uuid)
                       WHERE id = $1::uuid""",
                    set_id,
                )

        print(f"Imported {len(seeds)} articles into choice_sets ({args.name})")
    finally:
        await pool.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("directory")
    parser.add_argument("--set-key", default="kaoyan2_2020_2025")
    parser.add_argument("--name", default="考研英语二 2020-2025")
    parser.add_argument("--description", default="考研英语二阅读理解真题 2020-2025")
    parser.add_argument("--exam", default="考研英语二")
    parser.add_argument("--source-version", default="2026-05-09")
    asyncio.run(_run(parser.parse_args()))


if __name__ == "__main__":
    main()
