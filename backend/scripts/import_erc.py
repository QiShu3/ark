from __future__ import annotations

import argparse
import asyncio
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
from routes.erc.importer import load_article_seeds, load_article_word_seeds  # noqa: E402
from routes.erc.repository import (  # noqa: E402
    init_tables,
    refresh_set_counts,
    replace_article_words,
    upsert_article_seed,
    upsert_set,
)


async def _run(args: argparse.Namespace) -> None:
    pool = await asyncpg.create_pool(dsn=_database_url(), min_size=1, max_size=2, command_timeout=60)
    try:
        await init_tables(pool)
        if args.words_only:
            if not args.word_directory:
                raise ValueError("--words-only requires --word-directory")
            word_seeds = load_article_word_seeds(Path(args.word_directory))
            word_count = 0
            async with pool.acquire() as conn:
                async with conn.transaction():
                    for word_seed in word_seeds:
                        await replace_article_words(conn, seed=word_seed)
                        word_count += len(word_seed.words)
            print(f"Imported {len(word_seeds)} ERC word profiles and {word_count} article words")
            return

        seeds = load_article_seeds(Path(args.directory))
        async with pool.acquire() as conn:
            async with conn.transaction():
                set_id = await upsert_set(
                    conn,
                    key=args.set_key,
                    name=args.name,
                    description=args.description,
                    exam=args.exam,
                    source_version=args.source_version,
                )
                for seed in seeds:
                    await upsert_article_seed(conn, set_id=set_id, seed=seed)
                word_count = 0
                if args.word_directory:
                    word_seeds = load_article_word_seeds(Path(args.word_directory))
                    for word_seed in word_seeds:
                        await replace_article_words(conn, seed=word_seed)
                        word_count += len(word_seed.words)
                await refresh_set_counts(conn, set_id=set_id)
        suffix = f" and {word_count} article words" if args.word_directory else ""
        print(f"Imported {len(seeds)} ERC articles{suffix} into {args.set_key}")
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
    parser.add_argument("--word-directory", default=None)
    parser.add_argument("--words-only", action="store_true")
    asyncio.run(_run(parser.parse_args()))


if __name__ == "__main__":
    main()
