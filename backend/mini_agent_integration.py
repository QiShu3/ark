from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

_BACKEND_DIR = Path(__file__).resolve().parent
_MINI_AGENT_ROOT = _BACKEND_DIR / "2ms"
_MINI_AGENT_WEB_DIR = _MINI_AGENT_ROOT / "mini_agent" / "server" / "web"


def _ensure_mini_agent_import_path() -> None:
    if not _MINI_AGENT_ROOT.exists():
        raise RuntimeError(f"Mini Agent source not found: {_MINI_AGENT_ROOT}")

    root = str(_MINI_AGENT_ROOT)
    if root not in sys.path:
        sys.path.insert(0, root)


def _has_route_path(app: FastAPI, path: str) -> bool:
    return any(getattr(route, "path", None) == path for route in app.routes)


def _asset_version(path: Path) -> str:
    try:
        return str(int(path.stat().st_mtime))
    except FileNotFoundError:
        return "0"


async def init_mini_agent(app: Any) -> None:
    _ensure_mini_agent_import_path()

    from mini_agent.server.repository import ensure_agent_schema, get_pool_from_app

    pool = get_pool_from_app(app)
    async with pool.acquire() as conn:
        await conn.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
        await ensure_agent_schema(conn)


def register_mini_agent(app: FastAPI) -> None:
    _ensure_mini_agent_import_path()

    from mini_agent.server.routers import profiles, sessions

    if not _has_route_path(app, "/api/profiles"):
        app.include_router(profiles.router, prefix="/api")
    if not _has_route_path(app, "/api/sessions"):
        app.include_router(sessions.router, prefix="/api")

    if not _MINI_AGENT_WEB_DIR.exists():
        return

    if not _has_route_path(app, "/static"):
        app.mount("/static", StaticFiles(directory=str(_MINI_AGENT_WEB_DIR)), name="mini-agent-static")

    if _has_route_path(app, "/web"):
        return

    async def serve_web() -> HTMLResponse:
        index_path = _MINI_AGENT_WEB_DIR / "index.html"
        if not index_path.exists():
            return HTMLResponse("<h1>Web interface not found</h1>", status_code=404)

        html = index_path.read_text(encoding="utf-8")
        app_js = f"/static/app.js?v={_asset_version(_MINI_AGENT_WEB_DIR / 'app.js')}"
        styles_css = f"/static/styles.css?v={_asset_version(_MINI_AGENT_WEB_DIR / 'styles.css')}"
        html = html.replace("/static/app.js", app_js)
        html = html.replace("/static/styles.css", styles_css)
        return HTMLResponse(html)

    app.add_api_route("/web", serve_web, methods=["GET"], response_class=HTMLResponse, name="mini-agent-web")


__all__ = ["init_mini_agent", "register_mini_agent"]
