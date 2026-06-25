from __future__ import annotations

import asyncpg


async def init_input(conn: asyncpg.Connection) -> None:
    await conn.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS input_sets (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          key TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          exam TEXT NOT NULL DEFAULT '',
          article_count INTEGER NOT NULL DEFAULT 0,
          question_count INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS input_articles (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          set_id UUID NOT NULL REFERENCES input_sets(id) ON DELETE CASCADE,
          article_id TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL DEFAULT '',
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS input_paragraphs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          article_pk UUID NOT NULL REFERENCES input_articles(id) ON DELETE CASCADE,
          paragraph_no INTEGER NOT NULL,
          text TEXT NOT NULL,
          UNIQUE(article_pk, paragraph_no)
        );
        """
    )
    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS input_questions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          article_pk UUID NOT NULL REFERENCES input_articles(id) ON DELETE CASCADE,
          question_id TEXT NOT NULL UNIQUE,
          question_no INTEGER NOT NULL,
          stem TEXT NOT NULL,
          mode TEXT NOT NULL CHECK (mode IN ('fill', 'subjective')),
          input_config JSONB NOT NULL DEFAULT '{}'::jsonb,
          accepted_answers JSONB NOT NULL DEFAULT '[]'::jsonb,
          match_rule TEXT NOT NULL DEFAULT 'exact',
          case_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
          rubric TEXT NOT NULL DEFAULT '',
          reference_answer TEXT NOT NULL DEFAULT '',
          explanation TEXT NOT NULL DEFAULT '',
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    await conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_input_articles_set ON input_articles(set_id, sort_order);"
    )
    await conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_input_questions_article ON input_questions(article_pk, sort_order);"
    )
    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS input_set_snapshots (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
          set_id UUID NOT NULL REFERENCES input_sets(id) ON DELETE CASCADE,
          total_questions INTEGER NOT NULL DEFAULT 0,
          answered_count INTEGER NOT NULL DEFAULT 0,
          correct_count INTEGER NOT NULL DEFAULT 0,
          avg_score NUMERIC,
          total_time_ms INTEGER NOT NULL DEFAULT 0,
          mode_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
          wrong_question_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
          focus_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
          trigger_reason TEXT NOT NULL DEFAULT 'phase_end',
          focus_run_id UUID NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    await conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_input_snapshots_user_set ON input_set_snapshots(user_id, set_id, created_at DESC);"
    )
    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS input_user_answers (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
          question_id TEXT NOT NULL,
          set_id UUID NOT NULL REFERENCES input_sets(id) ON DELETE CASCADE,
          user_input TEXT NOT NULL,
          is_correct BOOLEAN,
          score NUMERIC,
          time_spent_ms INTEGER,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(user_id, question_id, created_at)
        );
        """
    )
    await conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_input_answers_user_set ON input_user_answers(user_id, set_id, created_at DESC);"
    )
