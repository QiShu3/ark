from MCP.assistant_runner import _is_daily_allowed_tool_name


def test_daily_tool_permission_allows_list_and_add() -> None:
    assert _is_daily_allowed_tool_name("todo__list_today")
    assert _is_daily_allowed_tool_name("todo__create_task")
    assert _is_daily_allowed_tool_name("arxiv__daily_prepare_add_tasks")


def test_daily_tool_permission_denies_delete() -> None:
    assert not _is_daily_allowed_tool_name("todo__delete_task")
