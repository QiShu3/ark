from __future__ import annotations

from routes.agents.models import AgentSkillOut

SKILLS: tuple[AgentSkillOut, ...] = (
    AgentSkillOut(
        name="arxiv_daily_candidates",
        description="获取今天的 arXiv 候选论文列表；如果当天数据还没生成，会按现有每日配置自动刷新。",
        parameters={
            "type": "object",
            "properties": {},
        },
        intent_scope="arxiv",
        side_effect="read",
    ),
    AgentSkillOut(
        name="arxiv_search",
        description="搜索 arXiv 论文，支持关键词、分类、作者、搜索字段、排序和分页。",
        parameters={
            "type": "object",
            "properties": {
                "keywords": {"type": "string"},
                "category": {"type": ["string", "null"]},
                "author": {"type": ["string", "null"]},
                "limit": {"type": "integer", "minimum": 1, "maximum": 100},
                "offset": {"type": "integer", "minimum": 0},
                "sort_by": {
                    "type": "string",
                    "enum": ["relevance", "submitted_date", "last_updated_date"],
                },
                "sort_order": {"type": "string", "enum": ["ascending", "descending"]},
                "search_field": {"type": "string", "enum": ["title", "summary", "all"]},
            },
            "required": ["keywords"],
        },
        intent_scope="arxiv",
        side_effect="read",
    ),
    AgentSkillOut(
        name="arxiv_paper_details",
        description="根据 arXiv id 批量获取论文详情。",
        parameters={
            "type": "object",
            "properties": {
                "arxiv_ids": {"type": "array", "items": {"type": "string"}, "minItems": 1, "maxItems": 100}
            },
            "required": ["arxiv_ids"],
        },
        intent_scope="arxiv",
        side_effect="read",
    ),
    AgentSkillOut(
        name="task_list",
        description="列出任务。应用 agent 若只具备跨应用摘要权限，工具只会返回摘要视图。",
        parameters={
            "type": "object",
            "properties": {
                "status": {"type": ["string", "null"], "enum": ["todo", "done", None]},
                "q": {"type": ["string", "null"]},
                "limit": {"type": "integer", "minimum": 1, "maximum": 200},
                "offset": {"type": "integer", "minimum": 0},
            },
        },
        intent_scope="task",
        side_effect="read",
    ),
    AgentSkillOut(
        name="task_update",
        description="更新任务字段，如状态、标题、优先级或时间。",
        parameters={
            "type": "object",
            "properties": {
                "task_id": {"type": "string"},
                "patch": {"type": "object"},
            },
            "required": ["task_id", "patch"],
        },
        intent_scope="task",
        side_effect="write",
    ),
    AgentSkillOut(
        name="delete_task",
        description="删除指定任务。若属于敏感操作，工具会先返回审批请求。",
        parameters={
            "type": "object",
            "properties": {"task_id": {"type": "string"}},
            "required": ["task_id"],
        },
        intent_scope="task",
        side_effect="destructive",
    ),
    AgentSkillOut(
        name="arxiv_daily_tasks_prepare",
        description="将今日论文候选转为任务。工具会返回审批请求。",
        parameters={
            "type": "object",
            "properties": {
                "arxiv_ids": {"type": "array", "items": {"type": "string"}, "minItems": 1}
            },
            "required": ["arxiv_ids"],
        },
        intent_scope="arxiv",
        side_effect="write",
    ),
)

SKILL_TO_ACTION: dict[str, str] = {
    "arxiv_daily_candidates": "arxiv.daily_candidates",
    "arxiv_search": "arxiv.search",
    "arxiv_paper_details": "arxiv.paper_details",
    "task_list": "task.list",
    "task_update": "task.update",
    "delete_task": "task.delete.prepare",
    "arxiv_daily_tasks_prepare": "arxiv.daily_tasks.prepare",
}


def list_agent_skills_registry() -> list[AgentSkillOut]:
    return list(SKILLS)


def skill_action_map() -> dict[str, str]:
    return dict(SKILL_TO_ACTION)
