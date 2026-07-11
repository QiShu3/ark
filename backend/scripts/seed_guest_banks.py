"""Seed demo banks for guest sub-apps.

Run: uv run python scripts/seed_guest_banks.py

Outputs bank IDs to stdout — paste them into lib/app_registry.py GUEST_APPS.bank_ids.
"""

import asyncio
import json
import os
import sys

import asyncpg


DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/ark")


async def main() -> None:
    pool = await asyncpg.create_pool(dsn=DATABASE_URL, min_size=1, max_size=2)
    async with pool.acquire() as conn:
        # --- English (vocab_deck) ---
        deck_id = await conn.fetchval(
            """
            INSERT INTO vocab_decks (key, name, description, is_published, is_guest_only)
            VALUES ('guest-kaoyan-english', '考研英语二核心词汇', '考研英语二高频核心词汇精选', true, true)
            ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name
            RETURNING id::text
            """
        )
        # Add some demo words
        demo_words = [
            ("abandon", "v. 放弃；抛弃"),
            ("abstract", "adj. 抽象的 n. 摘要"),
            ("academic", "adj. 学术的 n. 学者"),
            ("accelerate", "v. 加速；促进"),
            ("accept", "v. 接受；承认"),
            ("access", "n. 进入；通道 vt. 访问"),
            ("accomplish", "v. 完成；实现"),
            ("account", "n. 账户；描述 v. 解释"),
            ("achieve", "v. 实现；达到"),
            ("acknowledge", "v. 承认；致谢"),
        ]
        for word, definition in demo_words:
            await conn.execute(
                """
                INSERT INTO vocab_words (deck_id, word, definition, sentence, sentence_translation, phonetic)
                VALUES ($1::uuid, $2, $3, '', '', '')
                ON CONFLICT DO NOTHING
                """,
                deck_id, word, definition,
            )
        await conn.execute("UPDATE vocab_decks SET word_count = (SELECT COUNT(*) FROM vocab_words WHERE deck_id = $1::uuid) WHERE id = $1::uuid", deck_id)

        # --- Math (choice_set) ---
        math_set_id = await conn.fetchval(
            """
            INSERT INTO choice_sets (key, name, description, exam, is_published, is_guest_only)
            VALUES ('guest-math-2', '数学二选择题精选', '考研数学二典型选择题训练', '考研数学二', true, true)
            ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name
            RETURNING id::text
            """
        )

        # --- Politics (choice_set) ---
        politics_set_id = await conn.fetchval(
            """
            INSERT INTO choice_sets (key, name, description, exam, is_published, is_guest_only)
            VALUES ('guest-politics', '政治理论选择题', '考研政治马原+毛中特选择题', '考研政治', true, true)
            ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name
            RETURNING id::text
            """
        )

        # --- 408 (input_set) ---
        input_set_id = await conn.fetchval(
            """
            INSERT INTO input_sets (key, name, description, exam, is_guest_only)
            VALUES ('guest-408', '408计算机综合训练', '数据结构、计算机组成原理、操作系统、计算机网络', '408', true)
            ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name
            RETURNING id::text
            """
        )

    await pool.close()

    result = {
        "english_deck_id": str(deck_id),
        "math_set_id": str(math_set_id),
        "politics_set_id": str(politics_set_id),
        "input_408_id": str(input_set_id),
    }
    print("\n=== Guest Bank IDs ===")
    print(json.dumps(result, indent=2))
    print("\nPaste these IDs into lib/app_registry.py GUEST_APPS bank_ids.")


if __name__ == "__main__":
    asyncio.run(main())
