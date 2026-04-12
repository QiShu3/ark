"""Tests for package-local agent logging."""

from mini_agent.config import Config
from mini_agent.logger import AgentLogger


def test_agent_logger_writes_under_app_state_log_dir(tmp_path, monkeypatch):
    package_dir = tmp_path / "mini_agent"
    package_dir.mkdir(parents=True)

    monkeypatch.setattr(Config, "get_package_dir", staticmethod(lambda: package_dir))

    logger = AgentLogger()
    logger.start_new_run()

    log_path = logger.get_log_file_path()
    assert log_path is not None
    assert log_path.parent == package_dir / "app_state" / "log"
    assert log_path.exists()
