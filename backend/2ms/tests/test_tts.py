"""Tests for the TTS subsystem."""


import pytest
from mini_agent.tts.factory import create_tts_provider
from mini_agent.tts.manager import TTSManager
from mini_agent.tts.providers import edge as edge_provider_module
from mini_agent.tts.providers.minimax import MiniMaxTTSProvider
from mini_agent.tts.schemas import TTSAudioChunk, TTSAudioChunkData, TTSProviderName, TTSRequest, TTSSettings
from mini_agent.tts.segmenter import SentenceSegmenter


class FakeProvider:
    supports_streaming = False

    def __init__(self):
        self.requests = []

    async def synthesize(self, request: TTSRequest) -> TTSAudioChunk:
        self.requests.append(request)
        return TTSAudioChunk(
            provider="fake",
            voice=request.voice,
            text=request.text,
            audio_format=request.audio_format,
            audio_bytes=request.text.encode("utf-8"),
            sequence_no=request.sequence_no,
        )


class FakeStreamingProvider(FakeProvider):
    supports_streaming = True

    async def stream_synthesize(self, request: TTSRequest):
        self.requests.append(request)
        yield TTSAudioChunkData(audio_bytes=b"a", chunk_index=0, is_final=False)
        yield TTSAudioChunkData(audio_bytes=b"b", chunk_index=1, is_final=True)


def test_sentence_segmenter_splits_on_punctuation_and_flushes_tail():
    segmenter = SentenceSegmenter(sentence_buffer_chars=50)

    assert segmenter.push("你好，世界。继续") == ["你好，世界。"]
    assert segmenter.flush() == "继续"


def test_sentence_segmenter_splits_on_length_threshold():
    segmenter = SentenceSegmenter(sentence_buffer_chars=4)

    assert segmenter.push("abcd123") == ["abcd"]
    assert segmenter.flush() == "123"


def test_create_tts_provider_uses_selected_provider():
    minimax_settings = TTSSettings(provider=TTSProviderName.MINIMAX, api_key="key", api_base="https://api.minimax.io")
    edge_settings = TTSSettings(provider=TTSProviderName.EDGE)

    assert create_tts_provider(minimax_settings).provider_name == "minimax"
    assert create_tts_provider(edge_settings).provider_name == "edge"


@pytest.mark.asyncio
async def test_tts_manager_streams_sentences_and_stops():
    events = []
    provider = FakeProvider()
    settings = TTSSettings(enabled=True, auto_play=True)

    async def emit(event_type, payload):
        events.append((event_type, payload))

    manager = TTSManager(settings=settings, provider=provider, emit=emit)
    await manager.start()
    await manager.handle_agent_event("content_delta", {"delta": "第一句。第二"})
    await manager.handle_agent_event("assistant_message", {"content": "第一句。第二"})
    await manager.close()

    start_events = [payload for event_type, payload in events if event_type == "tts_chunk_start"]
    data_events = [payload for event_type, payload in events if event_type == "tts_chunk_data"]
    end_events = [payload for event_type, payload in events if event_type == "tts_chunk_end"]
    assert [payload["text"] for payload in start_events] == ["第一句。", "第二"]
    assert [payload["sequence_no"] for payload in data_events] == [1, 2]
    assert [payload["sequence_no"] for payload in end_events] == [1, 2]

    await manager.stop(reason="cancelled")
    assert any(event_type == "tts_stop" for event_type, _ in events)


@pytest.mark.asyncio
async def test_tts_manager_handles_non_streaming_assistant_message():
    events = []
    provider = FakeProvider()
    settings = TTSSettings(enabled=True, auto_play=True)

    async def emit(event_type, payload):
        events.append((event_type, payload))

    manager = TTSManager(settings=settings, provider=provider, emit=emit)
    await manager.start()
    await manager.handle_agent_event("assistant_message", {"content": "这是最终回复。"})
    await manager.close()

    start_events = [payload for event_type, payload in events if event_type == "tts_chunk_start"]
    assert [payload["text"] for payload in start_events] == ["这是最终回复。"]


