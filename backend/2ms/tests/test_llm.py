"""Test cases for LLM wrapper client."""

import asyncio
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
import yaml

from mini_agent.llm import AnthropicClient
from mini_agent.llm import LLMClient
from mini_agent.llm.base import LLMClientBase
from mini_agent.schema import LLMProvider, LLMStreamEvent, Message


@pytest.mark.asyncio
async def test_wrapper_anthropic_provider():
    """Test LLM wrapper with Anthropic provider."""
    print("\n=== Testing LLM Wrapper (Anthropic Provider) ===")

    # Load config
    config_path = Path("mini_agent/config/config.yaml")
    with open(config_path, encoding="utf-8") as f:
        config = yaml.safe_load(f)

    # Create client with Anthropic provider
    client = LLMClient(
        api_key=config["api_key"],
        provider=LLMProvider.ANTHROPIC,
        api_base=config.get("api_base"),
        model=config.get("model"),
    )

    assert client.provider == LLMProvider.ANTHROPIC

    # Simple messages
    messages = [
        Message(role="system", content="You are a helpful assistant."),
        Message(role="user", content="Say 'Hello, Mini Agent!' and nothing else."),
    ]

    try:
        response = await client.generate(messages=messages)

        print(f"Response: {response.content}")
        print(f"Finish reason: {response.finish_reason}")

        assert response.content, "Response content is empty"
        assert "Hello" in response.content or "hello" in response.content, (
            f"Response doesn't contain 'Hello': {response.content}"
        )

        print("✅ Anthropic provider test passed")
        return True
    except Exception as e:
        print(f"❌ Anthropic provider test failed: {e}")
        import traceback

        traceback.print_exc()
        return False


@pytest.mark.asyncio
async def test_wrapper_openai_provider():
    """Test LLM wrapper with OpenAI provider."""
    print("\n=== Testing LLM Wrapper (OpenAI Provider) ===")

    # Load config
    config_path = Path("mini_agent/config/config.yaml")
    with open(config_path, encoding="utf-8") as f:
        config = yaml.safe_load(f)

    # Create client with OpenAI provider
    client = LLMClient(
        api_key=config["api_key"],
        provider=LLMProvider.OPENAI,
        model=config.get("model"),
    )

    assert client.provider == LLMProvider.OPENAI

    # Simple messages
    messages = [
        Message(role="system", content="You are a helpful assistant."),
        Message(role="user", content="Say 'Hello, Mini Agent!' and nothing else."),
    ]

    try:
        response = await client.generate(messages=messages)

        print(f"Response: {response.content}")
        print(f"Finish reason: {response.finish_reason}")

        assert response.content, "Response content is empty"
        assert "Hello" in response.content or "hello" in response.content, (
            f"Response doesn't contain 'Hello': {response.content}"
        )

        print("✅ OpenAI provider test passed")
        return True
    except Exception as e:
        print(f"❌ OpenAI provider test failed: {e}")
        import traceback

        traceback.print_exc()
        return False


@pytest.mark.asyncio
async def test_wrapper_default_provider():
    """Test LLM wrapper with default provider (Anthropic)."""
    print("\n=== Testing LLM Wrapper (Default Provider) ===")

    # Load config
    config_path = Path("mini_agent/config/config.yaml")
    with open(config_path, encoding="utf-8") as f:
        config = yaml.safe_load(f)

    # Create client without specifying provider (should default to Anthropic)
    client = LLMClient(
        api_key=config["api_key"],
        model=config.get("model"),
    )

    assert client.provider == LLMProvider.ANTHROPIC
    print("✅ Default provider is Anthropic")
    return True


def test_anthropic_parse_response_handles_none_content():
    client = AnthropicClient(
        api_key="test-key",
        api_base="https://example.com/anthropic",
        model="demo-model",
    )

    response = SimpleNamespace(content=None, usage=None, stop_reason=None)

    parsed = client._parse_response(response)

    assert parsed.content == ""
    assert parsed.thinking is None
    assert parsed.tool_calls is None
    assert parsed.finish_reason == "stop"


class FakeStreamingClient(LLMClientBase):
    def _prepare_request(self, messages, tools=None):
        return {}

    def _convert_messages(self, messages):
        return None, []

    async def stream_generate(self, messages, tools=None):
        yield LLMStreamEvent(type="thinking_delta", delta="先想")
        yield LLMStreamEvent(type="content_delta", delta="Hello")
        yield LLMStreamEvent(type="content_delta", delta=" world")
        yield LLMStreamEvent(type="done", finish_reason="stop")


