"""Tests for TTS text sanitization."""

import pytest
from mini_agent.tts.manager import TTSManager
from mini_agent.tts.schemas import TTSSettings


class _FakeProvider:
    provider_name = "fake"
    supports_streaming = False

    async def synthesize(self, request):
        from mini_agent.tts.schemas import TTSAudioChunk

        return TTSAudioChunk(
            provider="fake",
            voice=request.voice,
            text=request.text,
            audio_format=request.audio_format,
            audio_bytes=b"fake",
            sequence_no=request.sequence_no,
        )


@pytest.mark.asyncio
async def test_tts_manager_strips_markdown_punctuation():
    events: list[tuple[str, dict]] = []

    async def emit(event_type, payload):
        events.append((event_type, payload))

    manager = TTSManager(settings=TTSSettings(enabled=True, auto_play=True), provider=_FakeProvider(), emit=emit)

    await manager.start()
    await manager.handle_agent_event("assistant_message", {"content": "**加粗**测试。\n- 列表。"})
    await manager.close()

    start_events = [payload for event_type, payload in events if event_type == "tts_chunk_start"]
    texts = [payload["text"] for payload in start_events]
    assert texts == ["加粗测试。", "列表。"]


@pytest.mark.asyncio
async def test_tts_manager_skips_suggestions_block_in_final_message():
    events: list[tuple[str, dict]] = []

    async def emit(event_type, payload):
        events.append((event_type, payload))

    manager = TTSManager(settings=TTSSettings(enabled=True, auto_play=True), provider=_FakeProvider(), emit=emit)

    await manager.start()
    await manager.handle_agent_event(
        "assistant_message",
        {"content": '你好<suggestions>["继续说鸣潮的事","换个别的聊"]</suggestions>世界。'},
    )
    await manager.close()

    start_events = [payload for event_type, payload in events if event_type == "tts_chunk_start"]
    texts = [payload["text"] for payload in start_events]
    assert texts == ["你好世界。"]


@pytest.mark.asyncio
async def test_tts_manager_skips_suggestions_block_in_streaming_deltas():
    events: list[tuple[str, dict]] = []

    async def emit(event_type, payload):
        events.append((event_type, payload))

    manager = TTSManager(settings=TTSSettings(enabled=True, auto_play=True), provider=_FakeProvider(), emit=emit)

    await manager.start()
    await manager.handle_agent_event("content_delta", {"delta": '你好<suggestions>["继续说鸣潮的事"'})
    await manager.handle_agent_event("content_delta", {"delta": ',"换个别的聊"]</suggestions>世界。'})
    await manager.handle_agent_event(
        "assistant_message",
        {"content": '你好<suggestions>["继续说鸣潮的事","换个别的聊"]</suggestions>世界。'},
    )
    await manager.close()

    start_events = [payload for event_type, payload in events if event_type == "tts_chunk_start"]
    texts = [payload["text"] for payload in start_events]
    assert texts == ["你好世界。"]

@pytest.mark.asyncio
async def test_tts_manager_strips_urls():
    events = []

    class FakeProvider:
        provider_name = "fake"
        supports_streaming = False
        async def synthesize(self, request):
            from mini_agent.tts.schemas import TTSAudioChunk
            return TTSAudioChunk(
                provider="fake",
                voice=request.voice,
                text=request.text,
                audio_format=request.audio_format,
                audio_bytes=b"fake",
                sequence_no=request.sequence_no,
            )

    async def emit(event_type, payload):
        events.append((event_type, payload))

    manager = TTSManager(
        settings=TTSSettings(enabled=True, auto_play=True),
        provider=FakeProvider(),
        emit=emit,
    )

    await manager.start()
    await manager.handle_agent_event("assistant_message", {"content": "我帮你搜索[莫宁](https://www.bing.com/search?q=123)的攻略。<https://bing.com>"})
    await manager.close()

    start_events = [payload for event_type, payload in events if event_type == "tts_chunk_start"]
    texts = [payload["text"] for payload in start_events]
    assert texts == ["我帮你搜索莫宁的攻略。"]

@pytest.mark.asyncio
async def test_tts_manager_strips_urls_incremental():
    events = []

    class FakeProvider:
        provider_name = "fake"
        supports_streaming = False
        async def synthesize(self, request):
            from mini_agent.tts.schemas import TTSAudioChunk
            return TTSAudioChunk(
                provider="fake",
                voice=request.voice,
                text=request.text,
                audio_format=request.audio_format,
                audio_bytes=b"fake",
                sequence_no=request.sequence_no,
            )

    async def emit(event_type, payload):
        events.append((event_type, payload))

    manager = TTSManager(
        settings=TTSSettings(enabled=True, auto_play=True),
        provider=FakeProvider(),
        emit=emit,
    )

    await manager.start()
    chunks = ["我帮你搜索莫宁", "的攻略。<http", "s://bing.com/a?q=123>", "结束。"]
    for chunk in chunks:
        await manager.handle_agent_event("content_delta", {"delta": chunk})
    await manager.handle_agent_event("run_completed", {})
    await manager.close()

    start_events = [payload for event_type, payload in events if event_type == "tts_chunk_start"]
    texts = [payload["text"] for payload in start_events]
    assert texts == ["我帮你搜索莫宁的攻略。", "结束。"]
