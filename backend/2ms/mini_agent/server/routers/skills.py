"""Skill management API routes."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status

from mini_agent.server.auth import CurrentUser, get_current_user
from mini_agent.server.schemas import SkillResponse
from mini_agent.server.skill_registry import (
    SkillInstallError,
    get_builtin_skill_dirs,
    get_uploaded_skills_dir,
    install_skill_archive,
    list_available_skills,
)

router = APIRouter(prefix="/skills", tags=["Skills"])


def _skill_install_root(request: Request) -> Path:
    root = getattr(request.app.state, "skill_install_root", None)
    if root is None:
        return get_uploaded_skills_dir(create=True)
    path = Path(root)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _skill_builtin_dirs(request: Request) -> list[Path]:
    configured = getattr(request.app.state, "skill_builtin_dirs", None)
    if configured is not None:
        return [Path(path) for path in configured]
    return get_builtin_skill_dirs()


@router.get("", response_model=list[SkillResponse])
async def route_list_skills(
    request: Request,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    del current_user
    return list_available_skills(_skill_builtin_dirs(request), install_root=_skill_install_root(request))


@router.post("/upload", response_model=SkillResponse, status_code=status.HTTP_201_CREATED)
async def route_upload_skill(
    request: Request,
    file: Annotated[UploadFile, File(...)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    del current_user
    archive_bytes = await file.read()
    try:
        return install_skill_archive(
            archive_bytes,
            install_root=_skill_install_root(request),
            builtin_dirs=_skill_builtin_dirs(request),
        )
    except SkillInstallError as exc:
        message = str(exc)
        status_code = status.HTTP_409_CONFLICT if "already exists" in message.lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=status_code, detail=message) from exc
