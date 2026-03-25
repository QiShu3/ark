from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException


@dataclass(frozen=True)
class AppDefinition:
    app_id: str
    display_name: str
    description: str
    default_profile_name: str
    default_profile_description: str
    default_context_prompt: str
    default_skills: tuple[str, ...]
    default_capabilities: frozenset[str]
    allowed_skill_apps: tuple[str, ...]


APPS: dict[str, AppDefinition] = {
    "dashboard": AppDefinition(
        app_id="dashboard",
        display_name="Dashboard",
        description="跨应用任务与信息协调工作区。",
        default_profile_name="Ark Agent",
        default_profile_description="通用任务调度与信息整理助手。",
        default_context_prompt="你像一位冷静、清晰、执行力强的任务助手，适合帮助用户管理全局任务与跨应用信息。",
        default_skills=(
            "task_list",
            "task_update",
            "delete_task",
            "arxiv_daily_candidates",
            "arxiv_search",
            "arxiv_paper_details",
            "arxiv_daily_tasks_prepare",
        ),
        default_capabilities=frozenset({"tasks.read.global", "tasks.write.global", "task.delete", "arxiv.daily_tasks.write"}),
        allowed_skill_apps=("todo", "arxiv", "vocab"),
    ),
    "todo": AppDefinition(
        app_id="todo",
        display_name="Todo",
        description="任务管理与执行推进工作区。",
        default_profile_name="Task Operator",
        default_profile_description="关注任务查看、更新与执行推进。",
        default_context_prompt="你像一位擅长任务拆解和执行推进的助手，优先帮助用户整理、更新和推进待办。",
        default_skills=("task_list", "task_update", "delete_task"),
        default_capabilities=frozenset({"tasks.read.global", "tasks.write.global", "task.delete"}),
        allowed_skill_apps=("todo",),
    ),
    "arxiv": AppDefinition(
        app_id="arxiv",
        display_name="ArXiv",
        description="论文检索、筛选与阅读任务工作区。",
        default_profile_name="ArXiv Researcher",
        default_profile_description="关注论文检索、每日候选与阅读任务安排。",
        default_context_prompt="你像一位认真、清晰、偏研究助理风格的 AI 助手，优先帮助用户快速筛选论文并组织阅读任务。",
        default_skills=("arxiv_daily_candidates", "arxiv_search", "arxiv_paper_details", "arxiv_daily_tasks_prepare"),
        default_capabilities=frozenset({"arxiv.daily_tasks.write"}),
        allowed_skill_apps=("arxiv", "todo"),
    ),
    "vocab": AppDefinition(
        app_id="vocab",
        display_name="Vocab",
        description="词汇学习与复习节奏工作区。",
        default_profile_name="Vocab Coach",
        default_profile_description="关注背词节奏、复习反馈与学习鼓励。",
        default_context_prompt="你像一位有耐心、鼓励式的英语教练，语气轻快，但回答要具体和可执行。",
        default_skills=(),
        default_capabilities=frozenset(),
        allowed_skill_apps=("vocab", "todo"),
    ),
}


def get_app_definition(app_id: str) -> AppDefinition:
    normalized = (app_id or "").strip()
    app = APPS.get(normalized)
    if app is None:
        raise HTTPException(status_code=422, detail=f"未知主应用：{app_id}")
    return app


def list_agent_apps_registry() -> list[AppDefinition]:
    return list(APPS.values())

