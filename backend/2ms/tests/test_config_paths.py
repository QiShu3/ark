"""Tests for package-local config path resolution."""

from pathlib import Path

from mini_agent.config import Config


def test_find_config_file_prefers_app_state_over_package(tmp_path, monkeypatch):
    package_dir = tmp_path / "mini_agent"
    app_state_config = package_dir / "app_state" / "config"
    package_config = package_dir / "config"
    app_state_config.mkdir(parents=True)
    package_config.mkdir(parents=True)

    app_state_file = app_state_config / "system_prompt.md"
    package_file = package_config / "system_prompt.md"
    app_state_file.write_text("app state", encoding="utf-8")
    package_file.write_text("package", encoding="utf-8")

    monkeypatch.setattr(Config, "get_package_dir", staticmethod(lambda: package_dir))

    assert Config.find_config_file("system_prompt.md") == app_state_file


def test_find_config_file_falls_back_to_package_config(tmp_path, monkeypatch):
    package_dir = tmp_path / "mini_agent"
    package_config = package_dir / "config"
    package_config.mkdir(parents=True)
    package_file = package_config / "mcp.json"
    package_file.write_text("{}", encoding="utf-8")

    monkeypatch.setattr(Config, "get_package_dir", staticmethod(lambda: package_dir))

    assert Config.find_config_file("mcp.json") == package_file


def test_app_state_helpers_resolve_under_package_dir(tmp_path, monkeypatch):
    package_dir = tmp_path / "mini_agent"
    package_dir.mkdir(parents=True)

    monkeypatch.setattr(Config, "get_package_dir", staticmethod(lambda: package_dir))

    assert Config.get_app_state_dir() == package_dir / "app_state"
    assert Config.get_app_state_config_dir() == package_dir / "app_state" / "config"
    assert Config.get_app_state_log_dir() == package_dir / "app_state" / "log"


def test_default_system_prompt_does_not_claim_fixed_tool_capabilities():
    prompt_path = Config.get_package_dir() / "config" / "system_prompt.md"
    prompt = prompt_path.read_text(encoding="utf-8")

    assert "Bash Execution" not in prompt
    assert "File Operations" not in prompt
    assert "MCP Tools" not in prompt
    assert "bash or read_file" not in prompt
