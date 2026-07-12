from __future__ import annotations

import json
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from uuid import uuid4

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routes import auth_routes


class _GuestSetupTransaction(AbstractAsyncContextManager[None]):
    async def __aenter__(self) -> None:
        return None

    async def __aexit__(self, exc_type, exc_value, traceback) -> None:
        return None


class _GuestSetupAcquire(AbstractAsyncContextManager["_GuestSetupConn"]):
    def __init__(self, conn: _GuestSetupConn) -> None:
        self._conn = conn

    async def __aenter__(self) -> _GuestSetupConn:
        return self._conn

    async def __aexit__(self, exc_type, exc_value, traceback) -> None:
        return None


class _GuestSetupConn:
    def __init__(self) -> None:
        self.events: list[dict[str, object]] = []
        self.configs: list[dict[str, object]] = []
        self.presets: list[dict[str, object]] = []
        self.sub_apps: list[dict[str, object]] = []

    def transaction(self) -> _GuestSetupTransaction:
        return _GuestSetupTransaction()

    async def fetchrow(self, sql: str, *args: object) -> dict[str, object] | None:
        if "FROM events" in sql:
            return self.events[0] if self.events else None
        if "INSERT INTO events" in sql:
            event = {"id": uuid4()}
            self.events.append(event)
            return event
        if "FROM deliberate_workflow_configs" in sql:
            app_id = args[1]
            return next((item for item in self.configs if item["app_id"] == app_id), None)
        if "INSERT INTO deliberate_workflow_configs" in sql:
            config = {"id": str(uuid4()), "app_id": args[3], "event_id": args[4]}
            self.configs.append(config)
            return config
        if "FROM focus_workflow_presets" in sql:
            app_id = args[1]
            return next((item for item in self.presets if item["app_id"] == app_id), None)
        return None

    async def execute(self, sql: str, *args: object) -> str:
        if "INSERT INTO deliberate_sub_apps" in sql:
            self.sub_apps.append({"id": args[0], "event_id": args[7]})
        if "UPDATE deliberate_workflow_configs SET event_id" in sql:
            for config in self.configs:
                config["event_id"] = args[2]
        if "INSERT INTO focus_workflow_presets" in sql:
            self.presets.append({"id": uuid4(), "app_id": args[1], "event_id": args[2]})
        if "UPDATE focus_workflow_presets" in sql:
            for preset in self.presets:
                preset["event_id"] = args[0]
        return "OK"


@dataclass
class _GuestSetupPool:
    conn: _GuestSetupConn

    def acquire(self) -> _GuestSetupAcquire:
        return _GuestSetupAcquire(self.conn)


def test_send_tencent_template_email_uses_guangzhou_ses_config(monkeypatch) -> None:
    calls: list[dict[str, object]] = []

    def fake_post(url: str, *, content: bytes, headers: dict[str, str], timeout: float) -> httpx.Response:
        calls.append(
            {
                "url": url,
                "content": content,
                "headers": headers,
                "timeout": timeout,
            }
        )
        return httpx.Response(200, json={"Response": {"MessageId": "msg-1", "RequestId": "req-1"}})

    monkeypatch.setenv("TENCENTCLOUD_SECRET_ID", "test-secret-id")
    monkeypatch.setenv("TENCENTCLOUD_SECRET_KEY", "test-secret-key")
    monkeypatch.setenv("TENCENT_SES_REGION", "ap-guangzhou")
    monkeypatch.setenv("TENCENT_SES_FROM_EMAIL", "ark@strangetalking.xin")
    monkeypatch.setattr(auth_routes.httpx, "post", fake_post)

    auth_routes._send_tencent_template_email(
        to_email="user@example.com",
        subject="验证你的 Ark 邮箱",
        template_id="48702",
        template_data={"verify_code": "123456"},
    )

    assert len(calls) == 1
    call = calls[0]
    assert call["url"] == "https://ses.tencentcloudapi.com"
    headers = call["headers"]
    assert isinstance(headers, dict)
    assert headers["X-TC-Action"] == "SendEmail"
    assert headers["X-TC-Region"] == "ap-guangzhou"
    assert headers["X-TC-Version"] == "2020-10-02"
    assert headers["Authorization"].startswith("TC3-HMAC-SHA256 Credential=test-secret-id/")

    payload = json.loads(bytes(call["content"]).decode("utf-8"))
    assert payload["FromEmailAddress"] == "ark@strangetalking.xin"
    assert payload["Destination"] == ["user@example.com"]
    assert payload["Subject"] == "验证你的 Ark 邮箱"
    assert payload["Template"]["TemplateID"] == 48702
    assert json.loads(payload["Template"]["TemplateData"]) == {"verify_code": "123456"}


def test_auth_email_log_mode_does_not_call_tencent(monkeypatch, capsys) -> None:
    def fail_post(*args, **kwargs):  # noqa: ANN002, ANN003
        raise AssertionError("httpx.post should not be called in log mode")

    monkeypatch.setenv("AUTH_EMAIL_DELIVERY_MODE", "log")
    monkeypatch.setenv("TENCENT_SES_VERIFY_TEMPLATE_ID", "48702")
    monkeypatch.setattr(auth_routes.httpx, "post", fail_post)

    auth_routes._send_auth_email(to_email="user@example.com", purpose="email_verify", token="123456")

    out = capsys.readouterr().out
    assert "user@example.com" in out
    assert "48702" in out
    assert "verify_code" in out


def test_guest_event_setup_is_idempotent(monkeypatch) -> None:
    conn = _GuestSetupConn()
    pool = _GuestSetupPool(conn)
    guest = auth_routes._AuthUser(
        id=42,
        username="guest_test",
        email=None,
        email_verified_at=None,
        is_active=True,
        is_admin=False,
        is_guest=True,
    )
    app = FastAPI()
    app.include_router(auth_routes.router)
    app.state.auth_pool = pool
    app.dependency_overrides[auth_routes.get_current_user] = lambda: guest
    client = TestClient(app)

    first = client.post("/auth/guest/setup-event", json={"event_type": "kaoyan", "major": "22408"})
    second = client.post("/auth/guest/setup-event", json={"event_type": "kaoyan", "major": "22408"})

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["event_id"] == first.json()["event_id"]
    assert len(conn.events) == 1
    assert len(conn.configs) == 1
    assert len(conn.presets) == 1
    assert first.json()["app_ids"] == ["guest-408-42"]
    event_id = first.json()["event_id"]
    assert {str(app["event_id"]) for app in conn.sub_apps} == {event_id}
    assert {str(config["event_id"]) for config in conn.configs} == {event_id}
    assert {str(preset["event_id"]) for preset in conn.presets} == {event_id}
