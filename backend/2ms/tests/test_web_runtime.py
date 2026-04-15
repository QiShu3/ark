"""Tests for agent events and web runtime execution flow."""

import asyncio
import tempfile
import uuid
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from mini_agent.agent import Agent
from mini_agent.config import Config
from mini_agent.schema import FunctionCall, LLMResponse, LLMStreamEvent, ToolCall
from mini_agent.server import database, runtime
from mini_agent.server.main import app
from mini_agent.server.routers.auth import create_access_token
from mini_agent.server.routers.sessions import runtime_manager
from mini_agent.tools.base import Tool, ToolResult
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

pytestmark = pytest.mark.skip(reason="Legacy SQLAlchemy web runtime tests are obsolete after the asyncpg migration.")


class FakeWriteLLMClient:
    """LLM client that writes a file and completes."""

    def __init__(self, *args, **kwargs):
        pass

    async def generate(self, messages, tools=None):
        has_tool_result = any(message.role == "tool" for message in messages)
        if not has_tool_result:
            return LLMResponse(
                content="我先创建文件。",
                thinking="需要调用 write_file 工具。",
                tool_calls=[
                    ToolCall(
                        id="call-1",
                        type="function",
                        function=FunctionCall(
                            name="write_file",
                            arguments={"path": "hello.txt", "content": "hello from websocket"},
                        ),
                    )
                ],
                finish_reason="tool_use",
            )
        return LLMResponse(
            content="文件已经创建完成。",
            thinking=None,
            tool_calls=None,
            finish_reason="stop",
        )


class FakeStreamingWriteLLMClient:
    """LLM client that streams content before issuing tool calls."""

    def __init__(self, *args, **kwargs):
        self.calls = 0

    async def stream_generate(self, messages, tools=None) -> AsyncIterator[LLMStreamEvent]:
        self.calls += 1
        if self.calls == 1:
            yield LLMStreamEvent(type="thinking_delta", delta="需要调用 write_file 工具。")
            yield LLMStreamEvent(type="content_delta", delta="我先")
            yield LLMStreamEvent(type="content_delta", delta="创建文件。")
            yield LLMStreamEvent(
                type="tool_call",
                tool_call=ToolCall(
                    id="call-stream-1",
                    type="function",
                    function=FunctionCall(
                        name="write_file",
                        arguments={"path": "hello.txt", "content": "hello from websocket"},
                    ),
                ),
            )
            yield LLMStreamEvent(type="done", finish_reason="tool_use")
            return

        yield LLMStreamEvent(type="content_delta", delta="文件已经创建完成。")
        yield LLMStreamEvent(type="done", finish_reason="stop")


class FakeTTSProvider:
    supports_streaming = False

    async def synthesize(self, request):
        from mini_agent.tts.schemas import TTSAudioChunk

        return TTSAudioChunk(
            provider="fake",
            voice=request.voice,
            text=request.text,
            audio_format=request.audio_format,
            audio_bytes=request.text.encode("utf-8"),
            sequence_no=request.sequence_no,
        )


class FakeStreamingTTSProvider(FakeTTSProvider):
    supports_streaming = True

    async def stream_synthesize(self, request):
        from mini_agent.tts.schemas import TTSAudioChunkData

        yield TTSAudioChunkData(audio_bytes=b"aa", chunk_index=0, is_final=False)
        yield TTSAudioChunkData(audio_bytes=b"bb", chunk_index=1, is_final=True)


class SlowTool(Tool):
    @property
    def name(self) -> str:
        return "slow_tool"

    @property
    def description(self) -> str:
        return "Sleep briefly before completing."

    @property
    def parameters(self) -> dict:
        return {"type": "object", "properties": {}, "required": []}

    async def execute(self, **kwargs):
        await asyncio.sleep(0.15)
        return ToolResult(success=True, content="slow tool finished")


class FakeSlowLLMClient:
    """LLM client that triggers a slow tool to test cancellation and serialization."""

    def __init__(self, *args, **kwargs):
        pass

    async def generate(self, messages, tools=None):
        has_tool_result = any(message.role == "tool" for message in messages)
        if not has_tool_result:
            return LLMResponse(
                content="准备执行慢工具。",
                thinking="需要等待慢工具完成。",
                tool_calls=[
                    ToolCall(
                        id="slow-1",
                        type="function",
                        function=FunctionCall(name="slow_tool", arguments={}),
                    )
                ],
                finish_reason="tool_use",
            )
        return LLMResponse(
            content="慢工具完成。",
            thinking=None,
            tool_calls=None,
            finish_reason="stop",
        )


