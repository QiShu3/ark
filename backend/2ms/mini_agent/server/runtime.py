"""Web runtime helpers for executing agents inside sessions."""

from __future__ import annotations

import asyncio
import base64
import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

import asyncpg
from fastapi import WebSocket

from mini_agent.config import Config
from mini_agent.retry import RetryConfig as RuntimeRetryConfig
from mini_agent.schema import Message
from mini_agent.server.repository import (
    MessageRecord,
    ProfileRecord,
    SessionRecord,
    SessionRunRecord,
    create_run,
    get_pool_from_app,
    get_profile,
    get_session,
    get_session_history,
    insert_message_event,
    update_run_status,
    update_session,
)
from mini_agent.server.skill_registry import get_uploaded_skills_dir
from mini_agent.tools.base import Tool
from mini_agent.tools.bash_tool import BashTool
from mini_agent.tools.file_tools import EditTool, ReadTool, WriteTool
from mini_agent.tools.note_tool import RecallNoteTool, SessionNoteTool
from mini_agent.tools.skill_tool import create_skill_tools
from mini_agent.tts import TTSManager, TTSSettings, create_tts_provider, provider_supports_streaming

if TYPE_CHECKING:
    from mini_agent.agent import Agent


DEFAULT_SYSTEM_PROMPT = "You are a helpful AI assistant."
PERSISTED_MESSAGE_EVENT_TYPES = {"user", "thinking", "assistant_message", "tool_call", "tool_result"}
TRANSIENT_MESSAGE_EVENT_TYPES = {"thinking_delta", "content_delta"}
MESSAGE_EVENT_TYPES = PERSISTED_MESSAGE_EVENT_TYPES | TRANSIENT_MESSAGE_EVENT_TYPES
RUN_EVENT_TYPES = {"run_started", "run_completed", "run_failed", "run_cancelled"}


def _load_agent_cls():
    from mini_agent.agent import Agent

    return Agent


def _load_llm_client_cls():
    from mini_agent.llm.llm_wrapper import LLMClient

    return LLMClient


