"""Tests for publishing workspace images as /web assets."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from mini_agent.tools.publish_image_tool import PublishImageTool

MINIMAL_PNG = (
    b"\x89PNG\r\n\x1a\n"
    b"\x00\x00\x00\rIHDR"
    b"\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00"
    b"\x1f\x15\xc4\x89"
    b"\x00\x00\x00\nIDATx\x9cc\xf8\x0f\x00\x01\x01\x01\x00"
    b"\x18\xdd\x8d\xb0"
    b"\x00\x00\x00\x00IEND\xaeB`\x82"
)


def write_png(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(MINIMAL_PNG)


@pytest.mark.asyncio
async def test_publish_image_copies_workspace_root_image(tmp_path: Path) -> None:
    source = tmp_path / "chart.png"
    write_png(source)
    tool = PublishImageTool(workspace_dir=str(tmp_path), session_id="session-1")

    result = await tool.execute(path="chart.png", alt="Trend chart", caption="Weekly trend")

    assert result.success is True
    payload = json.loads(result.content)
    asset = payload["asset"]
    assert asset["type"] == "image"
    assert asset["asset_id"].startswith("img_")
    assert asset["asset_id"].endswith(".png")
    assert asset["url"] == f"/api/sessions/session-1/assets/{asset['asset_id']}"
    assert asset["mime_type"] == "image/png"
    assert asset["filename"] == "chart.png"
    assert asset["source_path"] == "chart.png"
    assert asset["alt"] == "Trend chart"
    assert asset["caption"] == "Weekly trend"
    assert asset["size_bytes"] == len(MINIMAL_PNG)
    assert (tmp_path / ".agent_assets" / "images" / asset["asset_id"]).read_bytes() == MINIMAL_PNG


@pytest.mark.asyncio
async def test_publish_image_copies_workspace_subdirectory_image(tmp_path: Path) -> None:
    source = tmp_path / "outputs" / "chart.webp"
    source.parent.mkdir(parents=True, exist_ok=True)
    source.write_bytes(b"RIFF\x00\x00\x00\x00WEBP")
    tool = PublishImageTool(workspace_dir=str(tmp_path), session_id="session-1")

    result = await tool.execute(path="outputs/chart.webp")

    assert result.success is True
    asset = json.loads(result.content)["asset"]
    assert asset["source_path"] == "outputs/chart.webp"
    assert asset["mime_type"] == "image/webp"
    assert (tmp_path / ".agent_assets" / "images" / asset["asset_id"]).exists()


@pytest.mark.asyncio
async def test_publish_image_rejects_missing_file(tmp_path: Path) -> None:
    tool = PublishImageTool(workspace_dir=str(tmp_path), session_id="session-1")

    result = await tool.execute(path="outputs/missing.png")

    assert result.success is False
    assert result.error == "File not found: outputs/missing.png"


@pytest.mark.asyncio
async def test_publish_image_rejects_directory(tmp_path: Path) -> None:
    (tmp_path / "outputs").mkdir()
    tool = PublishImageTool(workspace_dir=str(tmp_path), session_id="session-1")

    result = await tool.execute(path="outputs")

    assert result.success is False
    assert result.error == "Path is not a file: outputs"


@pytest.mark.asyncio
async def test_publish_image_rejects_non_image_file(tmp_path: Path) -> None:
    (tmp_path / "notes.txt").write_text("not an image", encoding="utf-8")
    tool = PublishImageTool(workspace_dir=str(tmp_path), session_id="session-1")

    result = await tool.execute(path="notes.txt")

    assert result.success is False
    assert result.error == "Unsupported image type: .txt"


@pytest.mark.asyncio
async def test_publish_image_rejects_svg(tmp_path: Path) -> None:
    (tmp_path / "diagram.svg").write_text("<svg></svg>", encoding="utf-8")
    tool = PublishImageTool(workspace_dir=str(tmp_path), session_id="session-1")

    result = await tool.execute(path="diagram.svg")

    assert result.success is False
    assert result.error == "Unsupported image type: .svg"


@pytest.mark.asyncio
async def test_publish_image_rejects_workspace_escape(tmp_path: Path) -> None:
    outside = tmp_path.parent / "secret.png"
    write_png(outside)
    tool = PublishImageTool(workspace_dir=str(tmp_path), session_id="session-1")

    result = await tool.execute(path="../secret.png")

    assert result.success is False
    assert result.error == "File is outside the session workspace: ../secret.png"