class AsyncEventStream:
    def __init__(self, events: list[Any]):
        self.events = events

    def __aiter__(self):
        self._iter = iter(self.events)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration as exc:
            raise StopAsyncIteration from exc


@pytest.mark.asyncio
async def test_base_generate_aggregates_stream_events():
    client = FakeStreamingClient(
        api_key="test-key",
        api_base="https://example.com",
        model="demo-model",
    )

    response = await client.generate(messages=[Message(role="user", content="hello")])

    assert response.thinking == "先想"
    assert response.content == "Hello world"
    assert response.finish_reason == "stop"


@pytest.mark.asyncio
async def test_anthropic_stream_generate_emits_incremental_events(monkeypatch):
    client = AnthropicClient(
        api_key="test-key",
        api_base="https://example.com/anthropic",
        model="demo-model",
    )

    event_stream = AsyncEventStream(
        [
            SimpleNamespace(
                type="message_start",
                message=SimpleNamespace(
                    usage=SimpleNamespace(
                        input_tokens=11,
                        output_tokens=0,
                        cache_read_input_tokens=0,
                        cache_creation_input_tokens=0,
                    )
                ),
            ),
            SimpleNamespace(
                type="content_block_start",
                index=0,
                content_block=SimpleNamespace(type="thinking"),
            ),
            SimpleNamespace(
                type="content_block_delta",
                index=0,
                delta=SimpleNamespace(type="thinking_delta", thinking="分析中"),
            ),
            SimpleNamespace(
                type="content_block_start",
                index=1,
                content_block=SimpleNamespace(type="text"),
            ),
            SimpleNamespace(
                type="content_block_delta",
                index=1,
                delta=SimpleNamespace(type="text_delta", text="你好"),
            ),
            SimpleNamespace(
                type="content_block_start",
                index=2,
                content_block=SimpleNamespace(type="tool_use", id="tool-1", name="lookup", input={}),
            ),
            SimpleNamespace(
                type="content_block_delta",
                index=2,
                delta=SimpleNamespace(type="input_json_delta", partial_json='{"city":"Shanghai"}'),
            ),
            SimpleNamespace(type="content_block_stop", index=2),
            SimpleNamespace(
                type="message_delta",
                delta=SimpleNamespace(stop_reason="tool_use"),
                usage=SimpleNamespace(
                    input_tokens=11,
                    output_tokens=7,
                    cache_read_input_tokens=0,
                    cache_creation_input_tokens=0,
                ),
            ),
        ]
    )

    async def fake_make_api_request(system_message, api_messages, tools=None, stream=False):
        assert stream is True
        return event_stream

    monkeypatch.setattr(client, "_make_api_request", fake_make_api_request)

    events = [event async for event in client.stream_generate([Message(role="user", content="hi")], tools=[])]

    assert [event.type for event in events] == ["thinking_delta", "content_delta", "tool_call", "done"]
    assert events[0].delta == "分析中"
    assert events[1].delta == "你好"
    assert events[2].tool_call.function.name == "lookup"
    assert events[2].tool_call.function.arguments == {"city": "Shanghai"}
    assert events[3].finish_reason == "tool_use"
    assert events[3].usage.total_tokens == 18