class FakeEventLLMClient:
    """LLM client for unit-testing agent events."""

    def __init__(self):
        self.calls = 0

    async def generate(self, messages, tools=None):
        self.calls += 1
        if self.calls == 1:
            return LLMResponse(
                content="先用工具。",
                thinking="我要调用测试工具。",
                tool_calls=[
                    ToolCall(
                        id="evt-1",
                        type="function",
                        function=FunctionCall(name="test_tool", arguments={}),
                    )
                ],
                finish_reason="tool_use",
            )
        return LLMResponse(
            content="任务完成。",
            thinking=None,
            tool_calls=None,
            finish_reason="stop",
        )


class FakeSingleReplyLLMClient:
    """LLM client that returns a single final response without tool use."""

    def __init__(self, *args, **kwargs):
        pass

    async def generate(self, messages, tools=None):
        return LLMResponse(
            content="完成。",
            thinking=None,
            tool_calls=None,
            finish_reason="stop",
        )


class FakeStreamingEventLLMClient:
    """LLM client that yields incremental events for agent streaming tests."""

    def __init__(self):
        self.calls = 0

    async def stream_generate(self, messages, tools=None) -> AsyncIterator[LLMStreamEvent]:
        self.calls += 1
        if self.calls == 1:
            yield LLMStreamEvent(type="thinking_delta", delta="我要调用测试工具。")
            yield LLMStreamEvent(type="content_delta", delta="先")
            yield LLMStreamEvent(type="content_delta", delta="用工具。")
            yield LLMStreamEvent(
                type="tool_call",
                tool_call=ToolCall(
                    id="evt-stream-1",
                    type="function",
                    function=FunctionCall(name="test_tool", arguments={}),
                ),
            )
            yield LLMStreamEvent(type="done", finish_reason="tool_use")
            return

        yield LLMStreamEvent(type="content_delta", delta="任务完成。")
        yield LLMStreamEvent(type="done", finish_reason="stop")


class FakeCancellableStreamingLLMClient:
    """LLM client that streams slowly enough to test cancellation cleanup."""

    async def stream_generate(self, messages, tools=None) -> AsyncIterator[LLMStreamEvent]:
        yield LLMStreamEvent(type="thinking_delta", delta="准备回答")
        await asyncio.sleep(0.05)
        yield LLMStreamEvent(type="content_delta", delta="半截回复")
        await asyncio.sleep(0.2)
        yield LLMStreamEvent(type="done", finish_reason="stop")


class TestTool(Tool):
    @property
    def name(self) -> str:
        return "test_tool"

    @property
    def description(self) -> str:
        return "Return a fixed result."

    @property
    def parameters(self) -> dict:
        return {"type": "object", "properties": {}, "required": []}

    async def execute(self, **kwargs):
        return ToolResult(success=True, content="tool ok")


@pytest.fixture
def web_client(tmp_path, monkeypatch):
    db_path = tmp_path / "web-runtime.db"
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    testing_session = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    monkeypatch.setattr(database, "engine", engine)
    monkeypatch.setattr(database, "SessionLocal", testing_session)
    monkeypatch.setattr(runtime, "SessionLocal", testing_session)

    database.Base.metadata.create_all(bind=engine)
    database.init_db()
    runtime_manager.active_connections.clear()
    runtime_manager.active_runs.clear()

    with TestClient(app) as client:
        yield client, testing_session, tmp_path

    runtime_manager.active_connections.clear()
    runtime_manager.active_runs.clear()
    engine.dispose()


def create_user_and_headers(session_factory, suffix: str = "tester"):
    db = session_factory()
    from sqlalchemy import text
    db.execute(
        text("INSERT INTO auth_users(username, password_hash, password_salt, is_active, is_admin) VALUES (:username, 'fakehash', 'fakesalt', 1, 0)"),
        {"username": suffix}
    )
    db.commit()
    user_id = db.execute(text("SELECT id FROM auth_users WHERE username = :username"), {"username": suffix}).scalar()
    token = create_access_token({"sub": user_id})
    db.close()
    return {"Authorization": f"Bearer {token}"}


def create_profile_payload(workspace_dir: Path | None = None) -> dict:
    payload = {
        "key": f"profile-{uuid.uuid4().hex[:12]}",
        "name": "Web Profile",
        "system_prompt": "你是一个测试助手。",
        "config_json": {
            "llm": {
                "api_key": "test-key",
                "api_base": "https://example.invalid",
                "model": "fake-model",
                "provider": "anthropic",
            },
            "agent": {
                "max_steps": 5,
            },
            "tools": {
                "enable_file_tools": True,
                "enable_bash": False,
                "enable_note": False,
                "enable_skills": False,
                "enable_mcp": False,
            },
            "tts": {
                "enabled": False,
            },
        },
        "is_default": True,
    }
    if workspace_dir is not None:
        payload["config_json"]["agent"]["workspace_dir"] = str(workspace_dir)
    return payload


