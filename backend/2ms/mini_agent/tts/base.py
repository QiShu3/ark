"""Base types for TTS providers."""

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator

from .schemas import TTSAudioChunk, TTSAudioChunkData, TTSRequest, TTSSettings


class TTSProvider(ABC):
    """Abstract base class for TTS providers."""

    def __init__(self, settings: TTSSettings):
        self.settings = settings

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return the provider identifier."""

    @property
    def supports_streaming(self) -> bool:
        """Whether the provider can emit audio incrementally."""
        return False

    @abstractmethod
    async def synthesize(self, request: TTSRequest) -> TTSAudioChunk:
        """Convert text to audio."""

    async def stream_synthesize(self, request: TTSRequest) -> AsyncIterator[TTSAudioChunkData]:
        """Convert text to audio incrementally.

        Providers that do not support native streaming fall back to a single chunk.
        """
        chunk = await self.synthesize(request)
        yield TTSAudioChunkData(audio_bytes=chunk.audio_bytes, chunk_index=0, is_final=True)

    async def close(self) -> None:
        """Release any provider resources."""
        return None
