from __future__ import annotations

import json
from datetime import date
from typing import Any

import asyncpg


async def init_tables(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS papers (
              id BIGSERIAL PRIMARY KEY,
              user_id BIGINT NOT NULL,
              arxiv_id TEXT NOT NULL,
              title TEXT NOT NULL DEFAULT '',
              is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
              is_read BOOLEAN NOT NULL DEFAULT FALSE,
              is_skipped BOOLEAN NOT NULL DEFAULT FALSE,
              tag_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
              UNIQUE (user_id, arxiv_id)
            );
            """
        )
        await conn.execute("ALTER TABLE papers ADD COLUMN IF NOT EXISTS user_id BIGINT;")
        await conn.execute("ALTER TABLE papers ADD COLUMN IF NOT EXISTS arxiv_id TEXT;")
        await conn.execute("ALTER TABLE papers ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';")
        await conn.execute("ALTER TABLE papers ALTER COLUMN title SET DEFAULT '';")
        await conn.execute("UPDATE papers SET title = '' WHERE title IS NULL;")
        await conn.execute("ALTER TABLE papers ALTER COLUMN title SET NOT NULL;")
        await conn.execute("ALTER TABLE papers ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT FALSE;")
        await conn.execute("ALTER TABLE papers ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE;")
        await conn.execute("ALTER TABLE papers ADD COLUMN IF NOT EXISTS is_skipped BOOLEAN NOT NULL DEFAULT FALSE;")
        await conn.execute(
            "ALTER TABLE papers ADD COLUMN IF NOT EXISTS tag_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb;"
        )
        await conn.execute("UPDATE papers SET tag_ids_json = '[]'::jsonb WHERE tag_ids_json IS NULL;")
        await conn.execute("ALTER TABLE papers ALTER COLUMN tag_ids_json SET DEFAULT '[]'::jsonb;")
        await conn.execute("ALTER TABLE papers ALTER COLUMN tag_ids_json SET NOT NULL;")
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS paper_tag_defs (
              id BIGSERIAL PRIMARY KEY,
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              name TEXT NOT NULL,
              color TEXT NOT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              UNIQUE(user_id, name)
            );
            """
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_paper_tag_defs_user_created ON paper_tag_defs(user_id, created_at DESC);"
        )
        await conn.execute(
            """
            DO $$
            BEGIN
              IF NOT EXISTS (
                SELECT 1
                FROM information_schema.table_constraints
                WHERE table_name = 'papers' AND constraint_name = 'uniq_papers_user_arxiv'
              ) THEN
                ALTER TABLE papers ADD CONSTRAINT uniq_papers_user_arxiv UNIQUE (user_id, arxiv_id);
              END IF;
            END$$;
            """
        )
        await conn.execute(
            """
            DO $$
            BEGIN
              IF NOT EXISTS (
                SELECT 1
                FROM information_schema.table_constraints
                WHERE table_name = 'papers' AND constraint_name = 'fk_papers_user_id'
              ) THEN
                ALTER TABLE papers
                ADD CONSTRAINT fk_papers_user_id
                FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;
              END IF;
            END$$;
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS arxiv_daily_configs (
              user_id BIGINT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
              keywords TEXT NOT NULL,
              category TEXT NULL,
              author TEXT NULL,
              limit_count INTEGER NOT NULL DEFAULT 20,
              sort_by TEXT NOT NULL DEFAULT 'submitted_date',
              sort_order TEXT NOT NULL DEFAULT 'descending',
              search_field TEXT NOT NULL DEFAULT 'title',
              update_time TIME NOT NULL,
              last_run_on DATE NULL,
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS arxiv_daily_candidates (
              id BIGSERIAL PRIMARY KEY,
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              candidate_date DATE NOT NULL,
              arxiv_id TEXT NOT NULL,
              title TEXT NOT NULL,
              authors_json JSONB NOT NULL DEFAULT '[]'::jsonb,
              published TEXT NOT NULL,
              summary TEXT NOT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              UNIQUE(user_id, candidate_date, arxiv_id)
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS arxiv_daily_task_links (
              id BIGSERIAL PRIMARY KEY,
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              candidate_date DATE NOT NULL,
              arxiv_id TEXT NOT NULL,
              task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              UNIQUE(user_id, candidate_date, arxiv_id, task_id)
            );
            """
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_daily_candidates_user_date ON arxiv_daily_candidates(user_id, candidate_date DESC);"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_daily_links_user_arxiv ON arxiv_daily_task_links(user_id, arxiv_id);"
        )


def parse_jsonb_int_list(raw_value: Any) -> list[int]:
    parsed: Any = raw_value
    if isinstance(raw_value, str):
        try:
            parsed = json.loads(raw_value)
        except json.JSONDecodeError:
            return []
    if not isinstance(parsed, list):
        return []
    values: list[int] = []
    for item in parsed:
        if isinstance(item, int):
            values.append(item)
        elif isinstance(item, str) and item.isdigit():
            values.append(int(item))
    return values


