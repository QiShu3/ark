from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from typing import Any

import asyncpg
from fastapi import HTTPException, Request


def _pool_from_request(request: Request) -> asyncpg.Pool:
    """从 FastAPI request 中获取数据库连接池（复用 auth_pool）。"""
    pool = getattr(getattr(request.app, "state", None), "auth_pool", None)
    if pool is None:
        raise HTTPException(status_code=500, detail="数据库未初始化")
    return pool


async def _clear_event_template_store(conn: Any) -> None:
    """清除种子模板（通过 slug 前缀 'seed:' 标识），不影响管理员创建的模板。"""
    await conn.execute(
        "DELETE FROM event_template_store_items WHERE template_id IN (SELECT id FROM event_template_store_templates WHERE slug LIKE 'seed:%');"
    )
    await conn.execute("DELETE FROM event_template_store_templates WHERE slug LIKE 'seed:%';")


async def _ensure_check_constraint(conn: Any, *, table: str, name: str, condition: str) -> None:
    """Add a check constraint if it is absent.

    Postgres has no ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS. During dev hot reloads,
    two startup migrations can briefly overlap, so this block also ignores duplicate_object.
    """
    await conn.execute(
        f"""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint c
                JOIN pg_class t ON t.oid = c.conrelid
                JOIN pg_namespace n ON n.oid = t.relnamespace
                WHERE n.nspname = current_schema()
                  AND t.relname = '{table}'
                  AND c.conname = '{name}'
            ) THEN
                ALTER TABLE {table} ADD CONSTRAINT {name} CHECK ({condition});
            END IF;
        EXCEPTION
            WHEN duplicate_object THEN
                NULL;
        END $$;
        """
    )


async def _ensure_unique_index(conn: Any, *, table: str, name: str, columns: str) -> None:
    """Add a unique index if it is absent.

    Older startup migrations may have left the identity relation as a standalone index
    instead of a table constraint. Using a unique index here is enough for the FK below
    and avoids duplicate relation failures during hot reloads.
    """
    await conn.execute(
        f"""
        DO $$
        BEGIN
            IF to_regclass('{name}') IS NULL THEN
                CREATE UNIQUE INDEX {name} ON {table}({columns});
            END IF;
        EXCEPTION
            WHEN duplicate_table THEN
                NULL;
        END $$;
        """
    )


async def _seed_event_template_store(conn: Any) -> None:
    """写入项目内置事件模板（使用 upsert，不覆盖管理员数据）。"""
    utc_plus_8 = timezone(timedelta(hours=8))
    app_configs = [
        {
            "client_id": "flash_card",
            "app_type": "flash_card",
            "config": {
                "deckId": "kaoyan",
                "deckName": "考研",
                "dailyTargetCount": 20,
                "defaultFocusDuration": 1500,
                "addToTodayPlan": True,
            },
        },
        {
            "client_id": "choice",
            "app_type": "choice",
            "config": {
                "dailyArticleTarget": 1,
                "defaultFocusDuration": 1500,
                "addToTodayPlan": True,
            },
        },
        {
            "client_id": "input",
            "app_type": "input",
            "config": {
                "inputBankId": "default",
                "dailyQuestionTarget": 10,
                "defaultFocusDuration": 1500,
                "addToTodayPlan": True,
            },
        },
    ]
    workflows = [
        {
            "client_id": "kaoyan-english-workflow",
            "name": "考研英语",
            "focus_duration": 1500,
            "break_duration": 300,
            "default_focus_timer_mode": "countdown",
            "phases": [
                {
                    "phase_type": "focus",
                    "duration": 1500,
                    "timer_mode": "countdown",
                    "task_id": "flash_card",
                    "focus_work_type": None,
                    "is_temporary": False,
                    "record_focus": True,
                },
                {
                    "phase_type": "break",
                    "duration": 300,
                    "timer_mode": None,
                    "task_id": None,
                    "focus_work_type": None,
                    "is_temporary": False,
                    "record_focus": True,
                },
                {
                    "phase_type": "focus",
                    "duration": 300,
                    "timer_mode": "countdown",
                    "task_id": "choice",
                    "focus_work_type": None,
                    "is_temporary": False,
                    "record_focus": True,
                },
                {
                    "phase_type": "break",
                    "duration": 300,
                    "timer_mode": None,
                    "task_id": None,
                    "focus_work_type": None,
                    "is_temporary": False,
                    "record_focus": True,
                },
                {
                    "phase_type": "focus",
                    "duration": 300,
                    "timer_mode": "countdown",
                    "task_id": "input",
                    "focus_work_type": None,
                    "is_temporary": False,
                    "record_focus": True,
                },
                {
                    "phase_type": "break",
                    "duration": 300,
                    "timer_mode": None,
                    "task_id": None,
                    "focus_work_type": None,
                    "is_temporary": False,
                    "record_focus": True,
                },
            ],
        }
    ]
    await conn.execute(
        """
        INSERT INTO event_template_store_templates(
            slug, category, name, description, schedule_mode,
            default_event_name, default_start_date, default_due_at, default_is_primary,
            app_configs, workflows, sort_order, is_published
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::JSONB, $11::JSONB, $12, TRUE)
        ON CONFLICT (slug) DO UPDATE SET
            category = EXCLUDED.category,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            schedule_mode = EXCLUDED.schedule_mode,
            default_event_name = EXCLUDED.default_event_name,
            default_start_date = EXCLUDED.default_start_date,
            default_due_at = EXCLUDED.default_due_at,
            default_is_primary = EXCLUDED.default_is_primary,
            app_configs = EXCLUDED.app_configs,
            workflows = EXCLUDED.workflows,
            sort_order = EXCLUDED.sort_order,
            updated_at = NOW()
        """,
        "seed:kaoyan-english",
        "考研",
        "考研英语",
        "项目内置模板，包含词书、真题练习和复习工作流。",
        "before_due",
        "考研英语",
        date(2026, 5, 24),
        datetime(2026, 12, 26, 8, 0, tzinfo=utc_plus_8),
        True,
        json.dumps(app_configs, ensure_ascii=False),
        json.dumps(workflows, ensure_ascii=False),
        0,
    )


