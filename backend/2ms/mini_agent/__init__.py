"""Mini Agent - Minimal single agent with basic tools and MCP support."""

from .schema import FunctionCall, LLMProvider, LLMResponse, LLMStreamEvent, Message, ToolCall

__version__ = "0.1.0"

__all__ = [
    "Agent",
    "LLMClient",
    "LLMProvider",
    "Message",
    "LLMResponse",
    "LLMStreamEvent",
    "ToolCall",
    "FunctionCall",
]


def __getattr__(name: str):
    if name == "Agent":
        from .agent import Agent

        return Agent
    if name == "LLMClient":
        from .llm import LLMClient

        return LLMClient
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