def expected_session_workspace(session_id: str) -> Path:
    return Path("./workspace").resolve() / "sessions" / session_id


@pytest.mark.asyncio
async def test_agent_emits_runtime_events():
    events = []

    async def record_event(event_type, payload):
        events.append((event_type, payload))

    with tempfile.TemporaryDirectory() as workspace_dir:
        agent = Agent(
            llm_client=FakeEventLLMClient(),
            system_prompt="System",
            tools=[TestTool()],
            workspace_dir=workspace_dir,
            event_handler=record_event,
        )
        agent.add_user_message("run")
        result = await agent.run()

    assert result == "任务完成。"
    event_types = [event_type for event_type, _ in events]
    assert event_types == [
        "run_started",
        "thinking",
        "assistant_message",
        "tool_call",
        "tool_result",
        "assistant_message",
        "run_completed",
    ]


@pytest.mark.asyncio
async def test_agent_emits_streaming_runtime_events():
    events = []

    async def record_event(event_type, payload):
        events.append((event_type, payload))

    with tempfile.TemporaryDirectory() as workspace_dir:
        agent = Agent(
            llm_client=FakeStreamingEventLLMClient(),
            system_prompt="System",
            tools=[TestTool()],
            workspace_dir=workspace_dir,
            event_handler=record_event,
        )
        agent.add_user_message("run")
        result = await agent.run()

    assert result == "任务完成。"
    event_types = [event_type for event_type, _ in events]
    assert event_types == [
        "run_started",
        "thinking_delta",
        "content_delta",
        "content_delta",
        "thinking",
        "assistant_message",
        "tool_call",
        "tool_result",
        "content_delta",
        "assistant_message",
        "run_completed",
    ]
    assert events[4][1]["content"] == "我要调用测试工具。"
    assert events[5][1]["content"] == "先用工具。"


@pytest.mark.asyncio
async def test_agent_cancellation_drops_partial_streaming_message():
    cancel_event = asyncio.Event()
    seen_content_delta = asyncio.Event()

    async def record_event(event_type, payload):
        if event_type == "content_delta":
            seen_content_delta.set()
            cancel_event.set()

    with tempfile.TemporaryDirectory() as workspace_dir:
        agent = Agent(
            llm_client=FakeCancellableStreamingLLMClient(),
            system_prompt="System",
            tools=[],
            workspace_dir=workspace_dir,
            event_handler=record_event,
        )
        agent.add_user_message("run")
        result = await agent.run(cancel_event=cancel_event)

    assert seen_content_delta.is_set()
    assert result == "Task cancelled by user."
    assert [message.role for message in agent.get_history()] == ["system", "user"]


def test_nested_config_from_dict():
    config = Config.from_dict(
        {
            "llm": {
                "api_key": "key",
                "api_base": "https://example.com",
                "model": "demo",
                "provider": "openai",
            },
            "agent": {
                "max_steps": 7,
                "workspace_dir": "/tmp/demo",
            },
            "tools": {
                "enable_file_tools": False,
                "enable_bash": False,
                "enable_note": True,
                "enable_skills": False,
                "enable_mcp": False,
            },
        }
    )

    assert config.llm.provider == "openai"
    assert config.agent.max_steps == 7
    assert config.agent.workspace_dir == "/tmp/demo"
    assert config.tools.enable_file_tools is False
    assert config.tools.enable_note is True


def test_serialize_tts_state_reports_streaming_capability():
    minimax_state = runtime.serialize_tts_state(
        runtime.TTSSettings(provider="minimax", streaming=True),
    )
    edge_state = runtime.serialize_tts_state(
        runtime.TTSSettings(provider="edge", streaming=True),
    )

    assert minimax_state["streaming_mode"] == "audio_stream"
    assert minimax_state["provider_streaming_supported"] is True
    assert edge_state["streaming_mode"] == "buffered_chunk"
    assert edge_state["provider_streaming_supported"] is False


def test_web_page_uses_versioned_static_assets(web_client):
    client, _, _ = web_client

    response = client.get("/web")

    assert response.status_code == 200
    assert "/static/app.js?v=" in response.text
    assert "/static/styles.css?v=" in response.text


