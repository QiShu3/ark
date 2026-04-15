"""Profile API routes backed by asyncpg."""

from __future__ import annotations

from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, status

from mini_agent.server.auth import CurrentUser, get_current_user
from mini_agent.server.repository import (
    create_profile,
    delete_profile,
    delete_profile_file,
    get_pool,
    get_profile,
    get_profile_file,
    list_profile_files,
    list_profiles,
    set_default_profile,
    update_profile,
    upsert_profile_file,
)
from mini_agent.server.runtime import build_profile_runtime_config, resolve_profile_prompt_source
from mini_agent.server.schemas import (
    ProfileCreate,
    ProfileFileCreate,
    ProfileFileResponse,
    ProfileFileUpdate,
    ProfileResponse,
    ProfileUpdate,
    ResolvedPromptResponse,
)

router = APIRouter(prefix="/profiles", tags=["Profiles"])


async def _pool_dep(request: Request) -> asyncpg.Pool:
    return await get_pool(request)


@router.get("", response_model=list[ProfileResponse])
async def route_list_profiles(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(_pool_dep)],
):
    return await list_profiles(pool, current_user.id)


@router.post("", response_model=ProfileResponse, status_code=status.HTTP_201_CREATED)
async def route_create_profile(
    profile: ProfileCreate,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(_pool_dep)],
):
    return await create_profile(
        pool,
        user_id=current_user.id,
        key=profile.key,
        name=profile.name,
        config_json=profile.config_json,
        system_prompt=profile.system_prompt,
        system_prompt_path=profile.system_prompt_path,
        mcp_config_json=profile.mcp_config_json,
        mcp_server_ids=profile.mcp_server_ids,
        is_default=profile.is_default,
    )


@router.get("/{profile_id}", response_model=ProfileResponse)
async def route_get_profile(
    profile_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(_pool_dep)],
):
    profile = await get_profile(pool, current_user.id, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.get("/{profile_id}/resolved-prompt", response_model=ResolvedPromptResponse)
async def route_get_profile_resolved_prompt(
    profile_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(_pool_dep)],
):
    profile = await get_profile(pool, current_user.id, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")

    config = build_profile_runtime_config(profile, require_api_key=False)
    resolved_prompt = resolve_profile_prompt_source(profile, config)
    return ResolvedPromptResponse(**resolved_prompt)


@router.put("/{profile_id}", response_model=ProfileResponse)
async def route_update_profile(
    profile_id: str,
    profile_update: ProfileUpdate,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(_pool_dep)],
):
    profile = await update_profile(
        pool,
        current_user.id,
        profile_id,
        profile_update.model_dump(exclude_unset=True),
    )
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
async def route_delete_profile(
    profile_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(_pool_dep)],
):
    deleted, _ = await delete_profile(pool, current_user.id, profile_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Profile not found")


@router.put("/{profile_id}/default", response_model=ProfileResponse)
async def route_set_default_profile(
    profile_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(_pool_dep)],
):
    profile = await set_default_profile(pool, current_user.id, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.get("/{profile_id}/files", response_model=list[ProfileFileResponse])
async def route_list_profile_files(
    profile_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(_pool_dep)],
):
    profile = await get_profile(pool, current_user.id, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return await list_profile_files(pool, current_user.id, profile_id)


@router.post("/{profile_id}/files", response_model=ProfileFileResponse, status_code=status.HTTP_201_CREATED)
async def route_create_profile_file(
    profile_id: str,
    file_data: ProfileFileCreate,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(_pool_dep)],
):
    return await upsert_profile_file(
        pool,
        current_user.id,
        profile_id,
        file_data.file_type,
        file_data.filename,
        file_data.content,
    )


@router.get("/{profile_id}/files/{file_type}", response_model=ProfileFileResponse)
async def route_get_profile_file(
    profile_id: str,
    file_type: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(_pool_dep)],
):
    file_record = await get_profile_file(pool, current_user.id, profile_id, file_type)
    if file_record is None:
        raise HTTPException(status_code=404, detail="File not found")
    return file_record


@router.put("/{profile_id}/files/{file_type}", response_model=ProfileFileResponse)
async def route_update_profile_file(
    profile_id: str,
    file_type: str,
    file_update: ProfileFileUpdate,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(_pool_dep)],
):
    return await upsert_profile_file(
        pool,
        current_user.id,
        profile_id,
        file_type,
        f"{file_type}.md",
        file_update.content,
    )


@router.delete("/{profile_id}/files/{file_type}", status_code=status.HTTP_204_NO_CONTENT)
async def route_delete_profile_file(
    profile_id: str,
    file_type: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(_pool_dep)],
):
    profile = await get_profile(pool, current_user.id, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    await delete_profile_file(pool, current_user.id, profile_id, file_type)
