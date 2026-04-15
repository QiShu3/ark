"""OpenAI LLM client implementation."""

import json
import logging
from collections.abc import AsyncIterator
from typing import Any

from openai import AsyncOpenAI

from ..retry import RetryConfig, async_retry
from ..schema import FunctionCall, LLMResponse, LLMStreamEvent, Message, TokenUsage, ToolCall
from .base import LLMClientBase

logger = logging.getLogger(__name__)


class OpenAIClient(LLMClientBase):
    """LLM client using OpenAI's protocol.

    This client uses the official OpenAI SDK and supports:
    - Reasoning content (via reasoning_split=True)
    - Tool calling
    - Retry logic
    """

    def __init__(
        self,
        api_key: str,
        api_base: str = "https://api.minimaxi.com/v1",
        model: str = "MiniMax-M2.5",
        retry_config: RetryConfig | None = None,
    ):
        """Initialize OpenAI client.

        Args:
            api_key: API key for authentication
            api_base: Base URL for the API (default: MiniMax OpenAI endpoint)
            model: Model name to use (default: MiniMax-M2.5)
            retry_config: Optional retry configuration
        """
        super().__init__(api_key, api_base, model, retry_config)

        # Initialize OpenAI client
        self.client = AsyncOpenAI(
            api_key=api_key,
            base_url=api_base,
        )

    async def _make_api_request(
        self,
        api_messages: list[dict[str, Any]],
        tools: list[Any] | None = None,
        stream: bool = False,
    ) -> Any:
        """Execute API request (core method that can be retried).

        Args:
            api_messages: List of messages in OpenAI format
            tools: Optional list of tools

        Returns:
            OpenAI ChatCompletion response (full response including usage)

        Raises:
            Exception: API call failed
        """
        params = {
            "model": self.model,
            "messages": api_messages,
            # Enable reasoning_split to separate thinking content
            "extra_body": {"reasoning_split": True},
        }

        if tools:
            params["tools"] = self._convert_tools(tools)

        if stream:
            params["stream"] = True
            params["stream_options"] = {"include_usage": True}

        # Use OpenAI SDK's chat.completions.create
        response = await self.client.chat.completions.create(**params)
        # Return full response to access usage info
        return response

    def _convert_usage(self, usage: Any) -> TokenUsage | None:
        """Convert OpenAI usage payload into the internal usage model."""
        if not usage:
            return None
        return TokenUsage(
            prompt_tokens=getattr(usage, "prompt_tokens", 0) or 0,
            completion_tokens=getattr(usage, "completion_tokens", 0) or 0,
            total_tokens=getattr(usage, "total_tokens", 0) or 0,
        )

    def _extract_reasoning_delta(self, delta: Any) -> str:
        """Extract reasoning text from streamed OpenAI chunks when available."""
        reasoning_parts: list[str] = []

        if hasattr(delta, "reasoning_content") and getattr(delta, "reasoning_content"):
            reasoning_parts.append(getattr(delta, "reasoning_content"))

        extras = getattr(delta, "model_extra", None) or {}
        for key in ("reasoning_content", "reasoning", "thinking"):
            value = extras.get(key)
            if isinstance(value, str) and value:
                reasoning_parts.append(value)
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, str):
                        reasoning_parts.append(item)
                    elif isinstance(item, dict):
                        text = item.get("text") or item.get("content")
                        if text:
                            reasoning_parts.append(text)

        return "".join(reasoning_parts)

    def _convert_tools(self, tools: list[Any]) -> list[dict[str, Any]]:
        """Convert tools to OpenAI format.

        Args:
            tools: List of Tool objects or dicts

        Returns:
            List of tools in OpenAI dict format
        """
        result = []
        for tool in tools:
            if isinstance(tool, dict):
                # If already a dict, check if it's in OpenAI format
                if "type" in tool and tool["type"] == "function":
                    result.append(tool)
                else:
                    # Assume it's in Anthropic format, convert to OpenAI
                    result.append(
                        {
                            "type": "function",
                            "function": {
                                "name": tool["name"],
                                "description": tool["description"],
                                "parameters": tool["input_schema"],
                            },
                        }
                    )
            elif hasattr(tool, "to_openai_schema"):
                # Tool object with to_openai_schema method
                result.append(tool.to_openai_schema())
            else:
                raise TypeError(f"Unsupported tool type: {type(tool)}")
        return result

    def _convert_messages(self, messages: list[Message]) -> tuple[str | None, list[dict[str, Any]]]:
        """Convert internal messages to OpenAI format.

        Args:
            messages: List of internal Message objects

        Returns:
            Tuple of (system_message, api_messages)
            Note: OpenAI includes system message in the messages array
        """
        api_messages = []

        for msg in messages:
            if msg.role == "system":
                # OpenAI includes system message in messages array
                api_messages.append({"role": "system", "content": msg.content})
                continue

            # For user messages
            if msg.role == "user":
                api_messages.append({"role": "user", "content": msg.content})

            # For assistant messages
            elif msg.role == "assistant":
                assistant_msg = {"role": "assistant"}

                # Add content if present
                if msg.content:
                    assistant_msg["content"] = msg.content

                # Add tool calls if present
                if msg.tool_calls:
                    tool_calls_list = []
                    for tool_call in msg.tool_calls:
                        tool_calls_list.append(
                            {
                                "id": tool_call.id,
                                "type": "function",
                                "function": {
                                    "name": tool_call.function.name,
                                    "arguments": json.dumps(tool_call.function.arguments),
                                },
                            }
                        )
                    assistant_msg["tool_calls"] = tool_calls_list

                # IMPORTANT: Add reasoning_details if thinking is present
                # This is CRITICAL for Interleaved Thinking to work properly!
                # The complete response_message (including reasoning_details) must be
                # preserved in Message History and passed back to the model in the next turn.
                # This ensures the model's chain of thought is not interrupted.
                if msg.thinking:
                    assistant_msg["reasoning_details"] = [{"text": msg.thinking}]

                api_messages.append(assistant_msg)

            # For tool result messages
            elif msg.role == "tool":
                api_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": msg.tool_call_id,
                        "content": msg.content,
                    }
                )

        return None, api_messages

    def _prepare_request(
        self,
        messages: list[Message],
        tools: list[Any] | None = None,
    ) -> dict[str, Any]:
        """Prepare the request for OpenAI API.

        Args:
            messages: List of conversation messages
            tools: Optional list of available tools

        Returns:
            Dictionary containing request parameters
        """
        _, api_messages = self._convert_messages(messages)

        return {
            "api_messages": api_messages,
            "tools": tools,
        }

    def _parse_response(self, response: Any) -> LLMResponse:
        """Parse OpenAI response into LLMResponse.

        Args:
            response: OpenAI ChatCompletion response (full response object)

        Returns:
            LLMResponse object
        """
        # Get message from response
        message = response.choices[0].message

        # Extract text content
        text_content = message.content or ""

        # Extract thinking content from reasoning_details
        thinking_content = ""
        if hasattr(message, "reasoning_details") and message.reasoning_details:
            # reasoning_details is a list of reasoning blocks
            for detail in message.reasoning_details:
                if hasattr(detail, "text"):
                    thinking_content += detail.text

        # Extract tool calls
        tool_calls = []
        if message.tool_calls:
            for tool_call in message.tool_calls:
                # Parse arguments from JSON string
                arguments = json.loads(tool_call.function.arguments)

                tool_calls.append(
                    ToolCall(
                        id=tool_call.id,
                        type="function",
                        function=FunctionCall(
                            name=tool_call.function.name,
                            arguments=arguments,
                        ),
                    )
                )

        # Extract token usage from response
        usage = self._convert_usage(getattr(response, "usage", None))

        return LLMResponse(
            content=text_content,
            thinking=thinking_content if thinking_content else None,
            tool_calls=tool_calls if tool_calls else None,
            finish_reason="stop",  # OpenAI doesn't provide finish_reason in the message
            usage=usage,
        )

    async def generate(
        self,
        messages: list[Message],
        tools: list[Any] | None = None,
    ) -> LLMResponse:
        """Generate response from OpenAI LLM."""
        return await super().generate(messages, tools)

    async def stream_generate(
        self,
        messages: list[Message],
        tools: list[Any] | None = None,
    ) -> AsyncIterator[LLMStreamEvent]:
        """Stream OpenAI-compatible response events."""
        request_params = self._prepare_request(messages, tools)

        if self.retry_config.enabled:
            retry_decorator = async_retry(config=self.retry_config, on_retry=self.retry_callback)
            api_call = retry_decorator(self._make_api_request)
            stream = await api_call(
                request_params["api_messages"],
                request_params["tools"],
                True,
            )
        else:
            stream = await self._make_api_request(
                request_params["api_messages"],
                request_params["tools"],
                True,
            )

        usage = None
        finish_reason = "stop"
        tool_call_buffers: dict[int, dict[str, Any]] = {}
        emitted_tool_calls: set[int] = set()

        async for chunk in stream:
            usage = self._convert_usage(getattr(chunk, "usage", None)) or usage
            for choice in getattr(chunk, "choices", []):
                delta = choice.delta

                reasoning_delta = self._extract_reasoning_delta(delta)
                if reasoning_delta:
                    yield LLMStreamEvent(type="thinking_delta", delta=reasoning_delta)

                if delta.content:
                    yield LLMStreamEvent(type="content_delta", delta=delta.content)

                if delta.tool_calls:
                    for partial_tool_call in delta.tool_calls:
                        index = getattr(partial_tool_call, "index", 0)
                        buffer = tool_call_buffers.setdefault(
                            index,
                            {
                                "id": getattr(partial_tool_call, "id", None) or f"tool_{index}",
                                "name": "",
                                "arguments_parts": [],
                            },
                        )

                        if getattr(partial_tool_call, "id", None):
                            buffer["id"] = partial_tool_call.id

                        function = getattr(partial_tool_call, "function", None)
                        if function is not None:
                            if getattr(function, "name", None):
                                buffer["name"] = function.name
                            if getattr(function, "arguments", None):
                                buffer["arguments_parts"].append(function.arguments)

                if choice.finish_reason:
                    finish_reason = choice.finish_reason
                    if choice.finish_reason == "tool_calls":
                        for index, buffer in list(tool_call_buffers.items()):
                            if index in emitted_tool_calls:
                                continue
                            emitted_tool_calls.add(index)
                            arguments_json = "".join(buffer["arguments_parts"]) or "{}"
                            yield LLMStreamEvent(
                                type="tool_call",
                                tool_call=ToolCall(
                                    id=buffer["id"],
                                    type="function",
                                    function=FunctionCall(
                                        name=buffer["name"],
                                        arguments=json.loads(arguments_json),
                                    ),
                                ),
                            )

        for index, buffer in tool_call_buffers.items():
            if index in emitted_tool_calls:
                continue
            arguments_json = "".join(buffer["arguments_parts"]) or "{}"
            yield LLMStreamEvent(
                type="tool_call",
                tool_call=ToolCall(
                    id=buffer["id"],
                    type="function",
                    function=FunctionCall(
                        name=buffer["name"],
                        arguments=json.loads(arguments_json),
                    ),
                ),
            )

        yield LLMStreamEvent(type="done", finish_reason=finish_reason, usage=usage)
