from __future__ import annotations

import json

import httpx

from routes import auth_routes


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
