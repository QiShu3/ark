"""High-level TTS orchestration."""

import asyncio
import re
from collections.abc import Awaitable, Callable
from contextlib import suppress
from typing import Any

from .base import TTSProvider
from .schemas import TTSAudioStreamStart, TTSRequest, TTSSettings
from .segmenter import SentenceSegmenter


class TTSManager:
    """Coordinate sentence segmentation, synthesis, and playback events."""

    def __init__(
        self,
        settings: TTSSettings,
        provider: TTSProvider | None = None,
        emit: Callable[[str, dict[str, Any]], Awaitable[None] | None] | None = None,
    ):
        self.settings = settings
        self.provider = provider
        self.emit = emit
        self.segmenter = SentenceSegmenter(settings.sentence_buffer_chars)
        self.sequence_no = 0
        self._generation = 0
        self._seen_content_delta = False
        self._suggestions_pending = ""
        self._in_suggestions = False
        self._url_pending = ""
        self._url_state = "NORMAL"
        self._queue: asyncio.Queue[tuple[int, TTSRequest] | None] = asyncio.Queue()
        self._worker: asyncio.Task | None = None

    @property
    def active(self) -> bool:
        return bool(self.settings.enabled and self.provider and self.emit)

    async def start(self) -> None:
        """Start the synthesis worker."""
        if not self.active or self._worker is not None:
            return
        self._worker = asyncio.create_task(self._run_worker())
        await self._emit_state("ready")

    async def handle_agent_event(self, event_type: str, payload: dict[str, Any]) -> None:
        """Consume runtime events produced by the agent."""
        if not self.active:
            return

        if event_type == "content_delta":
            self._seen_content_delta = True
            delta = self._strip_suggestions_stream(payload.get("delta", ""))
            delta = self._strip_urls_stream(delta)
            for sentence in self.segmenter.push(delta):
                await self._enqueue_sentence(sentence)
            return

        if event_type == "assistant_message":
            # Streaming flows usually emit content_delta first; non-streaming flows may
            # emit only the final assistant_message content.
            if self._seen_content_delta:
                await self.flush()
            else:
                await self._enqueue_text(payload.get("content", ""))
            self._seen_content_delta = False
            self._reset_stream_parsers()
            return

        if event_type == "run_completed":
            await self.flush()
            self._seen_content_delta = False
            self._reset_stream_parsers()
            return

        if event_type in {"run_cancelled", "run_failed"}:
            reason = payload.get("message") or payload.get("error") or event_type
            await self.stop(reason=reason)

    async def flush(self) -> None:
        """Flush any remaining buffered text."""
        if not self.active:
            return
        sentence = self.segmenter.flush()
        if sentence:
            await self._enqueue_sentence(sentence)

    async def reset(self, reason: str = "reset") -> None:
        """Clear all pending and active playback without shutting down the worker."""
        if not self.active:
            return
        self._generation += 1
        self._seen_content_delta = False
        self._reset_stream_parsers()
        self.segmenter.reset()
        self._drain_queue()
        await self._emit("tts_stop", {"reason": reason})
        await self._emit_state("ready")

    async def stop(self, reason: str = "stopped") -> None:
        """Stop current synthesis/playback for the active run."""
        await self.reset(reason=reason)

    async def close(self) -> None:
        """Shut down the manager."""
        if not self.active:
            return
        await self.flush()
        await self._queue.join()
        if self._worker is not None:
            await self._queue.put(None)
            self._worker.cancel()
            with suppress(asyncio.CancelledError):
                await self._worker
            self._worker = None
        if self.provider is not None and hasattr(self.provider, "close"):
            await self.provider.close()

    def _reset_stream_parsers(self) -> None:
        """Reset streaming text parsers."""
        self._suggestions_pending = ""
        self._in_suggestions = False
        self._url_pending = ""
        self._url_state = "NORMAL"

    def _strip_suggestions_stream(self, text: str) -> str:
        """Strip <suggestions>...</suggestions> blocks from a potentially streamed text."""
        if not text and not self._suggestions_pending:
            return ""

        start_tag = "<suggestions>"
        end_tag = "</suggestions>"
        data = f"{self._suggestions_pending}{text or ''}"
        pending = ""
        output: list[str] = []
        index = 0

        while index < len(data):
            if not self._in_suggestions and data.startswith(start_tag, index):
                self._in_suggestions = True
                index += len(start_tag)
                continue

            if self._in_suggestions and data.startswith(end_tag, index):
                self._in_suggestions = False
                index += len(end_tag)
                continue

            if data[index] == "<":
                candidate = data[index:]
                if not self._in_suggestions and start_tag.startswith(candidate):
                    pending = candidate
                    break
                if self._in_suggestions and end_tag.startswith(candidate):
                    pending = candidate
                    break

            if not self._in_suggestions:
                output.append(data[index])
            index += 1

        self._suggestions_pending = pending
        return "".join(output)

    def _strip_urls_stream(self, text: str) -> str:
        """Strip URLs from a potentially streamed text incrementally."""
        if not text and not self._url_pending:
            return ""

        data = self._url_pending + (text or "")
        output: list[str] = []
        i = 0

        while i < len(data):
            if self._url_state == "IN_URL_ANGLE":
                if data[i] == ">":
                    self._url_state = "NORMAL"
                i += 1
                continue
            elif self._url_state == "IN_URL_PAREN":
                if data[i] == ")":
                    self._url_state = "NORMAL"
                i += 1
                continue
            elif self._url_state == "IN_URL_RAW":
                if data[i].isspace() or data[i] in "。！？；\n>":
                    self._url_state = "NORMAL"
                else:
                    i += 1
                    continue

            remaining = data[i:]
            if remaining.startswith("<http"):
                self._url_state = "IN_URL_ANGLE"
                i += 5
                continue
            elif remaining.startswith("(http"):
                self._url_state = "IN_URL_PAREN"
                i += 5
                continue
            elif remaining.startswith("http://") or remaining.startswith("https://"):
                self._url_state = "IN_URL_RAW"
                i += 7
                continue

            if any(m.startswith(remaining) for m in ["<http", "(http", "http://", "https://"]):
                break

            output.append(data[i])
            i += 1

        self._url_pending = data[i:]
        return "".join(output)

    def _sanitize_sentence_for_tts(self, sentence: str) -> str:
        """Normalize a sentence before sending it to the TTS provider."""
        # Strip URLs from the sentence (inside (), inside <>, or standalone)
        url_pattern = r"https?://[a-zA-Z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+"
        normalized = re.sub(r"\(" + url_pattern + r"\)", "", sentence)
        normalized = re.sub(r"<" + url_pattern + r">", "", normalized)
        normalized = re.sub(url_pattern, "", normalized)
        
        normalized = re.sub(r"[*#`~_|\[\]]", "", normalized.strip())
        normalized = re.sub(r"^[-+>]\s+", "", normalized).strip()
        return normalized

    async def _enqueue_sentence(self, sentence: str) -> None:
        normalized = self._sanitize_sentence_for_tts(sentence)
        if not normalized or not self.provider:
            return
        self.sequence_no += 1
        request = TTSRequest(
            text=normalized,
            voice=self.settings.voice,
            audio_format=self.settings.audio_format,
            sequence_no=self.sequence_no,
        )
        await self._queue.put((self._generation, request))

    async def _enqueue_text(self, text: str) -> None:
        cleaned = self._strip_suggestions_stream(text or "")
        cleaned = self._strip_urls_stream(cleaned)
        for sentence in self.segmenter.push(cleaned):
            await self._enqueue_sentence(sentence)
        tail = self.segmenter.flush()
        if tail:
            await self._enqueue_sentence(tail)

    def _drain_queue(self) -> None:
        while not self._queue.empty():
            with suppress(asyncio.QueueEmpty):
                self._queue.get_nowait()
                self._queue.task_done()

    async def _run_worker(self) -> None:
        while True:
            item = await self._queue.get()
            if item is None:
                self._queue.task_done()
                break

            generation, request = item
            try:
                await self._emit_state("synthesizing")
                await self._emit_stream_for_request(generation, request)
                await self._emit_state("idle")
            except Exception as exc:
                await self._emit_state("error", error=str(exc))
            finally:
                self._queue.task_done()

    async def _emit_stream_for_request(self, generation: int, request: TTSRequest) -> None:
        if not self.provider:
            return
        start_payload = TTSAudioStreamStart(
            provider=getattr(self.provider, "provider_name", "unknown"),
            voice=request.voice,
            text=request.text,
            audio_format=request.audio_format,
            sequence_no=request.sequence_no,
        )
        await self._emit("tts_chunk_start", start_payload.model_dump())

        if getattr(self.provider, "supports_streaming", False) and self.settings.streaming:
            async for chunk in self.provider.stream_synthesize(request):
                if generation != self._generation:
                    break
                await self._emit(
                    "tts_chunk_data",
                    {
                        "sequence_no": request.sequence_no,
                        "chunk_index": chunk.chunk_index,
                        "audio_bytes": chunk.audio_bytes,
                        "is_final": chunk.is_final,
                    },
                )
        else:
            chunk = await self.provider.synthesize(request)
            if generation != self._generation:
                return
            await self._emit(
                "tts_chunk_data",
                {
                    "sequence_no": chunk.sequence_no,
                    "chunk_index": 0,
                    "audio_bytes": chunk.audio_bytes,
                    "is_final": True,
                },
            )

        if generation != self._generation:
            return
        await self._emit(
            "tts_chunk_end",
            {
                "sequence_no": request.sequence_no,
            },
        )

    async def _emit(self, event_type: str, payload: dict[str, Any]) -> None:
        if self.emit is None:
            return
        result = self.emit(event_type, payload)
        if asyncio.iscoroutine(result):
            await result

    async def _emit_state(self, status: str, error: str | None = None) -> None:
        await self._emit(
            "tts_state",
            {
                "status": status,
                "provider": self.settings.provider.value,
                "voice": self.settings.voice,
                "enabled": self.settings.enabled,
                "auto_play": self.settings.auto_play,
                "audio_format": self.settings.audio_format,
                "streaming_mode": self._streaming_mode,
                "provider_streaming_supported": bool(self.provider and getattr(self.provider, "supports_streaming", False)),
                "error": error,
            },
        )

    @property
    def _streaming_mode(self) -> str:
        if self.provider and getattr(self.provider, "supports_streaming", False) and self.settings.streaming:
            return "audio_stream"
        return "buffered_chunk"