def _deep_merge_dict(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge_dict(merged[key], value)
        else:
            merged[key] = value
    return merged


def _resolve_skills_dir(skills_dir: str) -> str:
    skills_path = Path(skills_dir).expanduser()
    if skills_path.is_absolute():
        return str(skills_path)

    search_paths = [
        skills_path,
        Path("mini_agent") / skills_path,
        Config.get_package_dir() / skills_path,
    ]
    for path in search_paths:
        if path.exists():
            return str(path.resolve())
    return str(skills_path)


def _default_runtime_config_dict() -> dict[str, Any]:
    return {
        "llm": {
            "api_key": "",
            "api_base": "https://api.minimax.io",
            "model": "MiniMax-M2.5",
            "provider": "anthropic",
            "retry": {
                "enabled": True,
                "max_retries": 3,
                "initial_delay": 1.0,
                "max_delay": 60.0,
                "exponential_base": 2.0,
            },
        },
        "agent": {
            "max_steps": 50,
            "workspace_dir": "./workspace",
            "system_prompt_path": "system_prompt.md",
        },
        "tools": {
            "enable_file_tools": True,
            "enable_bash": True,
            "enable_note": True,
            "enable_skills": True,
            "skills_dir": "./skills",
            "enable_mcp": True,
            "mcp_config_path": "mcp.json",
            "mcp": {
                "connect_timeout": 10.0,
                "execute_timeout": 60.0,
                "sse_read_timeout": 120.0,
            },
        },
        "tts": {
            "enabled": True,
            "provider": "minimax",
            "voice": "female-shaonv",
            "audio_format": "mp3",
            "streaming": True,
            "auto_play": False,
            "sentence_buffer_chars": 120,
            "edge_rate": "+0%",
            "minimax_group_id": "",
            "minimax_model": "speech-02-hd",
        },
    }


def build_profile_runtime_config(profile: Any) -> Config:
    """Build effective runtime config for a profile."""
    try:
        base_config = Config.from_yaml(Config.get_default_config_path()).to_dict()
    except Exception:
        base_config = _default_runtime_config_dict()
    override = profile.config_json or {}
    merged = _deep_merge_dict(base_config, override)
    return Config.from_dict(merged, require_api_key=True)


def resolve_workspace_path(session: Any, config: Config) -> Path:
    workspace = session.workspace_path or config.agent.workspace_dir
    return Path(workspace).expanduser().absolute()


def build_session_workspace_path(
    config: Config,
    session_id: str,
    explicit_workspace_path: str | None = None,
) -> Path:
    """Resolve the effective workspace path for a session.

    New sessions default to a unique directory under the profile workspace root.
    """
    if explicit_workspace_path:
        return Path(explicit_workspace_path).expanduser().absolute()

    workspace_root = Path(config.agent.workspace_dir).expanduser().absolute()
    return workspace_root / "sessions" / session_id


def resolve_system_prompt(profile: Any, config: Config, skills_metadata: str = "") -> str:
    """Resolve the system prompt for a session."""
    prompt = profile.system_prompt

    if not prompt and profile.system_prompt_path:
        prompt_path = Path(profile.system_prompt_path).expanduser()
        if prompt_path.exists():
            prompt = prompt_path.read_text(encoding="utf-8")

    if not prompt:
        system_prompt_path = Config.find_config_file(config.agent.system_prompt_path)
        if system_prompt_path and system_prompt_path.exists():
            prompt = system_prompt_path.read_text(encoding="utf-8")

    if not prompt:
        prompt = DEFAULT_SYSTEM_PROMPT

    if "{SKILLS_METADATA}" in prompt:
        prompt = prompt.replace("{SKILLS_METADATA}", skills_metadata)

    return prompt


def resolve_mcp_config_snapshot(
    config: Config,
    profile_mcp_config: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Resolve the MCP configuration used for a run snapshot."""
    if not config.tools.enable_mcp:
        return None

    if profile_mcp_config is not None:
        return profile_mcp_config

    mcp_config_path = Config.find_config_file(config.tools.mcp_config_path)
    if not mcp_config_path and config.tools.mcp_config_path.endswith("mcp.json"):
        fallback = Path(config.tools.mcp_config_path).with_name("mcp-example.json")
        if fallback.exists():
            mcp_config_path = fallback

    if not mcp_config_path or not mcp_config_path.exists():
        return None

    try:
        return json.loads(mcp_config_path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _built_in_tool_names(config: Config) -> list[str]:
    names: list[str] = []
    if config.tools.enable_bash:
        names.append("bash")
    if config.tools.enable_file_tools:
        names.extend(["read_file", "write_file", "edit_file"])
    if config.tools.enable_note:
        names.extend(["record_note", "recall_notes"])
    if config.tools.enable_skills:
        names.append("get_skill")
    return names


def build_tts_settings(config: Config) -> TTSSettings:
    """Build TTS settings from resolved runtime config."""
    return TTSSettings(
        enabled=config.tts.enabled,
        provider=config.tts.provider,
        voice=config.tts.voice,
        audio_format=config.tts.audio_format,
        streaming=config.tts.streaming,
        auto_play=config.tts.auto_play,
        sentence_buffer_chars=config.tts.sentence_buffer_chars,
        edge_rate=config.tts.edge_rate,
        minimax_group_id=config.tts.minimax_group_id,
        minimax_model=config.tts.minimax_model,
        api_key=config.llm.api_key,
        api_base=config.llm.api_base,
    )


def serialize_tts_state(settings: TTSSettings, status: str = "ready", error: str | None = None) -> dict[str, Any]:
    """Serialize TTS settings for clients."""
    provider_streaming_supported = provider_supports_streaming(settings)
    return {
        "status": status,
        "provider": settings.provider.value,
        "voice": settings.voice,
        "enabled": settings.enabled,
        "auto_play": settings.auto_play,
        "audio_format": settings.audio_format,
        "streaming": settings.streaming,
        "streaming_mode": "audio_stream" if settings.streaming and provider_streaming_supported else "buffered_chunk",
        "provider_streaming_supported": provider_streaming_supported,
        "sentence_buffer_chars": settings.sentence_buffer_chars,
        "error": error,
    }


def build_run_snapshot(
    profile: Any,
    config: Config,
    workspace_dir: Path,
    system_prompt: str,
    tools: list[Tool],
    skill_loader,
    mcp_config_snapshot: dict[str, Any] | None,
) -> dict[str, Any]:
    """Create a durable snapshot of the effective config used for a single run."""
    tool_names = [tool.name for tool in tools]
    builtin_names = set(_built_in_tool_names(config))
    skill_names = skill_loader.list_skills() if skill_loader else []
    mcp_tool_names = [name for name in tool_names if name not in builtin_names]

    return {
        "profile": {
            "id": profile.id,
            "key": profile.key,
            "name": profile.name,
        },
        "workspace_path": str(workspace_dir),
        "config": config.to_dict(),
        "system_prompt": system_prompt,
        "tool_names": tool_names,
        "skill_names": skill_names,
        "mcp": {
            "config": mcp_config_snapshot,
            "tool_names": mcp_tool_names,
        },
    }


async def build_agent_tools(
    config: Config,
    workspace_dir: Path,
    profile_mcp_config: dict[str, Any] | None = None,
) -> tuple[list[Tool], Any]:
    """Build agent tools for a web session."""
    from mini_agent.tools.mcp_loader import (
        load_mcp_tools_async,
        load_mcp_tools_from_config_async,
        set_mcp_timeout_config,
    )

    tools: list[Tool] = []
    skill_loader = None

    await asyncio.to_thread(workspace_dir.mkdir, parents=True, exist_ok=True)

    if config.tools.enable_bash:
        tools.append(BashTool(workspace_dir=str(workspace_dir)))

    if config.tools.enable_file_tools:
        tools.extend(
            [
                ReadTool(workspace_dir=str(workspace_dir)),
                WriteTool(workspace_dir=str(workspace_dir)),
                EditTool(workspace_dir=str(workspace_dir)),
            ]
        )

    if config.tools.enable_note:
        memory_file = workspace_dir / ".agent_memory.json"
        tools.extend(
            [
                SessionNoteTool(memory_file=str(memory_file)),
                RecallNoteTool(memory_file=str(memory_file)),
            ]
        )

    if config.tools.enable_skills:
        builtin_skills_dir = _resolve_skills_dir(config.tools.skills_dir)
        uploaded_skills_dir = get_uploaded_skills_dir(create=True)
        skill_tools, skill_loader = create_skill_tools(
            [builtin_skills_dir, str(uploaded_skills_dir)],
            allowed_skills=config.tools.allowed_skills,
        )
        tools.extend(skill_tools)

    if config.tools.enable_mcp:
        set_mcp_timeout_config(
            connect_timeout=config.tools.mcp.connect_timeout,
            execute_timeout=config.tools.mcp.execute_timeout,
            sse_read_timeout=config.tools.mcp.sse_read_timeout,
        )
        if profile_mcp_config is not None:
            tools.extend(await load_mcp_tools_from_config_async(profile_mcp_config))
        else:
            mcp_config_path = Config.find_config_file(config.tools.mcp_config_path)
            if mcp_config_path:
                tools.extend(await load_mcp_tools_async(str(mcp_config_path)))

    return tools, skill_loader


def seed_agent_history(agent: Agent, history_rows: list[MessageRecord]) -> None:
    """Seed the agent with previous user and assistant final messages."""
    for row in history_rows:
        if row.event_type in (None, "user") and row.role == "user":
            agent.messages.append(Message(role="user", content=row.content or ""))
        elif row.event_type in (None, "assistant_message") and row.role == "assistant":
            agent.messages.append(Message(role="assistant", content=row.content or ""))


def build_agent_for_session(
    session: SessionRecord,
    profile: ProfileRecord,
    history_rows: list[MessageRecord],
    event_handler,
    tools: list[Tool],
    config: Config,
    skills_metadata: str = "",
    system_prompt: str | None = None,
) -> Agent:
    """Create an agent instance for a session."""
    agent_cls = _load_agent_cls()
    llm_client_cls = _load_llm_client_cls()
    system_prompt = system_prompt or resolve_system_prompt(profile, config, skills_metadata=skills_metadata)
    retry_config = RuntimeRetryConfig(
        enabled=config.llm.retry.enabled,
        max_retries=config.llm.retry.max_retries,
        initial_delay=config.llm.retry.initial_delay,
        max_delay=config.llm.retry.max_delay,
        exponential_base=config.llm.retry.exponential_base,
    )
    llm = llm_client_cls(
        api_key=config.llm.api_key,
        api_base=config.llm.api_base,
        model=config.llm.model,
        provider=config.llm.provider,
        retry_config=retry_config,
    )
    agent = agent_cls(
        llm_client=llm,
        system_prompt=system_prompt,
        tools=tools,
        max_steps=config.agent.max_steps,
        workspace_dir=session.workspace_path or config.agent.workspace_dir,
        event_handler=event_handler,
    )
    seed_agent_history(agent, history_rows)
    return agent


class SessionEventRecorder:
    """Persist and stream runtime events for a session."""

    def __init__(
        self,
        pool: asyncpg.Pool,
        session: SessionRecord,
        run: SessionRunRecord,
        sender,
        initial_sequence_no: int,
    ):
        self.pool = pool
        self.session = session
        self.run = run
        self.sender = sender
        self.sequence_no = initial_sequence_no

    def _event_role(self, event_type: str) -> str:
        if event_type == "user":
            return "user"
        if event_type in {"thinking", "assistant_message", "tool_call", "thinking_delta", "content_delta"}:
            return "assistant"
        if event_type == "tool_result":
            return "tool"
        return "system"

    def _event_content(self, event_type: str, payload: dict[str, Any]) -> str:
        if event_type in {"user", "thinking", "assistant_message"}:
            return payload.get("content", "") or ""
        if event_type in {"thinking_delta", "content_delta"}:
            return payload.get("delta", "") or ""
        if event_type == "tool_call":
            return json.dumps(payload.get("arguments", {}), ensure_ascii=False)
        if event_type == "tool_result":
            return payload.get("content") or payload.get("error") or ""
        if event_type == "run_started":
            return "Agent run started."
        if event_type == "run_completed":
            return payload.get("content", "") or "Agent run completed."
        if event_type == "run_cancelled":
            return payload.get("message", "Task cancelled by user.")
        if event_type == "run_failed":
            return payload.get("error", "Agent run failed.")
        return payload.get("content", "") or ""

    async def record_event(self, event_type: str, payload: dict[str, Any]) -> MessageRecord | None:
        if event_type in TRANSIENT_MESSAGE_EVENT_TYPES:
            outbound = {
                "id": None,
                "session_id": self.session.id,
                "run_id": self.run.id,
                "role": self._event_role(event_type),
                "content": self._event_content(event_type, payload),
                "event_type": event_type,
                "sequence_no": None,
                "name": payload.get("name"),
                "tool_call_id": payload.get("tool_call_id"),
                "metadata_json": payload or None,
                "created_at": datetime.utcnow().isoformat(),
            }
            await self.sender(
                self.session.id,
                {
                    "type": "message_event",
                    "session_id": self.session.id,
                    "run_id": self.run.id,
                    "event": outbound,
                },
            )
            return None

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                message = await insert_message_event(
                    conn,
                    session_id=self.session.id,
                    run_id=self.run.id,
                    role=self._event_role(event_type),
                    content=self._event_content(event_type, payload),
                    event_type=event_type,
                    sequence_no=self.sequence_no,
                    name=payload.get("name"),
                    tool_call_id=payload.get("tool_call_id"),
                    metadata_json=payload or None,
                )
                self.sequence_no += 1

                if event_type == "run_started":
                    session_status = "running"
                    run_status = "running"
                    completed_at = None
                elif event_type == "run_completed":
                    session_status = "completed"
                    run_status = "completed"
                    completed_at = datetime.utcnow()
                elif event_type == "run_failed":
                    session_status = "failed"
                    run_status = "failed"
                    completed_at = datetime.utcnow()
                elif event_type == "run_cancelled":
                    session_status = "cancelled"
                    run_status = "cancelled"
                    completed_at = datetime.utcnow()
                else:
                    session_status = None
                    run_status = None
                    completed_at = None

                if session_status and run_status:
                    await conn.execute(
                        "UPDATE agent_sessions SET status = $1, updated_at = NOW() WHERE id = $2::uuid",
                        session_status,
                        self.session.id,
                    )
                    await conn.execute(
                        "UPDATE agent_session_runs SET status = $1, completed_at = $2, updated_at = NOW() WHERE id = $3::uuid",
                        run_status,
                        completed_at,
                        self.run.id,
                    )

        outbound = {
            "id": message.id,
            "session_id": self.session.id,
            "run_id": self.run.id,
            "role": message.role,
            "content": message.content,
            "event_type": message.event_type,
            "sequence_no": message.sequence_no,
            "name": message.name,
            "tool_call_id": message.tool_call_id,
            "metadata_json": message.metadata_json,
            "created_at": message.created_at.isoformat(),
        }
        packet_type = "message_event" if event_type in MESSAGE_EVENT_TYPES else event_type
        await self.sender(
            self.session.id,
            {
                "type": packet_type,
                "session_id": self.session.id,
                "run_id": self.run.id,
                "event": outbound,
            },
        )
        return message


@dataclass
class RunHandle:
    task: asyncio.Task
    cancel_event: asyncio.Event


class WebAgentRuntimeManager:
    """Manage websocket connections and active session runs."""

    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}
        self.active_runs: dict[str, RunHandle] = {}

    async def connect(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        self.active_connections[session_id] = websocket

    def disconnect(self, session_id: str):
        if session_id in self.active_connections:
            del self.active_connections[session_id]

    async def send_message(self, session_id: str, message: dict[str, Any]):
        websocket = self.active_connections.get(session_id)
        if websocket is None:
            return
        try:
            await websocket.send_json(message)
        except Exception:
            self.disconnect(session_id)

    def is_running(self, session_id: str) -> bool:
        handle = self.active_runs.get(session_id)
        return handle is not None and not handle.task.done()

    async def start_run(self, app: Any, session_id: str, user_id: int, content: str):
        if self.is_running(session_id):
            await self.send_message(
                session_id,
                {
                    "type": "error",
                    "session_id": session_id,
                    "error": "A task is already running for this session.",
                },
            )
            return

        cancel_event = asyncio.Event()
        task = asyncio.create_task(self._run_session(app, session_id, user_id, content, cancel_event))
        self.active_runs[session_id] = RunHandle(task=task, cancel_event=cancel_event)
        task.add_done_callback(lambda _: self.active_runs.pop(session_id, None))

    async def cancel_run(self, session_id: str):
        handle = self.active_runs.get(session_id)
        if handle is None or handle.task.done():
            await self.send_message(
                session_id,
                {
                    "type": "error",
                    "session_id": session_id,
                    "error": "No running task found for this session.",
                },
            )
            return
        handle.cancel_event.set()

    async def _run_session(self, app: Any, session_id: str, user_id: int, content: str, cancel_event: asyncio.Event):
        pool = get_pool_from_app(app)
        recorder: SessionEventRecorder | None = None
        session_run: SessionRunRecord | None = None
        tts_manager: TTSManager | None = None
        try:
            session = await get_session(pool, user_id, session_id)
            if not session:
                await self.send_message(
                    session_id,
                    {"type": "error", "session_id": session_id, "error": "Session not found."},
                )
                return

            profile = await get_profile(pool, user_id, session.profile_id)
            if not profile:
                await self.send_message(
                    session_id,
                    {"type": "error", "session_id": session_id, "error": "Profile not found."},
                )
                return

            config = build_profile_runtime_config(profile)
            if not session.workspace_path:
                session = await update_session(
                    pool,
                    user_id,
                    session.id,
                    workspace_path=str(resolve_workspace_path(session, config)),
                    status=session.status if session.status in {"running", "completed", "failed", "cancelled"} else "idle",
                ) or session

            workspace_dir = resolve_workspace_path(session, config)
            tools, skill_loader = await build_agent_tools(config, workspace_dir, profile.mcp_config_json)
            skills_metadata = skill_loader.get_skills_metadata_prompt() if skill_loader else ""
            system_prompt = resolve_system_prompt(profile, config, skills_metadata=skills_metadata)
            mcp_config_snapshot = resolve_mcp_config_snapshot(config, profile.mcp_config_json)
            run_snapshot = build_run_snapshot(
                profile=profile,
                config=config,
                workspace_dir=workspace_dir,
                system_prompt=system_prompt,
                tools=tools,
                skill_loader=skill_loader,
                mcp_config_snapshot=mcp_config_snapshot,
            )
            session_run = await create_run(
                pool=pool,
                session_id=session.id,
                profile_id=profile.id,
                workspace_path=str(workspace_dir),
                snapshot_json=run_snapshot,
            )

            history_rows = await get_session_history(pool, session_id)

            next_seq = (history_rows[-1].sequence_no + 1) if history_rows else 1
            recorder = SessionEventRecorder(pool, session, session_run, self.send_message, next_seq)
            tts_settings = build_tts_settings(config)

            async def emit_tts_event(event_type: str, payload: dict[str, Any]) -> None:
                event_payload = dict(payload)
                if event_type == "tts_chunk_data" and "audio_bytes" in event_payload:
                    event_payload["audio_b64"] = base64.b64encode(event_payload.pop("audio_bytes")).decode("ascii")

                await self.send_message(
                    session_id,
                    {
                        "type": event_type,
                        "session_id": session_id,
                        "run_id": session_run.id if session_run else None,
                        "tts": event_payload,
                    },
                )

            tts_provider = create_tts_provider(tts_settings) if tts_settings.enabled else None
            tts_manager = TTSManager(tts_settings, provider=tts_provider, emit=emit_tts_event)
            await tts_manager.start()
            await tts_manager.reset(reason="run_started")

            async def composite_event_handler(event_type: str, payload: dict[str, Any]) -> None:
                await recorder.record_event(event_type, payload)
                if tts_manager is not None:
                    await tts_manager.handle_agent_event(event_type, payload)

            agent = build_agent_for_session(
                session=session,
                profile=profile,
                history_rows=history_rows,
                event_handler=composite_event_handler,
                tools=tools,
                config=config,
                skills_metadata=skills_metadata,
                system_prompt=system_prompt,
            )

            await recorder.record_event("user", {"content": content})
            agent.add_user_message(content)
            await agent.run(cancel_event=cancel_event)
        except Exception as exc:
            if recorder is not None:
                await recorder.record_event("run_failed", {"error": str(exc)})
            elif session_run is not None:
                await update_run_status(
                    pool,
                    run_id=session_run.id,
                    session_id=session_id,
                    session_status="failed",
                    run_status="failed",
                    completed_at=datetime.utcnow(),
                )
                await self.send_message(
                    session_id,
                    {
                        "type": "error",
                        "session_id": session_id,
                        "run_id": session_run.id,
                        "error": str(exc),
                    },
                )
            else:
                await self.send_message(
                    session_id,
                    {"type": "error", "session_id": session_id, "error": str(exc)},
                )
        finally:
            if tts_manager is not None:
                await tts_manager.close()
