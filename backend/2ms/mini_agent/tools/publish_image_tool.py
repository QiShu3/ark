"""Tool for publishing workspace images to the /web developer UI."""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from mini_agent.assets import IMAGE_ASSET_DIR, new_image_asset_id, supported_image_mime_type

from .base import Tool, ToolResult


class PublishImageTool(Tool):
    """Publish an image from the current session workspace."""

    def __init__(self, workspace_dir: str, session_id: str) -> None:
        self.workspace_dir = Path(workspace_dir).expanduser().resolve()
        self.session_id = session_id

    @property
    def name(self) -> str:
        return "publish_image"

    @property
    def description(self) -> str:
        return (
            "Publish an existing image from the current session workspace so the /web "
            "developer UI can show a preview. Use this after generating a PNG, JPG, GIF, "
            "or WEBP image in the workspace."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Image path inside the current session workspace.",
                },
                "alt": {
                    "type": "string",
                    "description": "Optional alt text for the image preview.",
                },
                "caption": {
                    "type": "string",
                    "description": "Optional caption shown below the preview.",
                },
            },
            "required": ["path"],
        }

    async def execute(self, path: str, alt: str = "", caption: str = "") -> ToolResult:
        source = self._resolve_source(path)
        if source is None:
            return ToolResult(success=False, content="", error=f"File is outside the session workspace: {path}")
        if not source.exists():
            return ToolResult(success=False, content="", error=f"File not found: {path}")
        if not source.is_file():
            return ToolResult(success=False, content="", error=f"Path is not a file: {path}")

        mime_type = supported_image_mime_type(source)
        if mime_type is None:
            return ToolResult(success=False, content="", error=f"Unsupported image type: {source.suffix.lower()}")

        asset_id = new_image_asset_id(source.suffix)
        asset_dir = self.workspace_dir / IMAGE_ASSET_DIR
        asset_dir.mkdir(parents=True, exist_ok=True)
        asset_path = asset_dir / asset_id
        shutil.copy2(source, asset_path)

        source_path = source.relative_to(self.workspace_dir).as_posix()
        payload = {
            "asset": {
                "type": "image",
                "asset_id": asset_id,
                "url": f"/api/sessions/{self.session_id}/assets/{asset_id}",
                "mime_type": mime_type,
                "filename": source.name,
                "source_path": source_path,
                "alt": alt,
                "caption": caption,
                "size_bytes": asset_path.stat().st_size,
            }
        }
        return ToolResult(success=True, content=json.dumps(payload, ensure_ascii=False))

    def _resolve_source(self, path: str) -> Path | None:
        raw_path = Path(path).expanduser()
        source = raw_path.resolve() if raw_path.is_absolute() else (self.workspace_dir / raw_path).resolve()
        if source == self.workspace_dir or self.workspace_dir in source.parents:
            return source
        return None
