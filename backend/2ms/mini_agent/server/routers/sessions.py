"""Session API routes with live agent execution."""

from __future__ import annotations

import json
from typing import Annotated, List

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect, status

from mini_agent.server.auth import CurrentUser, get_current_user, get_current_user_ws
from mini_agent.server.repository import (
    create_message,
    create_session,
    get_pool,
    get_profile,
    get_run,
    get_session,
    list_messages,
    list_runs,
    list_sessions,
    update_session,
    delete_session,
)
from mini_agent.server.runtime import (
    WebAgentRuntimeManager,
    build_profile_runtime_config,
    build_session_workspace_path,
    build_tts_settings,
    serialize_tts_state,
)
from mini_agent.server.schemas import MessageCreate, MessageResponse, SessionCreate, SessionResponse, SessionRunResponse
from mini_agent.server.schemas import SessionUpdate

router = APIRouter(prefix="/sessions", tags=["Sessions"])
runtime_manager = WebAgentRuntimeManager()


async def _pool_dep(request: Request) -> asyncpg.Pool:
    return await get_pool(request)


def _default_session_name(session_id: str) -> str:
    return f"会话 {session_id[:8]}"


@router.get("", response_model=List[SessionResponse])
async def route_list_sessions(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(_pool_dep)],
):
    return await list_sessions(pool, current_user.id)


@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def route_create_session(
    session: SessionCreate,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(_pool_dep)],
):
    profile = await get_profile(pool, current_user.id, session.profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")

    try:
        runtime_config = build_profile_runtime_config(profile)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    created = await create_session(
        pool,
        user_id=current_user.id,
        profile_id=session.profile_id,
        name=session.name,
        workspace_path=None,
        status="idle",
    )
    workspace_path = str(
        build_session_workspace_path(
            config=runtime_config,
            session_id=created.id,
            explicit_workspace_path=session.workspace_path,
        )
    )
    return await update_session(
        pool,
        current_user.id,
        created.id,
        name=session.name or _default_session_name(created.id),
        workspace_path=workspace_path,
        status="idle",
    ) or created


@router.get("/{session_id}", response_model=SessionResponse)
async def route_get_session(
    session_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(_pool_dep)],
):
    session = await get_session(pool, current_user.id, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.put("/{session_id}", response_model=SessionResponse)
async def route_update_session(
    session_id: str,
    session_update: SessionUpdate,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(_pool_dep)],
):
    session = await get_session(pool, current_user.id, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if runtime_manager.is_running(session_id):
        raise HTTPException(status_code=409, detail="Cannot update a session while a task is running")

    update_data = session_update.model_dump(exclude_unset=True)
    if "profile_id" in update_data:
        profile = await get_profile(pool, current_user.id, update_data["profile_id"])
        if profile is None:
            raise HTTPException(status_code=404, detail="Target profile not found")

    updated = await update_session(
        pool,
        current_user.id,
        session_id,
        profile_id=update_data.get("profile_id"),
        name=update_data.get("name"),
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return updated


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def route_delete_session(
    session_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(_pool_dep)],
):
    session = await get_session(pool, current_user.id, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if runtime_manager.is_running(session_id):
        raise HTTPException(status_code=409, detail="Cannot delete a session while a task is running")
    await delete_session(pool, current_user.id, session_id)


@router.get("/{session_id}/messages", response_model=List[MessageResponse])
async def route_get_session_messages(
    session_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(_pool_dep)],
):
    session = await get_session(pool, current_user.id, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return await list_messages(pool, current_user.id, session_id)


@router.get("/{session_id}/runs", response_model=List[SessionRunResponse])
async def route_get_session_runs(
    session_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(_pool_dep)],
):
    session = await get_session(pool, current_user.id, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return await list_runs(pool, current_user.id, session_id)


@router.get("/{session_id}/runs/{run_id}", response_model=SessionRunResponse)
async def route_get_session_run(
    session_id: str,
    run_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(_pool_dep)],
):
    session = await get_session(pool, current_user.id, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    run = await get_run(pool, current_user.id, session_id, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.post("/{session_id}/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def route_create_message(
    session_id: str,
    message: MessageCreate,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    pool: Annotated[asyncpg.Pool, Depends(_pool_dep)],
):
    return await create_message(
        pool,
        current_user.id,
        session_id,
        role=message.role,
        content=message.content,
        event_type=message.role,
    )


@router.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    try:
        current_user = await get_current_user_ws(websocket)
    except HTTPException as exc:
        await websocket.close(code=4001, reason=exc.detail)
        return

    pool = getattr(getattr(websocket.app, "state", None), "auth_pool", None)
    if pool is None:
        await websocket.close(code=1011, reason="Database is not initialized")
        return

    session = await get_session(pool, current_user.id, session_id)
    if session is None:
        await websocket.close(code=4004, reason="Session not found")
        return

    await runtime_manager.connect(websocket, session_id)
    try:
        profile = await get_profile(pool, current_user.id, session.profile_id)
        await websocket.send_json({"type": "connected", "session_id": session_id, "status": session.status})
        if profile is not None:
            runtime_config = build_profile_runtime_config(profile)
            tts_settings = build_tts_settings(runtime_config)
            if tts_settings.enabled:
                await websocket.send_json(
                    {
                        "type": "tts_state",
                        "session_id": session_id,
                        "tts": serialize_tts_state(tts_settings),
                    }
                )

        while True:
            raw_data = await websocket.receive_text()
            try:
                message_data = json.loads(raw_data)
            except json.JSONDecodeError:
                await runtime_manager.send_message(
                    session_id,
                    {"type": "error", "session_id": session_id, "error": "Invalid JSON payload."},
                )
                continue

            message_type = message_data.get("type")
            if message_type == "run":
                content = (message_data.get("content") or "").strip()
                if not content:
                    await runtime_manager.send_message(
                        session_id,
                        {"type": "error", "session_id": session_id, "error": "Message content is required."},
                    )
                    continue
                await runtime_manager.start_run(websocket.app, session_id, current_user.id, content)
            elif message_type == "cancel":
                await runtime_manager.cancel_run(session_id)
            elif message_type == "ping":
                await runtime_manager.send_message(session_id, {"type": "pong", "session_id": session_id})
            else:
                await runtime_manager.send_message(
                    session_id,
                    {
                        "type": "error",
                        "session_id": session_id,
                        "error": f"Unsupported message type: {message_type}",
                    },
                )
    except WebSocketDisconnect:
        runtime_manager.disconnect(session_id)
