from types import SimpleNamespace

from mini_agent.server import runtime


def test_build_profile_bound_mcp_config_returns_named_servers():
    servers = [
        SimpleNamespace(
            name="memory",
            config_json={
                "command": "npx",
                "args": ["-y", "@modelcontextprotocol/server-memory"],
            },
        ),
        SimpleNamespace(
            name="search",
            config_json={
                "url": "https://example.com/mcp",
                "type": "streamable_http",
            },
        ),
    ]

    assert runtime.build_profile_bound_mcp_config(servers) == {
        "mcpServers": {
            "memory": {
                "command": "npx",
                "args": ["-y", "@modelcontextprotocol/server-memory"],
            },
            "search": {
                "url": "https://example.com/mcp",
                "type": "streamable_http",
            },
        }
    }


def test_build_profile_bound_mcp_config_returns_none_for_empty_binding_set():
    assert runtime.build_profile_bound_mcp_config([]) is None


def test_build_runtime_tool_availability_summary_reflects_actual_tools():
    tools = [
        SimpleNamespace(name="read_file"),
        SimpleNamespace(name="write_file"),
        SimpleNamespace(name="memory_search"),
    ]

    summary = runtime.build_runtime_tool_availability_summary(tools)

    assert "You can use only the following tools in this run:" in summary
    assert "- `read_file`" in summary
    assert "- `write_file`" in summary
    assert "- `memory_search`" in summary
    assert "Bash:" not in summary
    assert "disabled" not in summary
    assert "none loaded" not in summary


def test_apply_runtime_tool_availability_prefixes_prompt_once():
    prompt = "You are Mini-Agent."
    tools = [SimpleNamespace(name="bash")]

    updated = runtime.apply_runtime_tool_availability(prompt, tools)

    assert updated.startswith(runtime.RUNTIME_TOOL_AVAILABILITY_HEADER)
    assert updated.endswith(prompt)
    assert runtime.apply_runtime_tool_availability(updated, tools) == updated


def test_build_runtime_tool_availability_summary_handles_no_tools_without_listing_hidden_capabilities():
    summary = runtime.build_runtime_tool_availability_summary([])

    assert "No external tools are available in this run." in summary
    assert "bash" not in summary.lower()
    assert "read_file" not in summary
    assert "mcp" not in summary.lower()
