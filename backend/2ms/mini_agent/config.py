"""Configuration management module.

Provides unified configuration loading and management functionality.
"""

from pathlib import Path

import yaml
from pydantic import BaseModel, Field


class RetryConfig(BaseModel):
    """Retry configuration"""

    enabled: bool = True
    max_retries: int = 3
    initial_delay: float = 1.0
    max_delay: float = 60.0
    exponential_base: float = 2.0


class LLMConfig(BaseModel):
    """LLM configuration"""

    api_key: str
    api_base: str = "https://api.minimax.io"
    model: str = "MiniMax-M2.5"
    provider: str = "anthropic"  # "anthropic" or "openai"
    retry: RetryConfig = Field(default_factory=RetryConfig)


class AgentConfig(BaseModel):
    """Agent configuration"""

    max_steps: int = 50
    workspace_dir: str = "./workspace"
    system_prompt_path: str = "system_prompt.md"


class MCPConfig(BaseModel):
    """MCP (Model Context Protocol) timeout configuration"""

    connect_timeout: float = 10.0  # Connection timeout (seconds)
    execute_timeout: float = 60.0  # Tool execution timeout (seconds)
    sse_read_timeout: float = 120.0  # SSE read timeout (seconds)


class TTSConfig(BaseModel):
    """TTS configuration."""

    enabled: bool = True
    provider: str = "minimax"
    voice: str = "female-shaonv"
    audio_format: str = "mp3"
    streaming: bool = True
    auto_play: bool = False
    sentence_buffer_chars: int = 120
    edge_rate: str = "+0%"
    minimax_group_id: str = ""
    minimax_model: str = "speech-02-hd"


class ToolsConfig(BaseModel):
    """Tools configuration"""

    # Basic tools (file operations, bash)
    enable_file_tools: bool = True
    enable_bash: bool = True
    enable_note: bool = True

    # Skills
    enable_skills: bool = True
    skills_dir: str = "./skills"
    allowed_skills: list[str] | None = None

    # MCP tools
    enable_mcp: bool = True
    mcp_config_path: str = "mcp.json"
    mcp: MCPConfig = Field(default_factory=MCPConfig)