async def init_todo(app: Any) -> None:
    """初始化 ToDo 所需数据表（复用已创建的连接池）。"""
    pool = getattr(getattr(app, "state", None), "auth_pool", None)
    if pool is None:
        raise RuntimeError("auth_pool 未初始化，无法创建 ToDo 表")

    async with pool.acquire() as conn:
        await conn.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
        # Create events table first because tasks, focus_workflows, etc. reference it
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS events (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              name VARCHAR(255) NOT NULL,
              start_date DATE,
              due_at TIMESTAMPTZ NOT NULL,
              is_primary BOOLEAN NOT NULL DEFAULT FALSE,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute("ALTER TABLE events ADD COLUMN IF NOT EXISTS start_date DATE;")
        await conn.execute("ALTER TABLE events ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;")
        await conn.execute("ALTER TABLE events ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;")
        await conn.execute("UPDATE events SET start_date = DATE(due_at AT TIME ZONE 'UTC') WHERE start_date IS NULL;")
        await conn.execute("ALTER TABLE events ALTER COLUMN name SET NOT NULL;")
        await conn.execute("ALTER TABLE events ALTER COLUMN start_date SET NOT NULL;")
        await conn.execute("ALTER TABLE events ALTER COLUMN due_at SET NOT NULL;")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_events_user_due_at ON events(user_id, due_at ASC);")
        await conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS uniq_events_primary_per_user ON events(user_id) WHERE is_primary = TRUE;"
        )
        # App ownership is initialized before events, so attach this foreign key
        # here once the events table is guaranteed to exist.
        await conn.execute("ALTER TABLE deliberate_sub_apps DROP CONSTRAINT IF EXISTS fk_deliberate_sub_apps_event_id;")
        await conn.execute(
            """
            ALTER TABLE deliberate_sub_apps
            ADD CONSTRAINT fk_deliberate_sub_apps_event_id
            FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;
            """
        )

        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS tasks (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              title VARCHAR(255) NOT NULL,
              content TEXT NULL,
              status VARCHAR(20) NOT NULL DEFAULT 'todo',
              current_cycle_count INTEGER NOT NULL DEFAULT 0,
              target_cycle_count INTEGER NOT NULL DEFAULT 0,
              cycle_period VARCHAR(20) NOT NULL DEFAULT 'daily',
              cycle_every_days INTEGER NULL,
              event TEXT NOT NULL DEFAULT '',
              event_ids UUID[] NOT NULL DEFAULT '{}',
              task_type VARCHAR(20) NOT NULL DEFAULT 'focus',
              actual_duration INTEGER NOT NULL DEFAULT 0,
              start_date TIMESTAMPTZ NULL,
              due_date TIMESTAMPTZ NULL,
              manually_scheduled_for_today BOOLEAN NOT NULL DEFAULT FALSE,
              source_type VARCHAR(20) NOT NULL DEFAULT 'user',
              app_id VARCHAR(40) NULL,
              app_task_type VARCHAR(80) NULL,
              app_config_id UUID NULL,
              app_instance_key VARCHAR(160) NULL,
              managed_by_app BOOLEAN NOT NULL DEFAULT FALSE,
              is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              CONSTRAINT chk_tasks_status CHECK (status IN ('todo', 'done')),
              CONSTRAINT chk_tasks_type CHECK (task_type IN ('focus', 'checkin')),
              CONSTRAINT chk_tasks_source_type CHECK (source_type IN ('user', 'app')),
              CONSTRAINT chk_tasks_app_id CHECK (app_id IS NULL OR app_id IN ('flash', 'vocab', 'erc', 'input')),
              CONSTRAINT chk_tasks_app_task_type CHECK (app_task_type IS NULL OR app_task_type IN ('flash_card', 'choice', 'input')),
              CONSTRAINT chk_tasks_app_metadata_consistency CHECK (
                  (
                    source_type = 'user'
                    AND managed_by_app = FALSE
                    AND app_id IS NULL
                    AND app_task_type IS NULL
                    AND app_config_id IS NULL
                    AND app_instance_key IS NULL
                  )
                  OR
                  (
                    source_type = 'app'
                    AND managed_by_app = TRUE
                    AND app_id IS NOT NULL
                    AND app_task_type IS NOT NULL
                    AND app_config_id IS NOT NULL
                  )
              ),
              CONSTRAINT chk_tasks_current_cycle_count CHECK (current_cycle_count >= 0),
              CONSTRAINT chk_tasks_target_cycle_count CHECK (target_cycle_count >= 0),
              CONSTRAINT chk_tasks_cycle_period CHECK (cycle_period IN ('daily', 'weekly', 'monthly', 'custom')),
              CONSTRAINT chk_tasks_cycle_every_days CHECK (
                  (cycle_period <> 'custom' AND cycle_every_days IS NULL)
                  OR
                  (cycle_period = 'custom' AND cycle_every_days IS NOT NULL AND cycle_every_days >= 1)
              ),
              CONSTRAINT chk_tasks_actual_duration CHECK (actual_duration >= 0)
            );
            """
        )
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ NULL;")
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS current_cycle_count INTEGER NOT NULL DEFAULT 0;")
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS target_cycle_count INTEGER NOT NULL DEFAULT 0;")
        await conn.execute(
            "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cycle_period VARCHAR(20) NOT NULL DEFAULT 'daily';"
        )
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cycle_every_days INTEGER NULL;")
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS event TEXT NOT NULL DEFAULT '';")
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS event_ids UUID[] NOT NULL DEFAULT '{}';")
        await conn.execute(
            "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS event_id UUID NULL REFERENCES events(id) ON DELETE SET NULL;"
        )
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT FALSE;")
        await conn.execute(
            "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS period_type VARCHAR(20) NOT NULL DEFAULT 'once';"
        )
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS custom_period_days INTEGER NULL;")
        await conn.execute(
            "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS max_completions_per_period INTEGER NOT NULL DEFAULT 1;"
        )
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS weekday_only BOOLEAN NOT NULL DEFAULT FALSE;")
        await conn.execute(
            "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS time_inherits_from_event BOOLEAN NOT NULL DEFAULT FALSE;"
        )
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS time_overridden BOOLEAN NOT NULL DEFAULT FALSE;")
        await conn.execute(
            "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS manually_scheduled_for_today BOOLEAN NOT NULL DEFAULT FALSE;"
        )
        await conn.execute(
            "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) NOT NULL DEFAULT 'user';"
        )
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS app_id VARCHAR(40) NULL;")
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS app_task_type VARCHAR(80) NULL;")
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS app_config_id UUID NULL;")
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS app_instance_key VARCHAR(160) NULL;")
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS managed_by_app BOOLEAN NOT NULL DEFAULT FALSE;")
        await _ensure_check_constraint(
            conn,
            table="tasks",
            name="chk_tasks_source_type",
            condition="source_type IN ('user', 'app')",
        )
        await _ensure_check_constraint(
            conn,
            table="tasks",
            name="chk_tasks_app_id",
            condition="app_id IS NULL OR app_id IN ('flash', 'vocab', 'erc', 'input')",
        )
        await conn.execute("ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_tasks_app_task_type;")
        await conn.execute("ALTER TABLE app_task_configs DROP CONSTRAINT IF EXISTS chk_app_task_configs_app_task_type;")
        await conn.execute("ALTER TABLE focus_work_runs DROP CONSTRAINT IF EXISTS chk_focus_work_runs_app_task_type;")
        await conn.execute("ALTER TABLE tasks DROP CONSTRAINT IF EXISTS fk_tasks_app_config_id;")
        await conn.execute("UPDATE app_task_configs SET app_task_type = 'flash_card' WHERE app_task_type = 'vocab_today'")
        await conn.execute("DELETE FROM app_task_configs WHERE app_task_type IN ('erc_review', 'erc_practice', 'review', 'practice')")
        await conn.execute("UPDATE focus_work_runs SET app_task_type = 'flash_card' WHERE app_task_type = 'vocab_today'")
        await conn.execute("DELETE FROM focus_work_runs WHERE app_task_type IN ('erc_review', 'erc_practice', 'review', 'practice')")
        await conn.execute("UPDATE tasks SET app_task_type = 'flash_card' WHERE app_task_type = 'vocab_today'")
        await conn.execute("DELETE FROM tasks WHERE app_task_type IN ('erc_review', 'erc_practice', 'review', 'practice')")
        await _ensure_check_constraint(
            conn,
            table="tasks",
            name="chk_tasks_app_task_type",
            condition="app_task_type IS NULL OR app_task_type IN ('flash_card', 'choice', 'input')",
        )
        await _ensure_check_constraint(
            conn,
            table="tasks",
            name="chk_tasks_app_metadata_consistency",
            condition="""
                (
                  source_type = 'user'
                  AND managed_by_app = FALSE
                  AND app_id IS NULL
                  AND app_task_type IS NULL
                  AND app_config_id IS NULL
                  AND app_instance_key IS NULL
                )
                OR
                (
                  source_type = 'app'
                  AND managed_by_app = TRUE
                  AND app_id IS NOT NULL
                  AND app_task_type IS NOT NULL
                  AND app_config_id IS NOT NULL
                )
            """,
        )
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_type VARCHAR(20) NOT NULL DEFAULT 'focus';")
        await _ensure_check_constraint(
            conn,
            table="tasks",
            name="chk_tasks_type",
            condition="task_type IN ('focus', 'checkin')",
        )
        await conn.execute("ALTER TABLE tasks DROP COLUMN IF EXISTS category;")
        await conn.execute("UPDATE tasks SET status = 'todo' WHERE status = 'doing';")
        await _ensure_check_constraint(
            conn,
            table="tasks",
            name="chk_tasks_status",
            condition="status IN ('todo', 'done')",
        )
        await _ensure_check_constraint(
            conn,
            table="tasks",
            name="chk_tasks_current_cycle_count",
            condition="current_cycle_count >= 0",
        )
        await _ensure_check_constraint(
            conn,
            table="tasks",
            name="chk_tasks_target_cycle_count",
            condition="target_cycle_count >= 0",
        )
        await _ensure_check_constraint(
            conn,
            table="tasks",
            name="chk_tasks_cycle_period",
            condition="cycle_period IN ('daily', 'weekly', 'monthly', 'custom')",
        )
        await _ensure_check_constraint(
            conn,
            table="tasks",
            name="chk_tasks_cycle_every_days",
            condition="""
                (cycle_period <> 'custom' AND cycle_every_days IS NULL)
                OR
                (cycle_period = 'custom' AND cycle_every_days IS NOT NULL AND cycle_every_days >= 1)
            """,
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS app_task_configs (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              app_id VARCHAR(40) NOT NULL,
              app_task_type VARCHAR(80) NOT NULL,
              config JSONB NOT NULL DEFAULT '{}'::JSONB,
              status VARCHAR(20) NOT NULL DEFAULT 'active',
              created_task_id UUID NULL REFERENCES tasks(id) ON DELETE SET NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              CONSTRAINT chk_app_task_configs_app_id CHECK (app_id IN ('flash', 'vocab', 'erc', 'input')),
              CONSTRAINT chk_app_task_configs_app_task_type CHECK (app_task_type IN ('flash_card', 'choice', 'input')),
              CONSTRAINT chk_app_task_configs_status CHECK (status IN ('active', 'disabled', 'invalid')),
              CONSTRAINT uniq_app_task_configs_identity UNIQUE (id, user_id, app_id, app_task_type)
            );
            """
        )
        await conn.execute(
            "ALTER TABLE app_task_configs ADD COLUMN IF NOT EXISTS user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE;"
        )
        await conn.execute("ALTER TABLE app_task_configs ADD COLUMN IF NOT EXISTS app_id VARCHAR(40) NOT NULL;")
        await conn.execute("ALTER TABLE app_task_configs ADD COLUMN IF NOT EXISTS app_task_type VARCHAR(80) NOT NULL;")
        await conn.execute(
            "ALTER TABLE app_task_configs ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::JSONB;"
        )
        await conn.execute(
            "ALTER TABLE app_task_configs ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';"
        )
        await conn.execute(
            "ALTER TABLE app_task_configs ADD COLUMN IF NOT EXISTS created_task_id UUID NULL REFERENCES tasks(id) ON DELETE SET NULL;"
        )
        await conn.execute(
            "ALTER TABLE app_task_configs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();"
        )
        await conn.execute(
            "ALTER TABLE app_task_configs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();"
        )
        await conn.execute("ALTER TABLE app_task_configs DROP CONSTRAINT IF EXISTS chk_app_task_configs_app_id;")
        await conn.execute(
            "ALTER TABLE app_task_configs ADD CONSTRAINT chk_app_task_configs_app_id CHECK (app_id IN ('flash', 'vocab', 'erc', 'input'));"
        )
        await conn.execute("ALTER TABLE app_task_configs DROP CONSTRAINT IF EXISTS chk_app_task_configs_app_task_type;")
        await conn.execute(
            "ALTER TABLE app_task_configs ADD CONSTRAINT chk_app_task_configs_app_task_type CHECK (app_task_type IN ('flash_card', 'choice', 'input'));"
        )
        await conn.execute("ALTER TABLE app_task_configs DROP CONSTRAINT IF EXISTS chk_app_task_configs_status;")
        await conn.execute(
            "ALTER TABLE app_task_configs ADD CONSTRAINT chk_app_task_configs_status CHECK (status IN ('active', 'disabled', 'invalid'));"
        )
        await conn.execute("ALTER TABLE tasks DROP CONSTRAINT IF EXISTS fk_tasks_app_config_id;")
        await conn.execute("ALTER TABLE app_task_configs DROP CONSTRAINT IF EXISTS uniq_app_task_configs_identity;")
        await _ensure_unique_index(
            conn,
            table="app_task_configs",
            name="uniq_app_task_configs_identity",
            columns="id, user_id, app_id, app_task_type",
        )
        await conn.execute("DROP INDEX IF EXISTS idx_app_task_configs_active_unique;")
        await conn.execute("DROP INDEX IF EXISTS uniq_tasks_active_app_managed;")
        await conn.execute("ALTER TABLE tasks DROP CONSTRAINT IF EXISTS fk_tasks_app_config_id;")
        await conn.execute(
            """
            ALTER TABLE tasks
            ADD CONSTRAINT fk_tasks_app_config_id
            FOREIGN KEY (app_config_id, user_id, app_id, app_task_type)
            REFERENCES app_task_configs(id, user_id, app_id, app_task_type);
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS appointments (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              title VARCHAR(255) NOT NULL,
              content TEXT NULL,
              status VARCHAR(20) NOT NULL DEFAULT 'pending',
              starts_at TIMESTAMPTZ NULL,
              ends_at TIMESTAMPTZ NOT NULL,
              repeat_rule VARCHAR(120) NULL,
              linked_task_id UUID NULL REFERENCES tasks(id) ON DELETE SET NULL,
              is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              CONSTRAINT chk_appointments_status CHECK (status IN ('pending', 'attended', 'missed', 'cancelled'))
            );
            """
        )
        await conn.execute("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS content TEXT NULL;")
        await conn.execute(
            "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending';"
        )
        await conn.execute("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ NULL;")
        await conn.execute("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;")
        await conn.execute("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS repeat_rule VARCHAR(120) NULL;")
        await conn.execute(
            "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS linked_task_id UUID NULL REFERENCES tasks(id) ON DELETE SET NULL;"
        )
        await conn.execute(
            "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS event_id UUID NULL REFERENCES events(id) ON DELETE SET NULL;"
        )
        await conn.execute(
            "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT FALSE;"
        )
        await conn.execute(
            "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS period_type VARCHAR(20) NOT NULL DEFAULT 'once';"
        )
        await conn.execute("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS custom_period_days INTEGER NULL;")
        await conn.execute(
            "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS max_completions_per_period INTEGER NOT NULL DEFAULT 1;"
        )
        await conn.execute(
            "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS weekday_only BOOLEAN NOT NULL DEFAULT FALSE;"
        )
        await conn.execute(
            "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS time_inherits_from_event BOOLEAN NOT NULL DEFAULT FALSE;"
        )
        await conn.execute(
            "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS time_overridden BOOLEAN NOT NULL DEFAULT FALSE;"
        )
        await conn.execute(
            "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;"
        )
        await conn.execute(
            "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();"
        )
        await conn.execute(
            "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();"
        )
        await conn.execute("ALTER TABLE appointments DROP CONSTRAINT IF EXISTS chk_appointments_status;")
        await conn.execute(
            "ALTER TABLE appointments ADD CONSTRAINT chk_appointments_status CHECK (status IN ('pending', 'attended', 'missed', 'cancelled'));"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_appointments_user_ends_at ON appointments(user_id, ends_at ASC);"
        )
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_appointments_user_status ON appointments(user_id, status);")
        await conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_linked_task_unique
            ON appointments(linked_task_id)
            WHERE linked_task_id IS NOT NULL AND is_deleted = FALSE;
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS appointment_occurrence_results (
              appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
              occurrence_ends_at TIMESTAMPTZ NOT NULL,
              status VARCHAR(20) NOT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              PRIMARY KEY (appointment_id, occurrence_ends_at),
              CONSTRAINT chk_appointment_occurrence_results_status
                CHECK (status IN ('attended', 'missed', 'cancelled'))
            );
            """
        )
        await conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_appointment_occurrence_results_lookup
            ON appointment_occurrence_results(appointment_id, occurrence_ends_at ASC);
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS completion_records (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              subject_type VARCHAR(20) NOT NULL,
              subject_id UUID NOT NULL,
              completed_at TIMESTAMPTZ NOT NULL,
              counted_period_start TIMESTAMPTZ NULL,
              counted_period_end TIMESTAMPTZ NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              CONSTRAINT chk_completion_records_subject_type CHECK (subject_type IN ('task', 'appointment'))
            );
            """
        )
        await conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_completion_records_subject_lookup
            ON completion_records(user_id, subject_type, subject_id, completed_at DESC);
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS focus_logs (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
              duration INTEGER NOT NULL,
              start_time TIMESTAMPTZ NOT NULL,
              end_at TIMESTAMPTZ NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              CONSTRAINT chk_focus_logs_duration CHECK (duration >= 0),
              CONSTRAINT chk_focus_logs_end_at CHECK (end_at IS NULL OR end_at >= start_time)
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS focus_workflows (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              task_id UUID NULL REFERENCES tasks(id) ON DELETE SET NULL,
              workflow_name VARCHAR(100) NOT NULL DEFAULT '默认工作流',
              phases JSONB NOT NULL DEFAULT '[]'::jsonb,
              current_phase_index INTEGER NOT NULL DEFAULT 0,
              focus_duration INTEGER NOT NULL,
              break_duration INTEGER NOT NULL,
              current_phase VARCHAR(20) NOT NULL,
              phase_started_at TIMESTAMPTZ NOT NULL,
              phase_planned_duration INTEGER NOT NULL,
              pending_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
              pending_task_selection BOOLEAN NOT NULL DEFAULT FALSE,
              runtime_task_id UUID NULL REFERENCES tasks(id) ON DELETE SET NULL,
              status VARCHAR(20) NOT NULL DEFAULT 'active',
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              ended_at TIMESTAMPTZ NULL,
              CONSTRAINT chk_focus_workflows_focus_duration CHECK (focus_duration >= 60),
              CONSTRAINT chk_focus_workflows_break_duration CHECK (break_duration >= 60),
              CONSTRAINT chk_focus_workflows_phase CHECK (current_phase IN ('focus', 'break', 'settlement')),
              CONSTRAINT chk_focus_workflows_status CHECK (status IN ('active', 'stopped'))
            );
            """
        )
        await conn.execute(
            "ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS pending_confirmation BOOLEAN NOT NULL DEFAULT FALSE;"
        )
        await conn.execute(
            "ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS pending_task_selection BOOLEAN NOT NULL DEFAULT FALSE;"
        )
        await conn.execute(
            "ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS runtime_task_id UUID NULL REFERENCES tasks(id) ON DELETE SET NULL;"
        )
        await conn.execute("ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ NULL;")
        await conn.execute(
            "ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT FALSE;"
        )
        await conn.execute("ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ NULL;")
        await conn.execute(
            "ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS active_focus_work_type VARCHAR(40) NULL;"
        )
        await conn.execute(
            "ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS focus_work_display_state VARCHAR(20) NULL;"
        )
        await conn.execute("ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS focus_work_result VARCHAR(20) NULL;")
        await conn.execute(
            "ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS focus_work_progress_snapshot JSONB NULL;"
        )
        await conn.execute(
            "ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS record_focus BOOLEAN NOT NULL DEFAULT TRUE;"
        )
        await conn.execute("ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS active_run_id UUID NULL;")
        await conn.execute("ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS phase_runtime_state VARCHAR(80) NULL;")
        await conn.execute(
            "ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS phase_runtime_state_before_timeout_prompt VARCHAR(80) NULL;"
        )
        await conn.execute(
            "ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS workflow_name VARCHAR(100) NOT NULL DEFAULT '默认工作流';"
        )
        await conn.execute(
            "ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS phases JSONB NOT NULL DEFAULT '[]'::jsonb;"
        )
        await conn.execute(
            "ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS current_phase_index INTEGER NOT NULL DEFAULT 0;"
        )
        await conn.execute("ALTER TABLE focus_workflows DROP CONSTRAINT IF EXISTS chk_focus_workflows_phase;")
        await conn.execute(
            "ALTER TABLE focus_workflows ADD CONSTRAINT chk_focus_workflows_phase CHECK (current_phase IN ('focus', 'break', 'settlement'));"
        )
        await conn.execute("ALTER TABLE focus_workflows DROP CONSTRAINT IF EXISTS chk_focus_workflows_status;")
        await conn.execute(
            "ALTER TABLE focus_workflows ADD CONSTRAINT chk_focus_workflows_status CHECK (status IN ('active', 'stopped'));"
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS focus_workflow_presets (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              name VARCHAR(50) NOT NULL,
              icon VARCHAR(50) NULL,
              focus_duration INTEGER NOT NULL,
              break_duration INTEGER NOT NULL,
              default_focus_timer_mode VARCHAR(20) NOT NULL DEFAULT 'countdown',
              phases JSONB NOT NULL DEFAULT '[]'::jsonb,
              is_default BOOLEAN NOT NULL DEFAULT FALSE,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              CONSTRAINT chk_focus_workflow_presets_focus_duration CHECK (focus_duration >= 60),
              CONSTRAINT chk_focus_workflow_presets_break_duration CHECK (break_duration >= 60),
              CONSTRAINT chk_focus_workflow_presets_timer_mode CHECK (default_focus_timer_mode IN ('countdown', 'countup'))
            );
            """
        )
        await conn.execute(
            "ALTER TABLE focus_workflow_presets ADD COLUMN IF NOT EXISTS phases JSONB NOT NULL DEFAULT '[]'::jsonb;"
        )
        await conn.execute(
            "ALTER TABLE focus_workflow_presets ADD COLUMN IF NOT EXISTS default_focus_timer_mode VARCHAR(20) NOT NULL DEFAULT 'countdown';"
        )
        await conn.execute(
            "ALTER TABLE focus_workflow_presets DROP CONSTRAINT IF EXISTS chk_focus_workflow_presets_timer_mode;"
        )
        await conn.execute(
            "ALTER TABLE focus_workflow_presets ADD CONSTRAINT chk_focus_workflow_presets_timer_mode CHECK (default_focus_timer_mode IN ('countdown', 'countup'));"
        )
        await conn.execute(
            "ALTER TABLE focus_workflow_presets ADD COLUMN IF NOT EXISTS icon VARCHAR(50) NULL;"
        )

        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS focus_work_runs (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              workflow_id UUID NOT NULL REFERENCES focus_workflows(id) ON DELETE CASCADE,
              phase_index INTEGER NOT NULL,
              task_id UUID NULL REFERENCES tasks(id) ON DELETE SET NULL,
              focus_work_type VARCHAR(80) NOT NULL,
              app_id VARCHAR(40) NULL,
              app_task_type VARCHAR(80) NULL,
              counts_for_task_completion BOOLEAN NOT NULL DEFAULT TRUE,
              status VARCHAR(40) NOT NULL,
              record_focus BOOLEAN NOT NULL DEFAULT TRUE,
              config_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
              progress_snapshot JSONB NULL,
              completion_reason VARCHAR(80) NULL,
              source_run_id UUID NULL REFERENCES focus_work_runs(id) ON DELETE SET NULL,
              started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              paused_at TIMESTAMPTZ NULL,
              ended_at TIMESTAMPTZ NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              CONSTRAINT chk_focus_work_runs_status CHECK (status IN ('running', 'paused', 'content_completed', 'completed', 'abandoned')),
              CONSTRAINT chk_focus_work_runs_type CHECK (focus_work_type IN ('flash_card', 'choice', 'input', 'task_focus')),
              CONSTRAINT chk_focus_work_runs_app_id CHECK (app_id IS NULL OR app_id IN ('flash', 'vocab', 'erc', 'input')),
              CONSTRAINT chk_focus_work_runs_app_task_type CHECK (app_task_type IS NULL OR app_task_type IN ('flash_card', 'choice', 'input'))
            );
            """
        )
        await conn.execute("ALTER TABLE focus_work_runs ADD COLUMN IF NOT EXISTS user_id BIGINT;")
        await conn.execute("ALTER TABLE focus_work_runs ADD COLUMN IF NOT EXISTS workflow_id UUID;")
        await conn.execute("ALTER TABLE focus_work_runs ADD COLUMN IF NOT EXISTS phase_index INTEGER NOT NULL DEFAULT 0;")
        await conn.execute("ALTER TABLE focus_work_runs ADD COLUMN IF NOT EXISTS task_id UUID NULL;")
        await conn.execute("ALTER TABLE focus_work_runs ADD COLUMN IF NOT EXISTS focus_work_type VARCHAR(80);")
        await conn.execute(
            "ALTER TABLE focus_work_runs ADD COLUMN IF NOT EXISTS counts_for_task_completion BOOLEAN NOT NULL DEFAULT TRUE;"
        )
        await conn.execute(
            "ALTER TABLE focus_work_runs ADD COLUMN IF NOT EXISTS status VARCHAR(40) NOT NULL DEFAULT 'running';"
        )
        await conn.execute(
            "ALTER TABLE focus_work_runs ADD COLUMN IF NOT EXISTS record_focus BOOLEAN NOT NULL DEFAULT TRUE;"
        )
        await conn.execute(
            "ALTER TABLE focus_work_runs ADD COLUMN IF NOT EXISTS config_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;"
        )
        await conn.execute("ALTER TABLE focus_work_runs ADD COLUMN IF NOT EXISTS progress_snapshot JSONB NULL;")
        await conn.execute("ALTER TABLE focus_work_runs ADD COLUMN IF NOT EXISTS completion_reason VARCHAR(80) NULL;")
        await conn.execute("ALTER TABLE focus_work_runs ADD COLUMN IF NOT EXISTS source_run_id UUID NULL;")
        await conn.execute("ALTER TABLE focus_work_runs ADD COLUMN IF NOT EXISTS app_id VARCHAR(40) NULL;")
        await conn.execute("ALTER TABLE focus_work_runs ADD COLUMN IF NOT EXISTS app_task_type VARCHAR(80) NULL;")
        await conn.execute(
            "ALTER TABLE focus_work_runs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT NOW();"
        )
        await conn.execute("ALTER TABLE focus_work_runs ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ NULL;")
        await conn.execute("ALTER TABLE focus_work_runs ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ NULL;")
        await conn.execute(
            "ALTER TABLE focus_work_runs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();"
        )
        await conn.execute(
            "ALTER TABLE focus_work_runs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();"
        )
        await conn.execute("ALTER TABLE focus_work_runs DROP CONSTRAINT IF EXISTS chk_focus_work_runs_status;")
        await conn.execute(
            "ALTER TABLE focus_work_runs ADD CONSTRAINT chk_focus_work_runs_status CHECK (status IN ('running', 'paused', 'content_completed', 'completed', 'abandoned'));"
        )
        await conn.execute("ALTER TABLE focus_work_runs DROP CONSTRAINT IF EXISTS chk_focus_work_runs_type;")
        await conn.execute("UPDATE focus_work_runs SET focus_work_type = 'flash_card' WHERE focus_work_type = 'vocab_today'")
        await conn.execute("UPDATE focus_work_runs SET focus_work_type = 'choice' WHERE focus_work_type IN ('review', 'practice', 'erc_review', 'erc_practice')")
        await conn.execute(
            "ALTER TABLE focus_work_runs ADD CONSTRAINT chk_focus_work_runs_type CHECK (focus_work_type IN ('flash_card', 'choice', 'input', 'task_focus'));"
        )
        await conn.execute("ALTER TABLE focus_work_runs DROP CONSTRAINT IF EXISTS chk_focus_work_runs_app_id;")
        await conn.execute(
            "ALTER TABLE focus_work_runs ADD CONSTRAINT chk_focus_work_runs_app_id CHECK (app_id IS NULL OR app_id IN ('flash', 'vocab', 'erc', 'input'));"
        )
        await conn.execute("ALTER TABLE focus_work_runs DROP CONSTRAINT IF EXISTS chk_focus_work_runs_app_task_type;")
        await conn.execute(
            "ALTER TABLE focus_work_runs ADD CONSTRAINT chk_focus_work_runs_app_task_type CHECK (app_task_type IS NULL OR app_task_type IN ('flash_card', 'choice', 'input'));"
        )
        await conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_focus_work_runs_workflow_phase
            ON focus_work_runs(workflow_id, phase_index, created_at ASC);
            """
        )

        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tasks_user_deleted_status ON tasks(user_id, is_deleted, status);"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tasks_user_deleted_due_date ON tasks(user_id, is_deleted, due_date);"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_tasks_user_deleted_start_date ON tasks(user_id, is_deleted, start_date);"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_focus_logs_user_start ON focus_logs(user_id, start_time DESC);"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_focus_logs_task_start ON focus_logs(task_id, start_time DESC);"
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS focus_app_work_logs (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              workflow_id UUID NULL REFERENCES focus_workflows(id) ON DELETE SET NULL,
              focus_work_type VARCHAR(40) NOT NULL,
              result VARCHAR(20) NULL,
              duration INTEGER NOT NULL DEFAULT 0,
              start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              end_at TIMESTAMPTZ NULL,
              progress_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
              record_focus BOOLEAN NOT NULL DEFAULT TRUE,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              CONSTRAINT chk_focus_app_work_logs_type CHECK (focus_work_type IN ('flash_card', 'choice', 'input', 'task_focus')),
              CONSTRAINT chk_focus_app_work_logs_result CHECK (result IS NULL OR result IN ('completed', 'interrupted', 'abandoned')),
              CONSTRAINT chk_focus_app_work_logs_duration CHECK (duration >= 0),
              CONSTRAINT chk_focus_app_work_logs_end_at CHECK (end_at IS NULL OR end_at >= start_time)
            );
            """
        )
        await conn.execute("ALTER TABLE focus_app_work_logs DROP CONSTRAINT IF EXISTS chk_focus_app_work_logs_type;")
        await conn.execute("UPDATE focus_app_work_logs SET focus_work_type = 'flash_card' WHERE focus_work_type = 'vocab_today'")
        await conn.execute("UPDATE focus_app_work_logs SET focus_work_type = 'choice' WHERE focus_work_type IN ('review', 'practice', 'erc_review', 'erc_practice')")
        await conn.execute(
            """
            ALTER TABLE focus_app_work_logs
            ADD CONSTRAINT chk_focus_app_work_logs_type
            CHECK (focus_work_type IN ('flash_card', 'choice', 'input', 'task_focus'));
            """
        )
        await conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS uniq_focus_app_work_open_per_user
            ON focus_app_work_logs(user_id)
            WHERE end_at IS NULL AND record_focus = TRUE;
            """
        )
        await conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_focus_app_work_logs_user_start
            ON focus_app_work_logs(user_id, start_time DESC);
            """
        )
        await conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS uniq_focus_open_per_user ON focus_logs(user_id) WHERE end_at IS NULL;"
        )
        await conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS uniq_focus_workflow_active_per_user ON focus_workflows(user_id) WHERE status = 'active';"
        )
        # 迁移：允许 end_at 为空、放宽 duration 校验并更新时间一致性约束
        await conn.execute("ALTER TABLE focus_logs ALTER COLUMN end_at DROP NOT NULL;")
        await conn.execute("ALTER TABLE focus_logs DROP CONSTRAINT IF EXISTS chk_focus_logs_duration;")
        await conn.execute("ALTER TABLE focus_logs DROP CONSTRAINT IF EXISTS chk_focus_logs_end_at;")
        await conn.execute("ALTER TABLE focus_logs ADD CONSTRAINT chk_focus_logs_duration CHECK (duration >= 0);")
        await conn.execute(
            "ALTER TABLE focus_logs ADD CONSTRAINT chk_focus_logs_end_at CHECK (end_at IS NULL OR end_at >= start_time);"
        )
        # events table already created at the start of init_todo
        await conn.execute(
            "ALTER TABLE focus_workflow_presets ADD COLUMN IF NOT EXISTS event_id UUID NULL REFERENCES events(id) ON DELETE CASCADE;"
        )
        await conn.execute("ALTER TABLE app_task_configs ADD COLUMN IF NOT EXISTS event_id UUID NULL;")
        await conn.execute("ALTER TABLE app_task_configs DROP CONSTRAINT IF EXISTS fk_app_task_configs_event_id;")
        await conn.execute(
            """
            ALTER TABLE app_task_configs
            ADD CONSTRAINT fk_app_task_configs_event_id
            FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
            """
        )
        await conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_app_task_configs_active_event_unique
            ON app_task_configs(user_id, event_id, app_id, app_task_type)
            WHERE status = 'active' AND event_id IS NOT NULL;
            """
        )
        await conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_app_task_configs_active_global_unique
            ON app_task_configs(user_id, app_id, app_task_type)
            WHERE status = 'active' AND event_id IS NULL;
            """
        )
        await conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS uniq_tasks_active_event_app_managed
            ON tasks(user_id, event_id, app_id, app_task_type)
            WHERE source_type = 'app' AND managed_by_app = TRUE AND is_deleted = FALSE AND event_id IS NOT NULL;
            """
        )
        await conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS uniq_tasks_active_global_app_managed
            ON tasks(user_id, app_id, app_task_type)
            WHERE source_type = 'app' AND managed_by_app = TRUE AND is_deleted = FALSE AND event_id IS NULL;
            """
        )
        await conn.execute("DROP INDEX IF EXISTS uniq_focus_workflow_global_default_per_user;")
        await conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS uniq_focus_workflow_default_per_user
            ON focus_workflow_presets(user_id)
            WHERE is_default = TRUE;
            """
        )
        await conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_focus_workflow_presets_user_updated
            ON focus_workflow_presets(user_id, updated_at DESC)
            WHERE event_id IS NULL;
            """
        )
        await conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_focus_workflow_presets_event_updated
            ON focus_workflow_presets(user_id, event_id, updated_at DESC)
            WHERE event_id IS NOT NULL;
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS event_plan_templates (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              name VARCHAR(255) NOT NULL,
              description TEXT,
              schedule_mode VARCHAR(32) NOT NULL CHECK (schedule_mode IN ('from_start', 'before_due')),
              default_event_name VARCHAR(255),
              default_start_date DATE,
              default_due_at TIMESTAMPTZ,
              default_is_primary BOOLEAN,
              app_configs JSONB NOT NULL DEFAULT '[]'::jsonb,
              workflows JSONB NOT NULL DEFAULT '[]'::jsonb,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute("ALTER TABLE event_plan_templates ADD COLUMN IF NOT EXISTS default_event_name VARCHAR(255);")
        await conn.execute("ALTER TABLE event_plan_templates ADD COLUMN IF NOT EXISTS default_start_date DATE;")
        await conn.execute("ALTER TABLE event_plan_templates ADD COLUMN IF NOT EXISTS default_due_at TIMESTAMPTZ;")
        await conn.execute("ALTER TABLE event_plan_templates ADD COLUMN IF NOT EXISTS default_is_primary BOOLEAN;")
        await conn.execute(
            "ALTER TABLE event_plan_templates ADD COLUMN IF NOT EXISTS app_configs JSONB NOT NULL DEFAULT '[]'::jsonb;"
        )
        await conn.execute(
            "ALTER TABLE event_plan_templates ADD COLUMN IF NOT EXISTS workflows JSONB NOT NULL DEFAULT '[]'::jsonb;"
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS event_plan_template_items (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              template_id UUID NOT NULL REFERENCES event_plan_templates(id) ON DELETE CASCADE,
              kind VARCHAR(32) NOT NULL CHECK (kind IN ('task', 'appointment')),
              title VARCHAR(255) NOT NULL,
              content TEXT,
              offset_days INTEGER NOT NULL CHECK (offset_days >= 0),
              sort_order INTEGER NOT NULL DEFAULT 0,
              details JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute(
            "ALTER TABLE event_plan_template_items ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'::jsonb;"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_event_plan_templates_user_updated ON event_plan_templates(user_id, updated_at DESC);"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_event_plan_template_items_template_sort ON event_plan_template_items(template_id, sort_order ASC);"
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS event_template_store_templates (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              slug VARCHAR(120) NOT NULL UNIQUE,
              category VARCHAR(80) NOT NULL,
              name VARCHAR(255) NOT NULL,
              description TEXT,
              schedule_mode VARCHAR(32) NOT NULL CHECK (schedule_mode IN ('from_start', 'before_due')),
              default_event_name VARCHAR(255),
              default_start_date DATE,
              default_due_at TIMESTAMPTZ,
              default_is_primary BOOLEAN,
              app_configs JSONB NOT NULL DEFAULT '[]'::jsonb,
              workflows JSONB NOT NULL DEFAULT '[]'::jsonb,
              sort_order INTEGER NOT NULL DEFAULT 0,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS event_template_store_items (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              template_id UUID NOT NULL REFERENCES event_template_store_templates(id) ON DELETE CASCADE,
              kind VARCHAR(32) NOT NULL CHECK (kind IN ('task', 'appointment')),
              title VARCHAR(255) NOT NULL,
              content TEXT,
              offset_days INTEGER NOT NULL CHECK (offset_days >= 0),
              sort_order INTEGER NOT NULL DEFAULT 0,
              details JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_event_template_store_sort ON event_template_store_templates(sort_order ASC, name ASC);"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_event_template_store_items_sort ON event_template_store_items(template_id, sort_order ASC);"
        )
        await conn.execute(
            "ALTER TABLE event_template_store_templates ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT false"
        )

        await conn.execute("ALTER TABLE focus_work_runs ADD COLUMN IF NOT EXISTS parent_run_id UUID NULL;")
        await conn.execute("ALTER TABLE focus_work_runs ADD COLUMN IF NOT EXISTS fork_reason TEXT NULL;")
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS workflow_records (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              workflow_id UUID NOT NULL REFERENCES focus_workflows(id) ON DELETE CASCADE,
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
              status VARCHAR(20) NOT NULL DEFAULT 'running',
              started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              completed_at TIMESTAMPTZ NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              CONSTRAINT chk_workflow_records_status CHECK (status IN ('running', 'completed', 'abandoned'))
            );
            """
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_workflow_records_user_started ON workflow_records(user_id, started_at DESC);"
        )

        # Add app_id columns for sub-app support
        await conn.execute(
            "ALTER TABLE focus_workflow_presets ADD COLUMN IF NOT EXISTS app_id TEXT;"
        )
        await conn.execute(
            "ALTER TABLE workflow_records ADD COLUMN IF NOT EXISTS app_id TEXT;"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_focus_workflow_presets_app_user ON focus_workflow_presets(app_id, user_id);"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_workflow_records_app_user ON workflow_records(app_id, user_id);"
        )
        # Early guest presets used a zero-duration deliberate group, which cannot
        # be read by the workflow response schema. Normalize existing rows.
        await conn.execute(
            """
            UPDATE focus_workflow_presets
            SET phases = (
                SELECT jsonb_agg(
                    CASE
                        WHEN phase->>'phase_type' = 'deliberate_group'
                             AND COALESCE((phase->>'duration')::integer, 0) < 60
                        THEN jsonb_set(phase, '{duration}', '60'::jsonb)
                        ELSE phase
                    END
                )
                FROM jsonb_array_elements(phases) AS phase
            ), updated_at = NOW()
            WHERE EXISTS (
                SELECT 1
                FROM jsonb_array_elements(phases) AS phase
                WHERE phase->>'phase_type' = 'deliberate_group'
                  AND COALESCE((phase->>'duration')::integer, 0) < 60
            );
            """
        )

        # Test focus work configs (admin-only)
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS test_focus_configs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                focus_work_type TEXT NOT NULL CHECK (focus_work_type IN ('flash_card', 'choice', 'input', 'task_focus')),
                bank_id TEXT,
                target_count INTEGER DEFAULT 10,
                scope_json JSONB,
                completion_json JSONB,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute("ALTER TABLE test_focus_configs DROP CONSTRAINT IF EXISTS test_focus_configs_focus_work_type_check;")
        await conn.execute("UPDATE test_focus_configs SET focus_work_type = 'flash_card' WHERE focus_work_type = 'vocab_today'")
        await conn.execute("UPDATE test_focus_configs SET focus_work_type = 'choice' WHERE focus_work_type IN ('review', 'practice', 'erc_review', 'erc_practice')")
        await conn.execute("ALTER TABLE test_focus_configs ADD COLUMN IF NOT EXISTS scope_json JSONB;")
        await conn.execute("ALTER TABLE test_focus_configs ADD COLUMN IF NOT EXISTS completion_json JSONB;")

        await _clear_event_template_store(conn)
        await _seed_event_template_store(conn)
