"""Anthropic LLM client implementation."""

import json
import logging
from collections.abc import AsyncIterator
from typing import Any

import anthropic

from ..retry import RetryConfig, async_retry
from ..schema import FunctionCall, LLMResponse, LLMStreamEvent, Message, TokenUsage, ToolCall
from .base import LLMClientBase

logger = logging.getLogger(__name__)


class AnthropicClient(LLMClientBase):
    """LLM client using Anthropic's protocol.

    This client uses the official Anthropic SDK and supports:
    - Extended thinking content
    - Tool calling
    - Retry logic
    """

    def __init__(
        self,
        api_key: str,
        api_base: str = "https://api.minimaxi.com/anthropic",
        model: str = "MiniMax-M2.5",
        retry_config: RetryConfig | None = None,
    ):
        """Initialize Anthropic client.

        Args:
            api_key: API key for authentication
            api_base: Base URL for the API (default: MiniMax Anthropic endpoint)
            model: Model name to use (default: MiniMax-M2.5)
            retry_config: Optional retry configuration
        """
        super().__init__(api_key, api_base, model, retry_config)

        # Initialize Anthropic async client
        self.client = anthropic.AsyncAnthropic(
            base_url=api_base,
            api_key=api_key,
            default_headers={"Authorization": f"Bearer {api_key}"},
        )

    async def _make_api_request(
        self,
        system_message: str | None,
        api_messages: list[dict[str, Any]],
        tools: list[Any] | None = None,
        stream: bool = False,
    ) -> anthropic.types.Message | Any:
        """Execute API request (core method that can be retried).

        Args:
            system_message: Optional system message
            api_messages: List of messages in Anthropic format
            tools: Optional list of tools

        Returns:
            Anthropic Message response

        Raises:
            Exception: API call failed
        """
        params = {
            "model": self.model,
            "max_tokens": 16384,
            "messages": api_messages,
        }

        if system_message:
            params["system"] = system_message

        if tools:
            params["tools"] = self._convert_tools(tools)

        if stream:
            params["stream"] = True

        # Use Anthropic SDK's async messages.create
        response = await self.client.messages.create(**params)
        return response

    def _convert_usage(self, usage: Any) -> TokenUsage | None:
        """Convert Anthropic usage payload into the internal usage model."""
        if not usage:
            return None

        input_tokens = getattr(usage, "input_tokens", 0) or 0
        output_tokens = getattr(usage, "output_tokens", 0) or 0
        cache_read_tokens = getattr(usage, "cache_read_input_tokens", 0) or 0
        cache_creation_tokens = getattr(usage, "cache_creation_input_tokens", 0) or 0
        total_input_tokens = input_tokens + cache_read_tokens + cache_creation_tokens
        return TokenUsage(
            prompt_tokens=total_input_tokens,
            completion_tokens=output_tokens,
            total_tokens=total_input_tokens + output_tokens,
        )

    def _convert_tools(self, tools: list[Any]) -> list[dict[str, Any]]:
        """Convert tools to Anthropic format.

        Anthropic tool format:
        {
            "name": "tool_name",
            "description": "Tool description",
            "input_schema": {
                "type": "object",
                "properties": {...},
                "required": [...]
            }
        }

        Args:
            tools: List of Tool objects or dicts

        Returns:
            List of tools in Anthropic dict format
        """
        result = []
        for tool in tools:
            if isinstance(tool, dict):
                result.append(tool)
            elif hasattr(tool, "to_schema"):
                # Tool object with to_schema method
                result.append(tool.to_schema())
            else:
                raise TypeError(f"Unsupported tool type: {type(tool)}")
        return result

    def _convert_messages(self, messages: list[Message]) -> tuple[str | None, list[dict[str, Any]]]:
        """Convert internal messages to Anthropic format.

        Args:
            messages: List of internal Message objects

        Returns:
            Tuple of (system_message, api_messages)
        """
        system_message = None
        api_messages = []

        for msg in messages:
            if msg.role == "system":
                system_message = msg.content
                continue

            # For user and assistant messages
            if msg.role in ["user", "assistant"]:
                # Handle assistant messages with thinking or tool calls
                if msg.role == "assistant" and (msg.thinking or msg.tool_calls):
                    # Build content blocks for assistant with thinking and/or tool calls
                    content_blocks = []

                    # Add thinking block if present
                    if msg.thinking:
                        content_blocks.append({"type": "thinking", "thinking": msg.thinking})

                    # Add text content if present
                    if msg.content:
                        content_blocks.append({"type": "text", "text": msg.content})

                    # Add tool use blocks
                    if msg.tool_calls:
                        for tool_call in msg.tool_calls:
                            content_blocks.append(
                                {
                                    "type": "tool_use",
                                    "id": tool_call.id,
                                    "name": tool_call.function.name,
                                    "input": tool_call.function.arguments,
                                }
                            )

                    api_messages.append({"role": "assistant", "content": content_blocks})
                else:
                    api_messages.append({"role": msg.role, "content": msg.content})

            # For tool result messages
            elif msg.role == "tool":
                # Anthropic uses user role with tool_result content blocks
                api_messages.append(
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "tool_result",
                                "tool_use_id": msg.tool_call_id,
                                "content": msg.content,
                            }
                        ],
                    }
                )

        return system_message, api_messages

    def _prepare_request(
        self,
        messages: list[Message],
        tools: list[Any] | None = None,
    ) -> dict[str, Any]:
        """Prepare the request for Anthropic API.

        Args:
            messages: List of conversation messages
            tools: Optional list of available tools

        Returns:
            Dictionary containing request parameters
        """
        system_message, api_messages = self._convert_messages(messages)

        return {
            "system_message": system_message,
            "api_messages": api_messages,
            "tools": tools,
        }

    def _parse_response(self, response: anthropic.types.Message) -> LLMResponse:
        """Parse Anthropic response into LLMResponse.

        Args:
            response: Anthropic Message response

        Returns:
            LLMResponse object
        """
        # Extract text content, thinking, and tool calls
        text_content = ""
        thinking_content = ""
        tool_calls = []

        for block in response.content or []:
            if block.type == "text":
                text_content += block.text
            elif block.type == "thinking":
                thinking_content += block.thinking
            elif block.type == "tool_use":
                # Parse Anthropic tool_use block
                tool_calls.append(
                    ToolCall(
                        id=block.id,
                        type="function",
                        function=FunctionCall(
                            name=block.name,
                            arguments=block.input,
                        ),
                    )
                )

        # Extract token usage from response
        # Anthropic usage includes: input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens
        usage = self._convert_usage(getattr(response, "usage", None))

        return LLMResponse(
            content=text_content,
            thinking=thinking_content if thinking_content else None,
            tool_calls=tool_calls if tool_calls else None,
            finish_reason=response.stop_reason or "stop",
            usage=usage,
        )

    async def generate(
        self,
        messages: list[Message],
        tools: list[Any] | None = None,
    ) -> LLMResponse:
        """Generate response from Anthropic LLM."""
        return await super().generate(messages, tools)

    async def stream_generate(
        self,
        messages: list[Message],
        tools: list[Any] | None = None,
    ) -> AsyncIterator[LLMStreamEvent]:
        """Stream Anthropic response events."""
        request_params = self._prepare_request(messages, tools)

        if self.retry_config.enabled:
            retry_decorator = async_retry(config=self.retry_config, on_retry=self.retry_callback)
            api_call = retry_decorator(self._make_api_request)
            stream = await api_call(
                request_params["system_message"],
                request_params["api_messages"],
                request_params["tools"],
                True,
            )
        else:
            stream = await self._make_api_request(
                request_params["system_message"],
                request_params["api_messages"],
                request_params["tools"],
                True,
            )

        usage = None
        finish_reason = "stop"
        tool_use_blocks: dict[int, dict[str, Any]] = {}

        async for event in stream:
            if event.type == "message_start":
                usage = self._convert_usage(getattr(event.message, "usage", None))
            elif event.type == "content_block_start":
                block = event.content_block
                if getattr(block, "type", None) == "tool_use":
                    tool_use_blocks[event.index] = {
                        "id": getattr(block, "id", f"tool_{event.index}"),
                        "name": getattr(block, "name", ""),
                        "arguments": getattr(block, "input", {}) or {},
                        "partial_json": "",
                    }
            elif event.type == "content_block_delta":
                delta = event.delta
                delta_type = getattr(delta, "type", None)
                if delta_type == "thinking_delta":
                    yield LLMStreamEvent(type="thinking_delta", delta=delta.thinking)
                elif delta_type == "text_delta":
                    yield LLMStreamEvent(type="content_delta", delta=delta.text)
                elif delta_type == "input_json_delta":
                    block = tool_use_blocks.setdefault(
                        event.index,
                        {
                            "id": f"tool_{event.index}",
                            "name": "",
                            "arguments": {},
                            "partial_json": "",
                        },
                    )
                    block["partial_json"] += delta.partial_json
            elif event.type == "content_block_stop":
                block = tool_use_blocks.pop(event.index, None)
                if block is not None:
                    arguments = block["arguments"]
                    if block["partial_json"]:
                        arguments = json.loads(block["partial_json"])
                    yield LLMStreamEvent(
                        type="tool_call",
                        tool_call=ToolCall(
                            id=block["id"],
                            type="function",
                            function=FunctionCall(name=block["name"], arguments=arguments),
                        ),
                    )
            elif event.type == "message_delta":
                finish_reason = getattr(event.delta, "stop_reason", None) or finish_reason
                usage = self._convert_usage(getattr(event, "usage", None)) or usage

        yield LLMStreamEvent(type="done", finish_reason=finish_reason, usage=usage)