def test_build_agent_for_session_converts_retry_config(monkeypatch, tmp_path):
    captured = {}

    class CapturingLLMClient:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr(runtime, "LLMClient", CapturingLLMClient)

    config = Config.from_dict(
        {
            "llm": {
                "api_key": "key",
                "api_base": "https://example.com",
                "model": "demo",
                "provider": "anthropic",
                "retry": {
                    "enabled": True,
                    "max_retries": 4,
                    "initial_delay": 0.5,
                    "max_delay": 8.0,
                    "exponential_base": 3.0,
                },
            },
            "agent": {
                "workspace_dir": str(tmp_path),
                "max_steps": 7,
            },
            "tools": {
                "enable_file_tools": False,
                "enable_bash": False,
                "enable_note": False,
                "enable_skills": False,
                "enable_mcp": False,
            },
        }
    )
    session = runtime.SessionModel(user_id="user-1", profile_id="profile-1", workspace_path=str(tmp_path))
    profile = runtime.Profile(user_id="user-1", name="profile", system_prompt="test prompt")

    agent = runtime.build_agent_for_session(
        session=session,
        profile=profile,
        history_rows=[],
        event_handler=None,
        tools=[],
        config=config,
    )

    retry_config = captured["retry_config"]

    assert hasattr(retry_config, "retryable_exceptions")
    assert retry_config.enabled is True
    assert retry_config.max_retries == 4
    assert retry_config.initial_delay == 0.5
    assert retry_config.max_delay == 8.0
    assert retry_config.exponential_base == 3.0
    assert agent.llm is not None


def test_build_session_workspace_path_uses_default_root_without_profile_workspace():
    path = runtime.build_session_workspace_path(session_id="session-123")

    assert path == Path("./workspace").resolve() / "sessions" / "session-123"


def test_websocket_run_flow_persists_all_events(web_client, monkeypatch):
    client, session_factory, tmp_path = web_client
    monkeypatch.setattr(runtime, "LLMClient", FakeWriteLLMClient)

    headers = create_user_and_headers(session_factory)
    profile_response = client.post("/api/profiles", json=create_profile_payload(), headers=headers)
    assert profile_response.status_code == 201
    profile_id = profile_response.json()["id"]

    session_response = client.post("/api/sessions", json={"profile_id": profile_id}, headers=headers)
    assert session_response.status_code == 201
    session_id = session_response.json()["id"]
    expected_workspace = expected_session_workspace(session_id)
    assert session_response.json()["workspace_path"] == str(expected_workspace)

    with client.websocket_connect(f"/api/sessions/ws/{session_id}?token={headers['Authorization'].split(' ', 1)[1]}") as websocket:
        connected = websocket.receive_json()
        assert connected["type"] == "connected"

        websocket.send_json({"type": "run", "content": "创建一个文件"})

        received_types = []
        while True:
            message = websocket.receive_json()
            received_types.append(message["type"])
            if message["type"] == "run_completed":
                break

        assert received_types == [
            "message_event",
            "run_started",
            "message_event",
            "message_event",
            "message_event",
            "message_event",
            "message_event",
            "run_completed",
        ]

    messages_response = client.get(f"/api/sessions/{session_id}/messages", headers=headers)
    assert messages_response.status_code == 200
    message_rows = messages_response.json()
    event_types = [item["event_type"] for item in message_rows]
    assert event_types == [
        "user",
        "run_started",
        "thinking",
        "assistant_message",
        "tool_call",
        "tool_result",
        "assistant_message",
        "run_completed",
    ]

    runs_response = client.get(f"/api/sessions/{session_id}/runs", headers=headers)
    assert runs_response.status_code == 200
    runs = runs_response.json()
    assert len(runs) == 1
    run = runs[0]
    assert run["status"] == "completed"
    assert run["workspace_path"] == str(expected_workspace)
    assert run["snapshot_json"]["profile"]["id"] == profile_id
    assert run["snapshot_json"]["config"]["llm"]["model"] == "fake-model"
    assert run["snapshot_json"]["system_prompt"] == "你是一个测试助手。"
    assert run["snapshot_json"]["tool_names"] == ["read_file", "write_file", "edit_file"]
    assert run["snapshot_json"]["skill_names"] == []
    assert run["snapshot_json"]["mcp"]["tool_names"] == []
    assert all(item["run_id"] == run["id"] for item in message_rows)

    hello_file = expected_workspace / "hello.txt"
    assert hello_file.exists()
    assert hello_file.read_text(encoding="utf-8") == "hello from websocket"


