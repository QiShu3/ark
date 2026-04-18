"""Helpers for Mini Agent session image assets."""

from __future__ import annotations

import re
import uuid
from pathlib import Path

IMAGE_ASSET_DIR = Path(".agent_assets") / "images"
IMAGE_MIME_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
}
IMAGE_ASSET_ID_RE = re.compile(r"^img_[a-f0-9]{32}\.(png|jpg|jpeg|gif|webp)$")


def supported_image_mime_type(path: Path) -> str | None:
    return IMAGE_MIME_TYPES.get(path.suffix.lower())


def new_image_asset_id(extension: str) -> str:
    return f"img_{uuid.uuid4().hex}{extension.lower()}"


def is_valid_image_asset_id(asset_id: str) -> bool:
    return bool(IMAGE_ASSET_ID_RE.fullmatch(asset_id))


def image_asset_media_type(asset_id: str) -> str | None:
    if not is_valid_image_asset_id(asset_id):
        return None
    return IMAGE_MIME_TYPES.get(Path(asset_id).suffix.lower())


def image_asset_path(workspace_path: str | Path, asset_id: str) -> Path | None:
    if not is_valid_image_asset_id(asset_id):
        return None
    workspace = Path(workspace_path).expanduser().resolve()
    asset_dir = (workspace / IMAGE_ASSET_DIR).resolve()
    candidate = (asset_dir / asset_id).resolve()
    if candidate.parent != asset_dir:
        return None
    return candidate
