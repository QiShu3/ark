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


def test_resolve_profile_prompt_source_prefers_profile_system_prompt_with_skills_metadata():
    profile = SimpleNamespace(
        system_prompt="System says {SKILLS_METADATA}",
        system_prompt_path=None,
    )
    config = runtime.Config.from_dict({"llm": {"api_key": "test-key"}}, require_api_key=False)

    resolved = runtime.resolve_profile_prompt_source(profile, config, skills_metadata="skill list")

    assert resolved["prompt"] == "System says skill list"
    assert resolved["source_kind"] == "profile_resolved"
    assert resolved["source_label"] == "当前 Profile 解析后的 System Prompt"


def test_resolve_profile_prompt_source_reads_prompt_file_when_profile_prompt_missing(tmp_path):
    prompt_file = tmp_path / "profile-prompt.md"
    prompt_file.write_text("From file prompt", encoding="utf-8")
    profile = SimpleNamespace(
        system_prompt="",
        system_prompt_path=str(prompt_file),
    )
    config = runtime.Config.from_dict({"llm": {"api_key": "test-key"}}, require_api_key=False)

    resolved = runtime.resolve_profile_prompt_source(profile, config)

    assert resolved["prompt"] == "From file prompt"
    assert resolved["source_kind"] == "profile_resolved"


def test_resolve_profile_prompt_source_falls_back_to_default_prompt_file(monkeypatch, tmp_path):
    default_prompt_file = tmp_path / "default-system-prompt.md"
    default_prompt_file.write_text("Default prompt body", encoding="utf-8")
    profile = SimpleNamespace(
        system_prompt=None,
        system_prompt_path=None,
    )
    config = runtime.Config.from_dict(
        {
            "llm": {"api_key": "test-key"},
            "agent": {"system_prompt_path": "default-system-prompt.md"},
        },
        require_api_key=False,
    )

    monkeypatch.setattr(runtime.Config, "find_config_file", classmethod(lambda cls, filename: default_prompt_file))

    resolved = runtime.resolve_profile_prompt_source(profile, config)

    assert resolved["prompt"] == "Default prompt body"
    assert resolved["source_kind"] == "profile_resolved"


def test_resolve_profile_prompt_source_uses_builtin_default_when_no_prompt_sources_exist(monkeypatch):
    profile = SimpleNamespace(
        system_prompt=None,
        system_prompt_path=None,
    )
    config = runtime.Config.from_dict({"llm": {"api_key": "test-key"}}, require_api_key=False)

    monkeypatch.setattr(runtime.Config, "find_config_file", classmethod(lambda cls, filename: None))

    resolved = runtime.resolve_profile_prompt_source(profile, config)

    assert resolved["prompt"] == runtime.DEFAULT_SYSTEM_PROMPT
    assert resolved["source_kind"] == "profile_resolved"