def test_create_session_generates_unique_workspace_per_session(web_client):
    client, session_factory, tmp_path = web_client

    headers = create_user_and_headers(session_factory)
    profile_response = client.post("/api/profiles", json=create_profile_payload(), headers=headers)
    assert profile_response.status_code == 201
    profile_id = profile_response.json()["id"]

    first_response = client.post("/api/sessions", json={"profile_id": profile_id}, headers=headers)
    second_response = client.post("/api/sessions", json={"profile_id": profile_id}, headers=headers)

    assert first_response.status_code == 201
    assert second_response.status_code == 201

    first_session = first_response.json()
    second_session = second_response.json()

    assert first_session["workspace_path"] != second_session["workspace_path"]
    assert first_session["workspace_path"] == str(expected_session_workspace(first_session["id"]))
    assert second_session["workspace_path"] == str(expected_session_workspace(second_session["id"]))
    assert first_session["name"] == f"会话 {first_session['id'][:8]}"
    assert second_session["name"] == f"会话 {second_session['id'][:8]}"


def test_create_session_respects_explicit_workspace_override(web_client):
    client, session_factory, tmp_path = web_client

    headers = create_user_and_headers(session_factory)
    workspace_dir = tmp_path / "workspace-root"
    explicit_workspace = (tmp_path / "manual-session-workspace").resolve()
    profile_response = client.post("/api/profiles", json=create_profile_payload(workspace_dir), headers=headers)
    assert profile_response.status_code == 201
    profile_id = profile_response.json()["id"]

    session_response = client.post(
        "/api/sessions",
        json={"profile_id": profile_id, "workspace_path": str(explicit_workspace)},
        headers=headers,
    )

    assert session_response.status_code == 201
    assert session_response.json()["workspace_path"] == str(explicit_workspace)


def test_update_session_name_and_profile(web_client):
    client, session_factory, tmp_path = web_client

    headers = create_user_and_headers(session_factory)
    first_workspace = tmp_path / "workspace-a"
    second_workspace = tmp_path / "workspace-b"
    first_profile = client.post("/api/profiles", json=create_profile_payload(first_workspace), headers=headers)
    second_payload = create_profile_payload(second_workspace)
    second_payload["name"] = "Second Profile"
    second_payload["is_default"] = False
    second_profile = client.post("/api/profiles", json=second_payload, headers=headers)

    session_response = client.post("/api/sessions", json={"profile_id": first_profile.json()["id"]}, headers=headers)
    session_id = session_response.json()["id"]

    update_response = client.put(
        f"/api/sessions/{session_id}",
        json={"name": "新会话名称", "profile_id": second_profile.json()["id"]},
        headers=headers,
    )

    assert update_response.status_code == 200
    assert update_response.json()["name"] == "新会话名称"
    assert update_response.json()["profile_id"] == second_profile.json()["id"]
    assert update_response.json()["workspace_path"] == session_response.json()["workspace_path"]


def test_update_session_accepts_shared_profile_created_by_other_user(web_client):
    client, session_factory, tmp_path = web_client

    headers = create_user_and_headers(session_factory)
    profile_response = client.post("/api/profiles", json=create_profile_payload(tmp_path / "workspace-a"), headers=headers)
    session_response = client.post("/api/sessions", json={"profile_id": profile_response.json()["id"]}, headers=headers)

    other_headers = create_user_and_headers(session_factory, suffix="other-user")
    other_payload = create_profile_payload(tmp_path / "workspace-other")
    other_payload["name"] = "Other User Profile"
    other_profile = client.post("/api/profiles", json=other_payload, headers=other_headers)

    update_response = client.put(
        f"/api/sessions/{session_response.json()['id']}",
        json={"profile_id": other_profile.json()["id"], "name": "不会成功"},
        headers=headers,
    )

    assert update_response.status_code == 200
    assert update_response.json()["profile_id"] == other_profile.json()["id"]


