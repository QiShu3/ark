from __future__ import annotations

from routes.agents.actions.arxiv_actions import (
    handle_arxiv_daily_candidates,
    handle_arxiv_daily_tasks_commit,
    handle_arxiv_daily_tasks_prepare,
    handle_arxiv_paper_details,
    handle_arxiv_search,
)
from routes.agents.actions.task_actions import (
    handle_task_delete_commit,
    handle_task_delete_prepare,
    handle_task_list,
    handle_task_update,
)
from routes.agents.models import ActionDefinition

ACTION_REGISTRY: dict[str, ActionDefinition] = {
    "arxiv.daily_candidates": ActionDefinition(
        action_id="arxiv.daily_candidates",
        policy_action_id="arxiv.daily_candidates",
        handler=handle_arxiv_daily_candidates,
    ),
    "arxiv.search": ActionDefinition(
        action_id="arxiv.search",
        policy_action_id="arxiv.search",
        handler=handle_arxiv_search,
    ),
    "arxiv.paper_details": ActionDefinition(
        action_id="arxiv.paper_details",
        policy_action_id="arxiv.paper_details",
        handler=handle_arxiv_paper_details,
    ),
    "task.list": ActionDefinition(
        action_id="task.list",
        policy_action_id="task.list",
        handler=handle_task_list,
    ),
    "task.update": ActionDefinition(
        action_id="task.update",
        policy_action_id="task.update",
        handler=handle_task_update,
    ),
    "task.delete.prepare": ActionDefinition(
        action_id="task.delete.prepare",
        policy_action_id="task.delete",
        handler=handle_task_delete_prepare,
    ),
    "task.delete.commit": ActionDefinition(
        action_id="task.delete.commit",
        policy_action_id="task.delete",
        handler=handle_task_delete_commit,
    ),
    "arxiv.daily_tasks.prepare": ActionDefinition(
        action_id="arxiv.daily_tasks.prepare",
        policy_action_id="arxiv.daily_tasks",
        handler=handle_arxiv_daily_tasks_prepare,
    ),
    "arxiv.daily_tasks.commit": ActionDefinition(
        action_id="arxiv.daily_tasks.commit",
        policy_action_id="arxiv.daily_tasks",
        handler=handle_arxiv_daily_tasks_commit,
    ),
}


def get_action_definition(action_name: str) -> ActionDefinition | None:
    return ACTION_REGISTRY.get(action_name)
