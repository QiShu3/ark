"""TTS subsystem exports."""

from .factory import create_tts_provider, provider_supports_streaming
from .manager import TTSManager
from .schemas import TTSAudioChunk, TTSAudioChunkData, TTSAudioStreamStart, TTSProviderName, TTSRequest, TTSSettings
from .segmenter import SentenceSegmenter

__all__ = [
    "SentenceSegmenter",
    "TTSAudioChunk",
    "TTSAudioChunkData",
    "TTSAudioStreamStart",
    "TTSManager",
    "TTSProviderName",
    "TTSRequest",
    "TTSSettings",
    "create_tts_provider",
    "provider_supports_streaming",
]