def test_running_session_cannot_be_updated(web_client, monkeypatch):
    client, session_factory, tmp_path = web_client
    monkeypatch.setattr(runtime, "LLMClient", FakeSlowLLMClient)

    async def fake_build_agent_tools(config, workspace_dir, profile_mcp_config=None):
        return [SlowTool()], None

    monkeypatch.setattr(runtime, "build_agent_tools", fake_build_agent_tools)

    headers = create_user_and_headers(session_factory)
    profile_response = client.post("/api/profiles", json=create_profile_payload(tmp_path / "workspace"), headers=headers)
    session_response = client.post("/api/sessions", json={"profile_id": profile_response.json()["id"]}, headers=headers)
    session_id = session_response.json()["id"]
    token = headers["Authorization"].split(" ", 1)[1]

    with client.websocket_connect(f"/api/sessions/ws/{session_id}?token={token}") as websocket:
        websocket.receive_json()
        websocket.send_json({"type": "run", "content": "慢一点运行"})

        seen_run_started = False
        while not seen_run_started:
            message = websocket.receive_json()
            seen_run_started = message["type"] == "run_started"

        update_response = client.put(
            f"/api/sessions/{session_id}",
            json={"name": "运行中修改"},
            headers=headers,
        )
        assert update_response.status_code == 409

        websocket.send_json({"type": "cancel"})
        while websocket.receive_json()["type"] != "run_cancelled":
            pass


def test_delete_profile_reassigns_sessions_to_default_profile(web_client):
    client, session_factory, tmp_path = web_client

    headers = create_user_and_headers(session_factory)
    default_profile = client.post("/api/profiles", json=create_profile_payload(tmp_path / "workspace-default"), headers=headers)
    alternate_payload = create_profile_payload(tmp_path / "workspace-alt")
    alternate_payload["name"] = "Alt Profile"
    alternate_payload["is_default"] = False
    alternate_profile = client.post("/api/profiles", json=alternate_payload, headers=headers)

    session_response = client.post("/api/sessions", json={"profile_id": alternate_profile.json()["id"]}, headers=headers)
    session_id = session_response.json()["id"]

    delete_response = client.delete(f"/api/profiles/{alternate_profile.json()['id']}", headers=headers)

    assert delete_response.status_code == 204
    session_detail = client.get(f"/api/sessions/{session_id}", headers=headers)
    assert session_detail.status_code == 200
    assert session_detail.json()["profile_id"] == default_profile.json()["id"]


def test_delete_default_profile_promotes_oldest_remaining_and_reassigns_sessions(web_client):
    client, session_factory, tmp_path = web_client

    headers = create_user_and_headers(session_factory)
    default_profile = client.post("/api/profiles", json=create_profile_payload(tmp_path / "workspace-default"), headers=headers)
    second_payload = create_profile_payload(tmp_path / "workspace-second")
    second_payload["name"] = "Second Profile"
    second_payload["is_default"] = False
    second_profile = client.post("/api/profiles", json=second_payload, headers=headers)
    third_payload = create_profile_payload(tmp_path / "workspace-third")
    third_payload["name"] = "Third Profile"
    third_payload["is_default"] = False
    third_profile = client.post("/api/profiles", json=third_payload, headers=headers)

    session_response = client.post("/api/sessions", json={"profile_id": default_profile.json()["id"]}, headers=headers)
    session_id = session_response.json()["id"]

    delete_response = client.delete(f"/api/profiles/{default_profile.json()['id']}", headers=headers)

    assert delete_response.status_code == 204
    profiles_response = client.get("/api/profiles", headers=headers)
    assert profiles_response.status_code == 200
    remaining_profiles = profiles_response.json()
    remaining_default = next(profile for profile in remaining_profiles if profile["is_default"])
    assert remaining_default["id"] == second_profile.json()["id"]
    assert all(profile["id"] != default_profile.json()["id"] for profile in remaining_profiles)

    session_detail = client.get(f"/api/sessions/{session_id}", headers=headers)
    assert session_detail.status_code == 200
    assert session_detail.json()["profile_id"] == second_profile.json()["id"]
    assert third_profile.json()["id"] in {profile["id"] for profile in remaining_profiles}


def test_delete_profile_reassigns_session_runs_to_replacement_profile(web_client, monkeypatch):
    client, session_factory, tmp_path = web_client
    monkeypatch.setattr(runtime, "LLMClient", FakeSingleReplyLLMClient)

    headers = create_user_and_headers(session_factory)
    default_profile = client.post("/api/profiles", json=create_profile_payload(tmp_path / "workspace-default"), headers=headers)
    alternate_payload = create_profile_payload(tmp_path / "workspace-alt")
    alternate_payload["name"] = "Alt Profile"
    alternate_payload["is_default"] = False
    alternate_profile = client.post("/api/profiles", json=alternate_payload, headers=headers)

    session_response = client.post("/api/sessions", json={"profile_id": alternate_profile.json()["id"]}, headers=headers)
    session_id = session_response.json()["id"]
    token = headers["Authorization"].split(" ", 1)[1]

    with client.websocket_connect(f"/api/sessions/ws/{session_id}?token={token}") as websocket:
        websocket.receive_json()
        websocket.send_json({"type": "run", "content": "运行一次"})
        while websocket.receive_json()["type"] != "run_completed":
            pass

    delete_response = client.delete(f"/api/profiles/{alternate_profile.json()['id']}", headers=headers)

    assert delete_response.status_code == 204
    runs_response = client.get(f"/api/sessions/{session_id}/runs", headers=headers)
    assert runs_response.status_code == 200
    runs = runs_response.json()
    assert len(runs) == 1
    assert runs[0]["profile_id"] == default_profile.json()["id"]


