"""Tests for publish_image runtime registration."""

from __future__ import annotations

from pathlib import Path

import pytest
from mini_agent.config import Config
from mini_agent.server import runtime


def make_config(enable_file_tools: bool) -> Config:
    return Config.from_dict(
        {
            "llm": {"api_key": "", "provider": "openai", "model": "fake-model"},
            "agent": {"workspace_dir": "./workspace"},
            "tools": {
                "enable_file_tools": enable_file_tools,
                "enable_bash": False,
                "enable_note": False,
                "enable_skills": False,
                "enable_mcp": False,
            },
            "tts": {"enabled": False},
        },
        require_api_key=False,
    )


@pytest.mark.asyncio
async def test_build_agent_tools_includes_publish_image_when_file_tools_enabled(tmp_path: Path) -> None:
    tools, skill_loader = await runtime.build_agent_tools(
        make_config(enable_file_tools=True),
        tmp_path,
        session_id="session-1",
    )

    assert skill_loader is None
    assert [tool.name for tool in tools] == ["read_file", "write_file", "edit_file", "publish_image"]


@pytest.mark.asyncio
async def test_build_agent_tools_excludes_publish_image_when_file_tools_disabled(tmp_path: Path) -> None:
    tools, skill_loader = await runtime.build_agent_tools(
        make_config(enable_file_tools=False),
        tmp_path,
        session_id="session-1",
    )

    assert skill_loader is None
    assert [tool.name for tool in tools] == []
