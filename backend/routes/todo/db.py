from __future__ import annotations

from typing import Any

import asyncpg
from fastapi import HTTPException, Request


def _pool_from_request(request: Request) -> asyncpg.Pool:
    """从 FastAPI request 中获取数据库连接池（复用 auth_pool）。"""
    pool = getattr(getattr(request.app, "state", None), "auth_pool", None)
    if pool is None:
        raise HTTPException(status_code=500, detail="数据库未初始化")
    return pool


async def init_todo(app: Any) -> None:
    """初始化 ToDo 所需数据表（复用已创建的连接池）。"""
    pool = getattr(getattr(app, "state", None), "auth_pool", None)
    if pool is None:
        raise RuntimeError("auth_pool 未初始化，无法创建 ToDo 表")

    async with pool.acquire() as conn:
        await conn.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS tasks (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              title VARCHAR(255) NOT NULL,
              content TEXT NULL,
              status VARCHAR(20) NOT NULL DEFAULT 'todo',
              priority INTEGER NOT NULL DEFAULT 0,
              target_duration INTEGER NOT NULL DEFAULT 0,
              current_cycle_count INTEGER NOT NULL DEFAULT 0,
              target_cycle_count INTEGER NOT NULL DEFAULT 0,
              cycle_period VARCHAR(20) NOT NULL DEFAULT 'daily',
              cycle_every_days INTEGER NULL,
              event TEXT NOT NULL DEFAULT '',
              event_ids UUID[] NOT NULL DEFAULT '{}',
              task_type VARCHAR(20) NOT NULL DEFAULT 'focus',
              tags TEXT[] NOT NULL DEFAULT '{}',
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
              CONSTRAINT chk_tasks_app_id CHECK (app_id IS NULL OR app_id IN ('vocab', 'erc')),
              CONSTRAINT chk_tasks_app_task_type CHECK (app_task_type IS NULL OR app_task_type IN ('vocab_today', 'erc_review')),
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
              CONSTRAINT chk_tasks_priority CHECK (priority BETWEEN 0 AND 3),
              CONSTRAINT chk_tasks_target_duration CHECK (target_duration >= 0),
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
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) NOT NULL DEFAULT 'user';")
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS app_id VARCHAR(40) NULL;")
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS app_task_type VARCHAR(80) NULL;")
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS app_config_id UUID NULL;")
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS app_instance_key VARCHAR(160) NULL;")
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS managed_by_app BOOLEAN NOT NULL DEFAULT FALSE;")
        await conn.execute("ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_tasks_source_type;")
        await conn.execute("ALTER TABLE tasks ADD CONSTRAINT chk_tasks_source_type CHECK (source_type IN ('user', 'app'));")
        await conn.execute("ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_tasks_app_id;")
        await conn.execute("ALTER TABLE tasks ADD CONSTRAINT chk_tasks_app_id CHECK (app_id IS NULL OR app_id IN ('vocab', 'erc'));")
        await conn.execute("ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_tasks_app_task_type;")
        await conn.execute(
            "ALTER TABLE tasks ADD CONSTRAINT chk_tasks_app_task_type CHECK (app_task_type IS NULL OR app_task_type IN ('vocab_today', 'erc_review'));"
        )
        await conn.execute("ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_tasks_app_metadata_consistency;")
        await conn.execute(
            """
            ALTER TABLE tasks
            ADD CONSTRAINT chk_tasks_app_metadata_consistency CHECK (
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
            );
            """
        )
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_type VARCHAR(20) NOT NULL DEFAULT 'focus';")
        await conn.execute("ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_tasks_type;")
        await conn.execute("ALTER TABLE tasks ADD CONSTRAINT chk_tasks_type CHECK (task_type IN ('focus', 'checkin'));")
        await conn.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';")
        await conn.execute("ALTER TABLE tasks DROP COLUMN IF EXISTS category;")
        await conn.execute("UPDATE tasks SET status = 'todo' WHERE status = 'doing';")
        await conn.execute("ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_tasks_status;")
        await conn.execute("ALTER TABLE tasks ADD CONSTRAINT chk_tasks_status CHECK (status IN ('todo', 'done'));")
        await conn.execute("ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_tasks_current_cycle_count;")
        await conn.execute(
            "ALTER TABLE tasks ADD CONSTRAINT chk_tasks_current_cycle_count CHECK (current_cycle_count >= 0);"
        )
        await conn.execute("ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_tasks_target_cycle_count;")
        await conn.execute(
            "ALTER TABLE tasks ADD CONSTRAINT chk_tasks_target_cycle_count CHECK (target_cycle_count >= 0);"
        )
        await conn.execute("ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_tasks_cycle_period;")
        await conn.execute(
            "ALTER TABLE tasks ADD CONSTRAINT chk_tasks_cycle_period CHECK (cycle_period IN ('daily', 'weekly', 'monthly', 'custom'));"
        )
        await conn.execute("ALTER TABLE tasks DROP CONSTRAINT IF EXISTS chk_tasks_cycle_every_days;")
        await conn.execute(
            """
            ALTER TABLE tasks
            ADD CONSTRAINT chk_tasks_cycle_every_days CHECK (
                (cycle_period <> 'custom' AND cycle_every_days IS NULL)
                OR
                (cycle_period = 'custom' AND cycle_every_days IS NOT NULL AND cycle_every_days >= 1)
            );
            """
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
              CONSTRAINT chk_app_task_configs_app_id CHECK (app_id IN ('vocab', 'erc')),
              CONSTRAINT chk_app_task_configs_app_task_type CHECK (app_task_type IN ('vocab_today', 'erc_review')),
              CONSTRAINT chk_app_task_configs_status CHECK (status IN ('active', 'disabled', 'invalid')),
              CONSTRAINT uniq_app_task_configs_identity UNIQUE (id, user_id, app_id, app_task_type)
            );
            """
        )
        await conn.execute("ALTER TABLE app_task_configs ADD COLUMN IF NOT EXISTS user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE;")
        await conn.execute("ALTER TABLE app_task_configs ADD COLUMN IF NOT EXISTS app_id VARCHAR(40) NOT NULL;")
        await conn.execute("ALTER TABLE app_task_configs ADD COLUMN IF NOT EXISTS app_task_type VARCHAR(80) NOT NULL;")
        await conn.execute("ALTER TABLE app_task_configs ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::JSONB;")
        await conn.execute(
            "ALTER TABLE app_task_configs ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';"
        )
        await conn.execute("ALTER TABLE app_task_configs ADD COLUMN IF NOT EXISTS created_task_id UUID NULL REFERENCES tasks(id) ON DELETE SET NULL;")
        await conn.execute(
            "ALTER TABLE app_task_configs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();"
        )
        await conn.execute(
            "ALTER TABLE app_task_configs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();"
        )
        await conn.execute("ALTER TABLE app_task_configs DROP CONSTRAINT IF EXISTS chk_app_task_configs_app_id;")
        await conn.execute(
            "ALTER TABLE app_task_configs ADD CONSTRAINT chk_app_task_configs_app_id CHECK (app_id IN ('vocab', 'erc'));"
        )
        await conn.execute("ALTER TABLE app_task_configs DROP CONSTRAINT IF EXISTS chk_app_task_configs_app_task_type;")
        await conn.execute(
            "ALTER TABLE app_task_configs ADD CONSTRAINT chk_app_task_configs_app_task_type CHECK (app_task_type IN ('vocab_today', 'erc_review'));"
        )
        await conn.execute("ALTER TABLE app_task_configs DROP CONSTRAINT IF EXISTS chk_app_task_configs_status;")
        await conn.execute(
            "ALTER TABLE app_task_configs ADD CONSTRAINT chk_app_task_configs_status CHECK (status IN ('active', 'disabled', 'invalid'));"
        )
        await conn.execute("ALTER TABLE tasks DROP CONSTRAINT IF EXISTS fk_tasks_app_config_id;")
        await conn.execute("ALTER TABLE app_task_configs DROP CONSTRAINT IF EXISTS uniq_app_task_configs_identity;")
        await conn.execute(
            """
            ALTER TABLE app_task_configs
            ADD CONSTRAINT uniq_app_task_configs_identity UNIQUE (id, user_id, app_id, app_task_type);
            """
        )
        await conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_app_task_configs_active_unique
            ON app_task_configs(user_id, app_id, app_task_type)
            WHERE status = 'active';
            """
        )
        await conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS uniq_tasks_active_app_managed
            ON tasks(user_id, app_id, app_task_type)
            WHERE source_type = 'app' AND managed_by_app = TRUE AND is_deleted = FALSE;
            """
        )
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
              CONSTRAINT chk_focus_workflows_phase CHECK (current_phase IN ('focus', 'break')),
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
        await conn.execute("ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT FALSE;")
        await conn.execute("ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ NULL;")
        await conn.execute("ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS active_focus_work_type VARCHAR(40) NULL;")
        await conn.execute(
            "ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS focus_work_display_state VARCHAR(20) NULL;"
        )
        await conn.execute("ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS focus_work_result VARCHAR(20) NULL;")
        await conn.execute(
            "ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS focus_work_progress_snapshot JSONB NULL;"
        )
        await conn.execute("ALTER TABLE focus_workflows ADD COLUMN IF NOT EXISTS record_focus BOOLEAN NOT NULL DEFAULT TRUE;")
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
            "ALTER TABLE focus_workflows ADD CONSTRAINT chk_focus_workflows_phase CHECK (current_phase IN ('focus', 'break'));"
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
              CONSTRAINT chk_focus_app_work_logs_type CHECK (focus_work_type IN ('vocab_today', 'erc_review', 'task_focus')),
              CONSTRAINT chk_focus_app_work_logs_result CHECK (result IS NULL OR result IN ('completed', 'interrupted', 'abandoned')),
              CONSTRAINT chk_focus_app_work_logs_duration CHECK (duration >= 0),
              CONSTRAINT chk_focus_app_work_logs_end_at CHECK (end_at IS NULL OR end_at >= start_time)
            );
            """
        )
        await conn.execute("ALTER TABLE focus_app_work_logs DROP CONSTRAINT IF EXISTS chk_focus_app_work_logs_type;")
        await conn.execute(
            """
            ALTER TABLE focus_app_work_logs
            ADD CONSTRAINT chk_focus_app_work_logs_type
            CHECK (focus_work_type IN ('vocab_today', 'erc_review', 'task_focus'));
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
        await conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS uniq_focus_workflow_default_per_user ON focus_workflow_presets(user_id) WHERE is_default = TRUE;"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_focus_workflow_presets_user_updated ON focus_workflow_presets(user_id, updated_at DESC);"
        )
        # 迁移：允许 end_at 为空、放宽 duration 校验并更新时间一致性约束
        await conn.execute("ALTER TABLE focus_logs ALTER COLUMN end_at DROP NOT NULL;")
        await conn.execute("ALTER TABLE focus_logs DROP CONSTRAINT IF EXISTS chk_focus_logs_duration;")
        await conn.execute("ALTER TABLE focus_logs DROP CONSTRAINT IF EXISTS chk_focus_logs_end_at;")
        await conn.execute("ALTER TABLE focus_logs ADD CONSTRAINT chk_focus_logs_duration CHECK (duration >= 0);")
        await conn.execute(
            "ALTER TABLE focus_logs ADD CONSTRAINT chk_focus_logs_end_at CHECK (end_at IS NULL OR end_at >= start_time);"
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS events (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
              name VARCHAR(255) NOT NULL,
              due_at TIMESTAMPTZ NOT NULL,
              is_primary BOOLEAN NOT NULL DEFAULT FALSE,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute("ALTER TABLE events ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;")
        await conn.execute("ALTER TABLE events ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;")
        await conn.execute("ALTER TABLE events ALTER COLUMN name SET NOT NULL;")
        await conn.execute("ALTER TABLE events ALTER COLUMN due_at SET NOT NULL;")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_events_user_due_at ON events(user_id, due_at ASC);")
        await conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS uniq_events_primary_per_user ON events(user_id) WHERE is_primary = TRUE;"
        )