def test_cannot_delete_last_remaining_profile(web_client):
    client, session_factory, tmp_path = web_client

    headers = create_user_and_headers(session_factory)
    profile_response = client.post("/api/profiles", json=create_profile_payload(tmp_path / "workspace"), headers=headers)

    delete_response = client.delete(f"/api/profiles/{profile_response.json()['id']}", headers=headers)

    assert delete_response.status_code == 409
    assert "last remaining profile" in delete_response.json()["detail"]


def test_websocket_streaming_flow_sends_deltas_without_persisting_them(web_client, monkeypatch):
    client, session_factory, tmp_path = web_client
    monkeypatch.setattr(runtime, "LLMClient", FakeStreamingWriteLLMClient)

    headers = create_user_and_headers(session_factory)
    workspace_dir = tmp_path / "streaming-workspace"
    profile_response = client.post("/api/profiles", json=create_profile_payload(workspace_dir), headers=headers)
    assert profile_response.status_code == 201
    profile_id = profile_response.json()["id"]

    session_response = client.post("/api/sessions", json={"profile_id": profile_id}, headers=headers)
    assert session_response.status_code == 201
    session_id = session_response.json()["id"]

    token = headers["Authorization"].split(" ", 1)[1]
    streamed_event_types = []
    websocket_packet_types = []

    with client.websocket_connect(f"/api/sessions/ws/{session_id}?token={token}") as websocket:
        websocket.receive_json()
        websocket.send_json({"type": "run", "content": "创建一个文件"})

        while True:
            message = websocket.receive_json()
            websocket_packet_types.append(message["type"])
            if message.get("event"):
                streamed_event_types.append(message["event"]["event_type"])
            if message["type"] == "run_completed":
                break

    assert "message_event" in websocket_packet_types
    assert "thinking_delta" in streamed_event_types
    assert "content_delta" in streamed_event_types
    assert streamed_event_types.count("assistant_message") == 2

    messages_response = client.get(f"/api/sessions/{session_id}/messages", headers=headers)
    assert messages_response.status_code == 200
    persisted_event_types = [item["event_type"] for item in messages_response.json()]
    assert "thinking_delta" not in persisted_event_types
    assert "content_delta" not in persisted_event_types
    assert persisted_event_types == [
        "user",
        "run_started",
        "thinking",
        "assistant_message",
        "tool_call",
        "tool_result",
        "assistant_message",
        "run_completed",
    ]


def test_websocket_streaming_flow_emits_tts_packets(web_client, monkeypatch):
    client, session_factory, tmp_path = web_client
    monkeypatch.setattr(runtime, "LLMClient", FakeStreamingWriteLLMClient)
    monkeypatch.setattr(runtime, "create_tts_provider", lambda settings: FakeStreamingTTSProvider())

    headers = create_user_and_headers(session_factory)
    workspace_dir = tmp_path / "tts-streaming-workspace"
    profile_payload = create_profile_payload(workspace_dir)
    profile_payload["config_json"]["tts"] = {
        "enabled": True,
        "provider": "edge",
        "voice": "zh-CN-XiaoxiaoNeural",
        "auto_play": True,
    }
    profile_response = client.post("/api/profiles", json=profile_payload, headers=headers)
    assert profile_response.status_code == 201
    profile_id = profile_response.json()["id"]

    session_response = client.post("/api/sessions", json={"profile_id": profile_id}, headers=headers)
    assert session_response.status_code == 201
    session_id = session_response.json()["id"]

    token = headers["Authorization"].split(" ", 1)[1]
    packet_types = []

    with client.websocket_connect(f"/api/sessions/ws/{session_id}?token={token}") as websocket:
        connected = websocket.receive_json()
        assert connected["type"] == "connected"
        initial_tts_state = websocket.receive_json()
        assert initial_tts_state["type"] == "tts_state"
        assert initial_tts_state["tts"]["streaming_mode"] == "buffered_chunk"

        websocket.send_json({"type": "run", "content": "创建一个文件"})
        while True:
            message = websocket.receive_json()
            packet_types.append(message["type"])
            if message["type"] == "run_completed":
                break

    assert "tts_stop" in packet_types
    assert "tts_chunk_start" in packet_types
    assert "tts_chunk_data" in packet_types
    assert "tts_chunk_end" in packet_types