class Config(BaseModel):
    """Main configuration class"""

    llm: LLMConfig
    agent: AgentConfig
    tools: ToolsConfig
    tts: TTSConfig = Field(default_factory=TTSConfig)

    @classmethod
    def from_dict(cls, data: dict, require_api_key: bool = True) -> "Config":
        """Load configuration from a dictionary.

        Supports both legacy flat yaml shape and nested web profile shape.

        Args:
            data: Configuration dictionary
            require_api_key: Whether to require a valid API key

        Returns:
            Config instance
        """
        if not data:
            raise ValueError("Configuration data is empty")

        # Web profiles use nested config sections. YAML keeps top-level fields.
        llm_source = data.get("llm")
        if isinstance(llm_source, dict):
            llm_data = llm_source
            agent_data = data.get("agent", {})
            tools_data = data.get("tools", {})
            tts_data = data.get("tts", {})
            retry_data = llm_data.get("retry", {})
        else:
            llm_data = data
            agent_data = data
            tools_data = data.get("tools", {})
            tts_data = data.get("tts", {})
            retry_data = data.get("retry", {})

        api_key = llm_data.get("api_key", "")
        if require_api_key:
            if not api_key:
                raise ValueError("Configuration file missing required field: api_key")
            if api_key == "YOUR_API_KEY_HERE":
                raise ValueError("Please configure a valid API Key")

        retry_config = RetryConfig(
            enabled=retry_data.get("enabled", True),
            max_retries=retry_data.get("max_retries", 3),
            initial_delay=retry_data.get("initial_delay", 1.0),
            max_delay=retry_data.get("max_delay", 60.0),
            exponential_base=retry_data.get("exponential_base", 2.0),
        )

        llm_config = LLMConfig(
            api_key=api_key,
            api_base=llm_data.get("api_base", "https://api.minimax.io"),
            model=llm_data.get("model", "MiniMax-M2.5"),
            provider=llm_data.get("provider", "anthropic"),
            retry=retry_config,
        )

        agent_config = AgentConfig(
            max_steps=agent_data.get("max_steps", 50),
            workspace_dir=agent_data.get("workspace_dir", "./workspace"),
            system_prompt_path=agent_data.get("system_prompt_path", "system_prompt.md"),
        )

        mcp_data = tools_data.get("mcp", {})
        mcp_config = MCPConfig(
            connect_timeout=mcp_data.get("connect_timeout", 10.0),
            execute_timeout=mcp_data.get("execute_timeout", 60.0),
            sse_read_timeout=mcp_data.get("sse_read_timeout", 120.0),
        )

        tools_config = ToolsConfig(
            enable_file_tools=tools_data.get("enable_file_tools", True),
            enable_bash=tools_data.get("enable_bash", True),
            enable_note=tools_data.get("enable_note", True),
            enable_skills=tools_data.get("enable_skills", True),
            skills_dir=tools_data.get("skills_dir", "./skills"),
            allowed_skills=tools_data.get("allowed_skills"),
            enable_mcp=tools_data.get("enable_mcp", True),
            mcp_config_path=tools_data.get("mcp_config_path", "mcp.json"),
            mcp=mcp_config,
        )

        tts_config = TTSConfig(
            enabled=tts_data.get("enabled", True),
            provider=tts_data.get("provider", "minimax"),
            voice=tts_data.get("voice", "female-shaonv"),
            audio_format=tts_data.get("audio_format", "mp3"),
            streaming=tts_data.get("streaming", True),
            auto_play=tts_data.get("auto_play", False),
            sentence_buffer_chars=tts_data.get("sentence_buffer_chars", 120),
            edge_rate=tts_data.get("edge_rate", "+0%"),
            minimax_group_id=tts_data.get("minimax_group_id", ""),
            minimax_model=tts_data.get("minimax_model", "speech-02-hd"),
        )

        return cls(
            llm=llm_config,
            agent=agent_config,
            tools=tools_config,
            tts=tts_config,
        )

    def to_dict(self) -> dict:
        """Convert config to nested dictionary shape."""
        return {
            "llm": {
                "api_key": self.llm.api_key,
                "api_base": self.llm.api_base,
                "model": self.llm.model,
                "provider": self.llm.provider,
                "retry": {
                    "enabled": self.llm.retry.enabled,
                    "max_retries": self.llm.retry.max_retries,
                    "initial_delay": self.llm.retry.initial_delay,
                    "max_delay": self.llm.retry.max_delay,
                    "exponential_base": self.llm.retry.exponential_base,
                },
            },
            "agent": {
                "max_steps": self.agent.max_steps,
                "workspace_dir": self.agent.workspace_dir,
                "system_prompt_path": self.agent.system_prompt_path,
            },
            "tools": {
                "enable_file_tools": self.tools.enable_file_tools,
                "enable_bash": self.tools.enable_bash,
                "enable_note": self.tools.enable_note,
                "enable_skills": self.tools.enable_skills,
                "skills_dir": self.tools.skills_dir,
                "allowed_skills": self.tools.allowed_skills,
                "enable_mcp": self.tools.enable_mcp,
                "mcp_config_path": self.tools.mcp_config_path,
                "mcp": {
                    "connect_timeout": self.tools.mcp.connect_timeout,
                    "execute_timeout": self.tools.mcp.execute_timeout,
                    "sse_read_timeout": self.tools.mcp.sse_read_timeout,
                },
            },
            "tts": {
                "enabled": self.tts.enabled,
                "provider": self.tts.provider,
                "voice": self.tts.voice,
                "audio_format": self.tts.audio_format,
                "streaming": self.tts.streaming,
                "auto_play": self.tts.auto_play,
                "sentence_buffer_chars": self.tts.sentence_buffer_chars,
                "edge_rate": self.tts.edge_rate,
                "minimax_group_id": self.tts.minimax_group_id,
                "minimax_model": self.tts.minimax_model,
            },
        }

    @classmethod
    def load(cls) -> "Config":
        """Load configuration from the default search path."""
        config_path = cls.get_default_config_path()
        if not config_path.exists():
            raise FileNotFoundError(
                "Configuration file not found. Place config.yaml in mini_agent/app_state/config/ or mini_agent/config/."
            )
        return cls.from_yaml(config_path)

    @classmethod
    def from_yaml(cls, config_path: str | Path) -> "Config":
        """Load configuration from YAML file

        Args:
            config_path: Configuration file path

        Returns:
            Config instance

        Raises:
            FileNotFoundError: Configuration file does not exist
            ValueError: Invalid configuration format or missing required fields
        """
        config_path = Path(config_path)

        if not config_path.exists():
            raise FileNotFoundError(f"Configuration file does not exist: {config_path}")

        with open(config_path, encoding="utf-8") as f:
            data = yaml.safe_load(f)
        return cls.from_dict(data)

    @staticmethod
    def get_package_dir() -> Path:
        """Get the package installation directory.

        Returns:
            Path to the mini_agent package directory
        """
        return Path(__file__).parent

    @classmethod
    def get_app_state_dir(cls, create: bool = False) -> Path:
        """Get the package-local app state directory."""
        app_state_dir = cls.get_package_dir() / "app_state"
        if create:
            app_state_dir.mkdir(parents=True, exist_ok=True)
        return app_state_dir

    @classmethod
    def get_app_state_config_dir(cls, create: bool = False) -> Path:
        """Get the package-local app state config directory."""
        config_dir = cls.get_app_state_dir(create=create) / "config"
        if create:
            config_dir.mkdir(parents=True, exist_ok=True)
        return config_dir

    @classmethod
    def get_app_state_log_dir(cls, create: bool = False) -> Path:
        """Get the package-local app state log directory."""
        log_dir = cls.get_app_state_dir(create=create) / "log"
        if create:
            log_dir.mkdir(parents=True, exist_ok=True)
        return log_dir

    @classmethod
    def find_config_file(cls, filename: str) -> Path | None:
        """Find configuration file with priority order.

        Search for config file in the following order:
        1) mini_agent/app_state/config/{filename}
        2) mini_agent/config/{filename}

        Args:
            filename: Configuration file name (e.g., "config.yaml", "mcp.json", "system_prompt.md")

        Returns:
            Path to found config file, or None if not found
        """
        app_state_config = cls.get_app_state_config_dir() / filename
        if app_state_config.exists():
            return app_state_config

        package_config = cls.get_package_dir() / "config" / filename
        if package_config.exists():
            return package_config

        return None

    @classmethod
    def get_default_config_path(cls) -> Path:
        """Get the default config file path with priority search.

        Returns:
            Path to config.yaml (prioritizes: app_state config/ > package config/)
        """
        config_path = cls.find_config_file("config.yaml")
        if config_path:
            return config_path

        return cls.get_package_dir() / "config" / "config.yaml"
