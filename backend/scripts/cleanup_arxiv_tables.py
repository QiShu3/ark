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

TABLES_TO_DROP = [
    "arxiv_daily_task_links",
    "arxiv_daily_candidates",
    "arxiv_daily_configs",
    "paper_tag_defs",
    "papers",
]


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Drop legacy ArXiv tables after database backup.")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Execute the drop statements instead of printing the plan.",
    )
    return parser.parse_args()


async def _run() -> None:
    args = _parse_args()
    drop_sql = "DROP TABLE IF EXISTS " + ", ".join(TABLES_TO_DROP) + ";"

    if not args.apply:
        print("Dry run only. Back up the database first, then rerun with --apply.")
        print(drop_sql)
        return

    from routes.auth_routes import _database_url

    pool = await asyncpg.create_pool(dsn=_database_url(), min_size=1, max_size=1, command_timeout=60)
    try:
        async with pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute(drop_sql)
        print(f"Dropped tables: {', '.join(TABLES_TO_DROP)}")
    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(_run())