async def upsert_paper_state(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    arxiv_id: str,
    title: str,
    is_favorite: bool,
    is_read: bool,
    is_skipped: bool,
    tag_ids: list[int],
) -> asyncpg.Record:
    row = await conn.fetchrow(
        """
        INSERT INTO papers(user_id, arxiv_id, title, is_favorite, is_read, is_skipped, tag_ids_json)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        ON CONFLICT (user_id, arxiv_id)
        DO UPDATE SET
          is_favorite = EXCLUDED.is_favorite,
          is_read = EXCLUDED.is_read,
          is_skipped = EXCLUDED.is_skipped,
          title = EXCLUDED.title,
          tag_ids_json = EXCLUDED.tag_ids_json
        RETURNING user_id, arxiv_id, is_favorite, is_read, is_skipped, tag_ids_json
        """,
        user_id,
        arxiv_id,
        title,
        is_favorite,
        is_read,
        is_skipped,
        json.dumps(sorted(set(tag_ids))),
    )
    await conn.execute(
        """
        UPDATE tasks t
        SET status = CASE
            WHEN $3::BOOLEAN = TRUE THEN 'done'
            WHEN t.status = 'done' THEN 'todo'
            ELSE t.status
          END,
          updated_at = NOW()
        FROM arxiv_daily_task_links l
        WHERE l.user_id = $1
          AND l.arxiv_id = $2
          AND l.task_id = t.id
          AND t.user_id = $1
          AND t.is_deleted = FALSE
        """,
        user_id,
        arxiv_id,
        is_read,
    )
    return row


async def list_paper_states(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    is_favorite: bool | None = None,
    is_read: bool | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[asyncpg.Record]:
    clauses: list[str] = ["user_id = $1"]
    args: list[Any] = [user_id]
    if is_favorite is not None:
        args.append(is_favorite)
        clauses.append(f"is_favorite = ${len(args)}")
    if is_read is not None:
        args.append(is_read)
        clauses.append(f"is_read = ${len(args)}")
    args.append(limit)
    limit_i = len(args)
    args.append(offset)
    offset_i = len(args)
    where_sql = " AND ".join(clauses)
    sql = f"""
        SELECT user_id, arxiv_id, is_favorite, is_read, is_skipped, tag_ids_json
        FROM papers
        WHERE {where_sql}
        ORDER BY arxiv_id DESC
        LIMIT ${limit_i} OFFSET ${offset_i}
    """
    return await conn.fetch(sql, *args)


async def list_paper_tags(conn: asyncpg.Connection, *, user_id: int) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT id, user_id, name, color
        FROM paper_tag_defs
        WHERE user_id = $1
        ORDER BY created_at ASC, id ASC
        """,
        user_id,
    )


async def create_paper_tag(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    name: str,
    color: str,
) -> asyncpg.Record:
    return await conn.fetchrow(
        """
        INSERT INTO paper_tag_defs(user_id, name, color)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, name)
        DO UPDATE SET color = EXCLUDED.color
        RETURNING id, user_id, name, color
        """,
        user_id,
        name,
        color,
    )


async def delete_paper_tag(conn: asyncpg.Connection, *, user_id: int, tag_id: int) -> asyncpg.Record | None:
    row = await conn.fetchrow(
        """
        DELETE FROM paper_tag_defs
        WHERE user_id = $1 AND id = $2
        RETURNING id
        """,
        user_id,
        tag_id,
    )
    if row is None:
        return None
    await conn.execute(
        """
        UPDATE papers
        SET tag_ids_json = to_jsonb(
          COALESCE(
            ARRAY(
              SELECT value::BIGINT
              FROM jsonb_array_elements_text(tag_ids_json) AS value
              WHERE value::BIGINT <> $2
            ),
            ARRAY[]::BIGINT[]
          )
        )
        WHERE user_id = $1
        """,
        user_id,
        tag_id,
    )
    return row


async def get_daily_config(conn: asyncpg.Connection, *, user_id: int) -> asyncpg.Record | None:
    return await conn.fetchrow(
        """
        SELECT user_id, keywords, category, author, limit_count, sort_by, sort_order, search_field, update_time, updated_at, last_run_on
        FROM arxiv_daily_configs
        WHERE user_id = $1
        """,
        user_id,
    )


async def upsert_daily_config(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    keywords: str,
    category: str | None,
    author: str | None,
    limit_count: int,
    sort_by: str,
    sort_order: str,
    search_field: str,
    update_time,
) -> asyncpg.Record:
    return await conn.fetchrow(
        """
        INSERT INTO arxiv_daily_configs(user_id, keywords, category, author, limit_count, sort_by, sort_order, search_field, update_time, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
          keywords = EXCLUDED.keywords,
          category = EXCLUDED.category,
          author = EXCLUDED.author,
          limit_count = EXCLUDED.limit_count,
          sort_by = EXCLUDED.sort_by,
          sort_order = EXCLUDED.sort_order,
          search_field = EXCLUDED.search_field,
          update_time = EXCLUDED.update_time,
          updated_at = NOW()
        RETURNING user_id, keywords, category, author, limit_count, sort_by, sort_order, search_field, update_time, updated_at, last_run_on
        """,
        user_id,
        keywords,
        category,
        author,
        limit_count,
        sort_by,
        sort_order,
        search_field,
        update_time,
    )


async def delete_daily_candidates(conn: asyncpg.Connection, *, user_id: int, candidate_date: date) -> None:
    await conn.execute(
        "DELETE FROM arxiv_daily_candidates WHERE user_id = $1 AND candidate_date = $2",
        user_id,
        candidate_date,
    )


async def insert_daily_candidate(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    candidate_date: date,
    arxiv_id: str,
    title: str,
    authors_json: str,
    published: str,
    summary: str,
) -> None:
    await conn.execute(
        """
        INSERT INTO arxiv_daily_candidates(user_id, candidate_date, arxiv_id, title, authors_json, published, summary)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
        ON CONFLICT (user_id, candidate_date, arxiv_id)
        DO UPDATE SET title = EXCLUDED.title, authors_json = EXCLUDED.authors_json, published = EXCLUDED.published, summary = EXCLUDED.summary
        """,
        user_id,
        candidate_date,
        arxiv_id,
        title,
        authors_json,
        published,
        summary,
    )


async def update_daily_config_last_run(conn: asyncpg.Connection, *, user_id: int, candidate_date: date) -> None:
    await conn.execute(
        "UPDATE arxiv_daily_configs SET last_run_on = $1, updated_at = NOW() WHERE user_id = $2",
        candidate_date,
        user_id,
    )


async def fetch_filtered_arxiv_ids(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    arxiv_ids: list[str],
) -> set[str]:
    if not arxiv_ids:
        return set()
    rows = await conn.fetch(
        """
        SELECT arxiv_id
        FROM papers
        WHERE user_id = $1
          AND arxiv_id = ANY($2::text[])
          AND (is_read = TRUE OR is_favorite = TRUE OR is_skipped = TRUE)
        """,
        user_id,
        arxiv_ids,
    )
    return {str(r["arxiv_id"]) for r in rows}


async def fetch_daily_candidates(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    candidate_date: date,
) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT c.arxiv_id,
               c.title,
               c.authors_json,
               c.published,
               c.summary,
               COALESCE(p.is_read, FALSE) AS is_read,
               l.task_id AS linked_task_id,
               t.status AS linked_task_status
        FROM arxiv_daily_candidates c
        LEFT JOIN papers p
          ON p.user_id = c.user_id AND p.arxiv_id = c.arxiv_id
        LEFT JOIN LATERAL (
          SELECT task_id
          FROM arxiv_daily_task_links
          WHERE user_id = c.user_id
            AND candidate_date = c.candidate_date
            AND arxiv_id = c.arxiv_id
          ORDER BY created_at DESC
          LIMIT 1
        ) l ON TRUE
        LEFT JOIN tasks t
          ON t.id = l.task_id AND t.user_id = c.user_id AND t.is_deleted = FALSE
        WHERE c.user_id = $1 AND c.candidate_date = $2
        ORDER BY c.created_at DESC
        """,
        user_id,
        candidate_date,
    )


