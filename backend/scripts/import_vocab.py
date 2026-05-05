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


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import vocab decks into Ark PostgreSQL.")
    parser.add_argument(
        "--source-dir",
        default="/Users/qishu/Project/english-vocabulary/json_original/json-sentence",
        help="Directory containing sentence-rich deck json files.",
    )
    parser.add_argument(
        "--pattern",
        default="*.json",
        help="Glob pattern used to locate deck files.",
    )
    return parser.parse_args()


def _resolve_source_dir(raw_path: str) -> Path:
    return Path(raw_path).expanduser().resolve()


async def _run() -> None:
    from routes.auth_routes import _database_url
    from routes.vocab.importer import build_deck_seed
    from routes.vocab.repository import import_deck, init_tables, sync_vocab_deck_word_counts

    args = _parse_args()
    source_dir = _resolve_source_dir(args.source_dir)
    if not source_dir.exists():
        raise SystemExit(f"Source directory not found: {source_dir}")

    pool = await asyncpg.create_pool(dsn=_database_url(), min_size=1, max_size=2, command_timeout=60)
    try:
        await init_tables(pool)
        async with pool.acquire() as conn:
            for path in sorted(source_dir.glob(args.pattern)):
                deck = build_deck_seed(path)
                async with conn.transaction():
                    deck_id = await import_deck(conn, deck)
                print(f"Imported {deck.name} ({deck.key}) -> {deck_id} with {len(deck.words)} words")
            await sync_vocab_deck_word_counts(conn)
    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(_run())
