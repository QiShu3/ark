from mini_agent.server.schemas import ProfileUpdate


def test_profile_update_accepts_mcp_server_ids():
    profile = ProfileUpdate.model_validate({"mcp_server_ids": ["server-1", "server-2"]})

    assert profile.mcp_server_ids == ["server-1", "server-2"]
