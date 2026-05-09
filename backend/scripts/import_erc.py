from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

import asyncpg

from routes.auth_routes import _database_url
from routes.erc.importer import load_article_seeds
from routes.erc.repository import init_tables, refresh_set_counts, upsert_article_seed, upsert_set


async def _run(args: argparse.Namespace) -> None:
    pool = await asyncpg.create_pool(dsn=_database_url(), min_size=1, max_size=2, command_timeout=60)
    try:
        await init_tables(pool)
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
                await refresh_set_counts(conn, set_id=set_id)
        print(f"Imported {len(seeds)} ERC articles into {args.set_key}")
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
