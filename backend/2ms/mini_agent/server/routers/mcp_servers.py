"""MCP server registry API routes."""

from __future__ import annotations

from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, status

from mini_agent.server.auth import CurrentUser, get_current_user
from mini_agent.server.repository import (
    create_mcp_server,
    delete_mcp_server,
    get_pool,
    import_mcp_servers,
    list_mcp_servers,
    update_mcp_server,
)
from mini_agent.server.schemas import (
    MCPServerCreate,
    MCPServerImportRequest,
    MCPServerResponse,
    MCPServerUpdate,
)

router = APIRouter(prefix="/mcp-servers", tags=["MCP Servers"])


async def _pool_dep(request: Request) -> asyncpg.Pool:
    return await get_pool(request)


@router.get("", response_model=list[MCPServerResponse])
async def route_list_mcp_servers(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(_pool_dep)],
):
    return await list_mcp_servers(pool, current_user.id)


@router.post("", response_model=MCPServerResponse, status_code=status.HTTP_201_CREATED)
async def route_create_mcp_server(
    payload: MCPServerCreate,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(_pool_dep)],
):
    return await create_mcp_server(
        pool,
        user_id=current_user.id,
        name=payload.name,
        description=payload.description,
        config_json=payload.config_json,
    )


@router.put("/{server_id}", response_model=MCPServerResponse)
async def route_update_mcp_server(
    server_id: str,
    payload: MCPServerUpdate,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(_pool_dep)],
):
    updated = await update_mcp_server(pool, current_user.id, server_id, payload.model_dump(exclude_unset=True))
    if updated is None:
        raise HTTPException(status_code=404, detail="MCP server not found")
    return updated


@router.delete("/{server_id}", status_code=status.HTTP_204_NO_CONTENT)
async def route_delete_mcp_server(
    server_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(_pool_dep)],
):
    deleted = await delete_mcp_server(pool, current_user.id, server_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="MCP server not found")


@router.post("/import", response_model=list[MCPServerResponse], status_code=status.HTTP_201_CREATED)
async def route_import_mcp_servers(
    payload: MCPServerImportRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(_pool_dep)],
):
    return await import_mcp_servers(pool, user_id=current_user.id, config_json=payload.config_json)
