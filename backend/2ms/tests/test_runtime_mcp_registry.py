from types import SimpleNamespace

from mini_agent.server import runtime


def test_build_profile_bound_mcp_config_returns_named_servers():
    servers = [
        SimpleNamespace(
            name="memory",
            config_json={
                "command": "npx",
                "args": ["-y", "@modelcontextprotocol/server-memory"],
            },
        ),
        SimpleNamespace(
            name="search",
            config_json={
                "url": "https://example.com/mcp",
                "type": "streamable_http",
            },
        ),
    ]

    assert runtime.build_profile_bound_mcp_config(servers) == {
        "mcpServers": {
            "memory": {
                "command": "npx",
                "args": ["-y", "@modelcontextprotocol/server-memory"],
            },
            "search": {
                "url": "https://example.com/mcp",
                "type": "streamable_http",
            },
        }
    }


def test_build_profile_bound_mcp_config_returns_none_for_empty_binding_set():
    assert runtime.build_profile_bound_mcp_config([]) is None