async def fetch_daily_candidates_for_tasks(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    candidate_date: date,
    arxiv_ids: list[str],
) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT arxiv_id, title, summary
        FROM arxiv_daily_candidates
        WHERE user_id = $1 AND candidate_date = $2 AND arxiv_id = ANY($3::text[])
        """,
        user_id,
        candidate_date,
        arxiv_ids,
    )


async def create_task_and_link(
    conn: asyncpg.Connection,
    *,
    user_id: int,
    candidate_date: date,
    arxiv_id: str,
    title: str,
    summary: str,
) -> str | None:
    task_row = await conn.fetchrow(
        """
        INSERT INTO tasks(user_id, title, content, status, priority, target_duration, start_date, due_date)
        VALUES ($1, $2, $3, 'todo', 1, 0, NOW(), NULL)
        RETURNING id
        """,
        user_id,
        f"[Arxiv] {title}",
        f"论文摘要要点：\n{summary}",
    )
    if task_row is None:
        return None
    await conn.execute(
        """
        INSERT INTO arxiv_daily_task_links(user_id, candidate_date, arxiv_id, task_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, candidate_date, arxiv_id, task_id) DO NOTHING
        """,
        user_id,
        candidate_date,
        arxiv_id,
        task_row["id"],
    )
    return str(task_row["id"])


async def fetch_daily_configs_for_scheduler(
    conn: asyncpg.Connection,
    *,
    current_hhmm: str,
    today: date,
) -> list[asyncpg.Record]:
    return await conn.fetch(
        """
        SELECT user_id, keywords, category, author, limit_count, sort_by, sort_order, search_field, update_time, last_run_on, updated_at
        FROM arxiv_daily_configs
        WHERE to_char(update_time, 'HH24:MI') <= $1
          AND (last_run_on IS NULL OR last_run_on < $2)
        """,
        current_hhmm,
        today,
    )