def test_websocket_cancel_and_serialization(web_client, monkeypatch):
    client, session_factory, tmp_path = web_client
    monkeypatch.setattr(runtime, "LLMClient", FakeSlowLLMClient)

    async def fake_build_agent_tools(config, workspace_dir, profile_mcp_config=None):
        return [SlowTool()], None

    monkeypatch.setattr(runtime, "build_agent_tools", fake_build_agent_tools)

    headers = create_user_and_headers(session_factory)
    workspace_dir = tmp_path / "slow-workspace"
    profile_response = client.post("/api/profiles", json=create_profile_payload(workspace_dir), headers=headers)
    profile_id = profile_response.json()["id"]
    session_response = client.post("/api/sessions", json={"profile_id": profile_id}, headers=headers)
    session_id = session_response.json()["id"]

    token = headers["Authorization"].split(" ", 1)[1]
    with client.websocket_connect(f"/api/sessions/ws/{session_id}?token={token}") as websocket:
        websocket.receive_json()
        websocket.send_json({"type": "run", "content": "慢一点运行"})

        seen_types = set()
        while "run_started" not in seen_types:
            message = websocket.receive_json()
            seen_types.add(message["type"])

        websocket.send_json({"type": "run", "content": "第二个请求"})
        error_message = None
        while error_message is None:
            message = websocket.receive_json()
            if message["type"] == "error":
                error_message = message
        assert error_message["type"] == "error"

        websocket.send_json({"type": "cancel"})

        terminal_event = None
        while True:
            message = websocket.receive_json()
            if message["type"] == "run_cancelled":
                terminal_event = message
                break

        assert terminal_event is not None

    session_detail = client.get(f"/api/sessions/{session_id}", headers=headers)
    assert session_detail.status_code == 200
    assert session_detail.json()["status"] == "cancelled"


def test_existing_session_uses_updated_profile_config_on_next_run(web_client, monkeypatch):
    client, session_factory, tmp_path = web_client
    monkeypatch.setattr(runtime, "LLMClient", FakeSingleReplyLLMClient)

    headers = create_user_and_headers(session_factory)
    workspace_dir = tmp_path / "live-profile-workspace"
    profile_payload = create_profile_payload(workspace_dir)
    profile_payload["config_json"]["llm"]["model"] = "first-model"
    profile_payload["system_prompt"] = "第一版 prompt"

    profile_response = client.post("/api/profiles", json=profile_payload, headers=headers)
    assert profile_response.status_code == 201
    profile_id = profile_response.json()["id"]

    session_response = client.post("/api/sessions", json={"profile_id": profile_id}, headers=headers)
    assert session_response.status_code == 201
    session_id = session_response.json()["id"]
    token = headers["Authorization"].split(" ", 1)[1]

    with client.websocket_connect(f"/api/sessions/ws/{session_id}?token={token}") as websocket:
        websocket.receive_json()
        websocket.send_json({"type": "run", "content": "第一次运行"})
        while websocket.receive_json()["type"] != "run_completed":
            pass

    updated_payload = {
        "config_json": {
            "llm": {
                "api_key": "test-key",
                "api_base": "https://example.invalid",
                "model": "second-model",
                "provider": "anthropic",
            },
            "agent": {
                "workspace_dir": str(workspace_dir),
                "max_steps": 5,
            },
            "tools": {
                "enable_file_tools": True,
                "enable_bash": False,
                "enable_note": False,
                "enable_skills": False,
                "enable_mcp": False,
            },
        },
        "system_prompt": "第二版 prompt",
    }
    update_response = client.put(f"/api/profiles/{profile_id}", json=updated_payload, headers=headers)
    assert update_response.status_code == 200

    with client.websocket_connect(f"/api/sessions/ws/{session_id}?token={token}") as websocket:
        websocket.receive_json()
        websocket.send_json({"type": "run", "content": "第二次运行"})
        while websocket.receive_json()["type"] != "run_completed":
            pass

    runs_response = client.get(f"/api/sessions/{session_id}/runs", headers=headers)
    assert runs_response.status_code == 200
    runs = runs_response.json()
    assert [run["snapshot_json"]["config"]["llm"]["model"] for run in runs] == ["first-model", "second-model"]
    assert [run["snapshot_json"]["system_prompt"] for run in runs] == ["第一版 prompt", "第二版 prompt"]
