"""Lightweight smoke tests for the Web app surface."""

from fastapi.routing import APIRoute, APIWebSocketRoute
from mini_agent.server.main import app


def test_web_http_routes_remain_registered():
    http_paths = {route.path for route in app.routes if isinstance(route, APIRoute)}

    assert "/" in http_paths
    assert "/health" in http_paths
    assert "/web" in http_paths
    assert "/api/profiles" in http_paths
    assert "/api/pages/{profile_key}/session" in http_paths
    assert "/api/sessions" in http_paths


def test_websocket_route_remains_registered():
    websocket_paths = {route.path for route in app.routes if isinstance(route, APIWebSocketRoute)}

    assert "/api/sessions/ws/{session_id}" in websocket_paths