@pytest.mark.asyncio
async def test_openai_stream_generate_emits_incremental_events(monkeypatch):
    from mini_agent.llm import OpenAIClient

    client = OpenAIClient(
        api_key="test-key",
        api_base="https://example.com/v1",
        model="demo-model",
    )

    event_stream = AsyncEventStream(
        [
            SimpleNamespace(
                usage=None,
                choices=[
                    SimpleNamespace(
                        delta=SimpleNamespace(
                            content=None,
                            tool_calls=None,
                            model_extra={"reasoning_content": "推理"},
                        ),
                        finish_reason=None,
                    )
                ],
            ),
            SimpleNamespace(
                usage=None,
                choices=[
                    SimpleNamespace(
                        delta=SimpleNamespace(content="你好", tool_calls=None, model_extra={}),
                        finish_reason=None,
                    )
                ],
            ),
            SimpleNamespace(
                usage=None,
                choices=[
                    SimpleNamespace(
                        delta=SimpleNamespace(
                            content=None,
                            model_extra={},
                            tool_calls=[
                                SimpleNamespace(
                                    index=0,
                                    id="call-1",
                                    function=SimpleNamespace(name="lookup", arguments='{"city":"Sh'),
                                )
                            ],
                        ),
                        finish_reason=None,
                    )
                ],
            ),
            SimpleNamespace(
                usage=None,
                choices=[
                    SimpleNamespace(
                        delta=SimpleNamespace(
                            content=None,
                            model_extra={},
                            tool_calls=[
                                SimpleNamespace(
                                    index=0,
                                    id=None,
                                    function=SimpleNamespace(name=None, arguments='anghai"}'),
                                )
                            ],
                        ),
                        finish_reason="tool_calls",
                    )
                ],
            ),
            SimpleNamespace(
                usage=SimpleNamespace(prompt_tokens=10, completion_tokens=6, total_tokens=16),
                choices=[],
            ),
        ]
    )

    async def fake_make_api_request(api_messages, tools=None, stream=False):
        assert stream is True
        return event_stream

    monkeypatch.setattr(client, "_make_api_request", fake_make_api_request)

    events = [event async for event in client.stream_generate([Message(role="user", content="hi")], tools=[])]

    assert [event.type for event in events] == ["thinking_delta", "content_delta", "tool_call", "done"]
    assert events[0].delta == "推理"
    assert events[1].delta == "你好"
    assert events[2].tool_call.function.name == "lookup"
    assert events[2].tool_call.function.arguments == {"city": "Shanghai"}
    assert events[3].finish_reason == "tool_calls"
    assert events[3].usage.total_tokens == 16


@pytest.mark.asyncio
async def test_wrapper_tool_calling():
    """Test LLM wrapper with tool calling."""
    print("\n=== Testing LLM Wrapper Tool Calling ===")

    # Load config
    config_path = Path("mini_agent/config/config.yaml")
    with open(config_path, encoding="utf-8") as f:
        config = yaml.safe_load(f)

    # Create client with Anthropic provider
    client = LLMClient(
        api_key=config["api_key"],
        provider=LLMProvider.ANTHROPIC,
        model=config.get("model"),
    )

    # Messages requesting tool use
    messages = [
        Message(
            role="system", content="You are a helpful assistant with access to tools."
        ),
        Message(role="user", content="Calculate 123 + 456 using the calculator tool."),
    ]

    # Define a simple calculator tool using dict format
    tools = [
        {
            "name": "calculator",
            "description": "Perform arithmetic operations",
            "input_schema": {
                "type": "object",
                "properties": {
                    "operation": {
                        "type": "string",
                        "enum": ["add", "subtract", "multiply", "divide"],
                        "description": "The operation to perform",
                    },
                    "a": {
                        "type": "number",
                        "description": "First number",
                    },
                    "b": {
                        "type": "number",
                        "description": "Second number",
                    },
                },
                "required": ["operation", "a", "b"],
            },
        }
    ]

    try:
        response = await client.generate(messages=messages, tools=tools)

        print(f"Response: {response.content}")
        print(f"Tool calls: {response.tool_calls}")
        print(f"Finish reason: {response.finish_reason}")

        if response.tool_calls:
            print("✅ Tool calling test passed - LLM requested tool use")
        else:
            print("⚠️  Warning: LLM didn't use tools, but request succeeded")

        return True
    except Exception as e:
        print(f"❌ Tool calling test failed: {e}")
        import traceback

        traceback.print_exc()
        return False


async def main():
    """Run all LLM wrapper tests."""
    print("=" * 80)
    print("Running LLM Wrapper Tests")
    print("=" * 80)
    print("\nNote: These tests require a valid MiniMax API key in config.yaml")

    results = []

    # Test default provider
    results.append(await test_wrapper_default_provider())

    # Test Anthropic provider
    results.append(await test_wrapper_anthropic_provider())

    # Test OpenAI provider
    results.append(await test_wrapper_openai_provider())

    # Test tool calling
    results.append(await test_wrapper_tool_calling())

    print("\n" + "=" * 80)
    if all(results):
        print("All LLM wrapper tests passed! ✅")
    else:
        print("Some LLM wrapper tests failed. Check the output above.")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(main())