@pytest.mark.asyncio
async def test_tts_manager_emits_streaming_audio_packets():
    events = []
    provider = FakeStreamingProvider()
    settings = TTSSettings(enabled=True, auto_play=True, streaming=True)

    async def emit(event_type, payload):
        events.append((event_type, payload))

    manager = TTSManager(settings=settings, provider=provider, emit=emit)
    await manager.start()
    await manager.handle_agent_event("assistant_message", {"content": "这是最终回复。"})
    await manager.close()

    event_types = [event_type for event_type, _ in events if event_type.startswith("tts_chunk")]
    assert event_types == ["tts_chunk_start", "tts_chunk_data", "tts_chunk_data", "tts_chunk_end"]
    assert events[0][0] == "tts_state"
    assert events[0][1]["streaming_mode"] == "audio_stream"

@pytest.mark.asyncio
async def test_minimax_provider_builds_request_and_decodes_audio(monkeypatch):
    settings = TTSSettings(
        provider=TTSProviderName.MINIMAX,
        api_key="test-key",
        api_base="https://api.minimax.io",
        minimax_group_id="group-1",
        minimax_model="speech-02-hd",
        voice="voice-a",
    )
    provider = MiniMaxTTSProvider(settings)
    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "base_resp": {"status_code": 0},
                "data": {"audio": "6869"},
            }

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def post(self, url, headers=None, params=None, json=None):
            captured["url"] = url
            captured["headers"] = headers
            captured["params"] = params
            captured["json"] = json
            return FakeResponse()

        async def aclose(self):
            return None

    monkeypatch.setattr("mini_agent.tts.providers.minimax.httpx.AsyncClient", FakeClient)
    chunk = await provider.synthesize(TTSRequest(text="hi", voice="voice-a", audio_format="mp3", sequence_no=1))

    assert captured["url"].endswith("/v1/t2a_v2")
    assert captured["params"] == {"GroupId": "group-1"}
    assert captured["json"]["text"] == "hi"
    assert chunk.audio_bytes == b"hi"


@pytest.mark.asyncio
async def test_minimax_provider_streams_audio_chunks(monkeypatch):
    settings = TTSSettings(
        provider=TTSProviderName.MINIMAX,
        api_key="test-key",
        api_base="https://api.minimax.io",
        minimax_group_id="group-1",
        minimax_model="speech-02-hd",
        voice="voice-a",
    )
    provider = MiniMaxTTSProvider(settings)

    class FakeStreamResponse:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        def raise_for_status(self):
            return None

        async def aiter_lines(self):
            yield 'data: {"data": {"audio": "61"}}'
            yield 'data: {"data": {"audio": "62"}}'
            yield 'data: [DONE]'

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def post(self, *args, **kwargs):
            raise AssertionError("post should not be called")

        def stream(self, *args, **kwargs):
            return FakeStreamResponse()

        async def aclose(self):
            return None

    monkeypatch.setattr("mini_agent.tts.providers.minimax.httpx.AsyncClient", FakeClient)
    chunks = [
        chunk async for chunk in provider.stream_synthesize(
            TTSRequest(text="hi", voice="voice-a", audio_format="mp3", sequence_no=1)
        )
    ]

    assert [chunk.audio_bytes for chunk in chunks] == [b"a", b"b"]


@pytest.mark.asyncio
async def test_edge_provider_uses_edge_tts_save(monkeypatch, tmp_path):
    saved = {}

    class FakeCommunicate:
        def __init__(self, text, voice, rate=None):
            saved["text"] = text
            saved["voice"] = voice
            saved["rate"] = rate

        async def save(self, path):
            saved["path"] = path
            # ASYNC230 false positive in tests since it's an I/O mock mock
            with open(path, "wb") as file_obj:  # noqa: ASYNC230
                file_obj.write(b"edge-audio")

    monkeypatch.setattr(edge_provider_module, "edge_tts", type("FakeEdgeModule", (), {"Communicate": FakeCommunicate}))
    provider = create_tts_provider(TTSSettings(provider=TTSProviderName.EDGE, voice="zh-CN-XiaoxiaoNeural"))
    chunk = await provider.synthesize(TTSRequest(text="你好", voice="zh-CN-XiaoxiaoNeural", audio_format="mp3"))

    assert saved["text"] == "你好"
    assert saved["voice"] == "zh-CN-XiaoxiaoNeural"
    assert chunk.audio_bytes == b"edge-audio"
