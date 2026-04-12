"""LLM clients package supporting both Anthropic and OpenAI protocols."""

from .base import LLMClientBase
from .llm_wrapper import LLMClient

__all__ = ["LLMClientBase", "AnthropicClient", "OpenAIClient", "LLMClient"]


def __getattr__(name: str):
    if name == "AnthropicClient":
        from .anthropic_client import AnthropicClient

        return AnthropicClient
    if name == "OpenAIClient":
        from .openai_client import OpenAIClient

        return OpenAIClient
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
