"""图形验证码服务

使用 captcha 库生成图片验证码，答案存储在内存中（带过期时间）。
对于当前项目规模，内存存储足够；如需分布式部署可替换为 Redis。
"""

import io
import secrets
import threading
import time
from typing import Optional

from captcha.image import ImageCaptcha

# 验证码字符集：去掉容易混淆的 0/O/1/l
CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 4
TTL_SECONDS = 300  # 5 分钟过期

# 内存存储: {captcha_id: (code, expire_at)}
_store: dict[str, tuple[str, float]] = {}
_lock = threading.Lock()

_image_gen = ImageCaptcha(
    width=120,
    height=40,
    font_sizes=[28, 32, 36],
)


def generate_captcha() -> tuple[str, bytes]:
    """生成验证码，返回 (captcha_id, image_bytes)"""
    code = "".join(secrets.choice(CHARSET) for _ in range(CODE_LENGTH))
    captcha_id = secrets.token_urlsafe(16)
    expire_at = time.time() + TTL_SECONDS

    with _lock:
        _store[captcha_id] = (code, expire_at)
        _cleanup_expired_locked()

    image_bytes = _image_gen.generate(code).getvalue()
    return captcha_id, image_bytes


def verify_captcha(captcha_id: str, user_input: str, *, consume: bool = True) -> bool:
    """校验验证码。

    Args:
        captcha_id: 验证码 ID
        user_input: 用户输入（不区分大小写）
        consume: 校验通过后是否立即删除（一次性使用）

    Returns:
        是否校验通过
    """
    if not captcha_id or not user_input:
        return False

    with _lock:
        entry = _store.get(captcha_id)
        if not entry:
            return False

        code, expire_at = entry
        if time.time() > expire_at:
            _store.pop(captcha_id, None)
            return False

        ok = user_input.strip().upper() == code.upper()
        if ok and consume:
            _store.pop(captcha_id, None)

        _cleanup_expired_locked()
        return ok


def _cleanup_expired_locked() -> None:
    """清理过期验证码（调用方需持有 _lock）。
    每 100 次调用才清理一次，避免频繁遍历。
    """
    _cleanup_expired_locked.counter = getattr(_cleanup_expired_locked, "counter", 0) + 1  # type: ignore[attr-defined]
    if _cleanup_expired_locked.counter < 100:  # type: ignore[attr-defined]
        return
    _cleanup_expired_locked.counter = 0  # type: ignore[attr-defined]

    now = time.time()
    expired = [cid for cid, (_, exp) in _store.items() if now > exp]
    for cid in expired:
        _store.pop(cid, None)


# ── 登录失败计数（用于触发验证码） ────────────────────────────────────────────

LOGIN_FAIL_THRESHOLD = 3  # 同一 IP 失败 N 次后需要验证码
LOGIN_FAIL_WINDOW = 600  # 时间窗口：10 分钟

# {ip: (fail_count, window_start)}
_login_fail: dict[str, tuple[int, float]] = {}


def record_login_failure(ip: str) -> int:
    """记录一次登录失败，返回当前连续失败次数。"""
    now = time.time()
    with _lock:
        entry = _login_fail.get(ip)
        if entry and now - entry[1] < LOGIN_FAIL_WINDOW:
            count = entry[0] + 1
        else:
            count = 1
        _login_fail[ip] = (count, now)
        return count


def reset_login_failures(ip: str) -> None:
    """登录成功后重置失败计数。"""
    with _lock:
        _login_fail.pop(ip, None)


def needs_captcha(ip: str) -> bool:
    """判断该 IP 是否需要输入验证码。"""
    with _lock:
        entry = _login_fail.get(ip)
        if not entry:
            return False
        count, window_start = entry
        if time.time() - window_start > LOGIN_FAIL_WINDOW:
            _login_fail.pop(ip, None)
            return False
        return count >= LOGIN_FAIL_THRESHOLD
