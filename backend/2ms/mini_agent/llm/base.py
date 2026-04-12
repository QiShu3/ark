"""Base class for LLM clients."""

from abc import ABC, abstractmethod
from typing import Any, AsyncIterator

from ..retry import RetryConfig
from ..schema import LLMResponse, LLMStreamEvent, Message


class LLMClientBase(ABC):
    """Abstract base class for LLM clients.

    This class defines the interface that all LLM clients must implement,
    regardless of the underlying API protocol (Anthropic, OpenAI, etc.).
    """

    def __init__(
        self,
        api_key: str,
        api_base: str,
        model: str,
        retry_config: RetryConfig | None = None,
    ):
        """Initialize the LLM client.

        Args:
            api_key: API key for authentication
            api_base: Base URL for the API
            model: Model name to use
            retry_config: Optional retry configuration
        """
        self.api_key = api_key
        self.api_base = api_base
        self.model = model
        self.retry_config = retry_config or RetryConfig()

        # Callback for tracking retry count
        self.retry_callback = None

    async def generate(
        self,
        messages: list[Message],
        tools: list[Any] | None = None,
    ) -> LLMResponse:
        """Generate response from LLM.

        Args:
            messages: List of conversation messages
            tools: Optional list of Tool objects or dicts

        Returns:
            LLMResponse containing the generated content, thinking, and tool calls
        """
        content_chunks: list[str] = []
        thinking_chunks: list[str] = []
        tool_calls = []
        finish_reason = "stop"
        usage = None

        async for event in self.stream_generate(messages, tools):
            if event.type == "thinking_delta" and event.delta:
                thinking_chunks.append(event.delta)
            elif event.type == "content_delta" and event.delta:
                content_chunks.append(event.delta)
            elif event.type == "tool_call" and event.tool_call:
                tool_calls.append(event.tool_call)
            elif event.type == "done":
                if event.finish_reason:
                    finish_reason = event.finish_reason
                if event.usage:
                    usage = event.usage
            elif event.type == "error":
                raise RuntimeError(event.error or "Streaming LLM request failed.")

        return LLMResponse(
            content="".join(content_chunks),
            thinking="".join(thinking_chunks) or None,
            tool_calls=tool_calls or None,
            finish_reason=finish_reason,
            usage=usage,
        )

    @abstractmethod
    async def stream_generate(
        self,
        messages: list[Message],
        tools: list[Any] | None = None,
    ) -> AsyncIterator[LLMStreamEvent]:
        """Stream incremental response events from the LLM."""
        yield  # pragma: no cover

    @abstractmethod
    def _prepare_request(
        self,
        messages: list[Message],
        tools: list[Any] | None = None,
    ) -> dict[str, Any]:
        """Prepare the request payload for the API.

        Args:
            messages: List of conversation messages
            tools: Optional list of available tools

        Returns:
            Dictionary containing the request payload
        """
        pass

    @abstractmethod
    def _convert_messages(self, messages: list[Message]) -> tuple[str | None, list[dict[str, Any]]]:
        """Convert internal message format to API-specific format.

        Args:
            messages: List of internal Message objects

        Returns:
            Tuple of (system_message, api_messages)
        """
        pass
