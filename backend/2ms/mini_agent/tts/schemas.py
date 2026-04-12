"""Schemas for the TTS subsystem."""

from enum import Enum

from pydantic import BaseModel, Field


class TTSProviderName(str, Enum):
    """Supported TTS providers."""

    MINIMAX = "minimax"
    EDGE = "edge"


class TTSSettings(BaseModel):
    """Resolved TTS settings."""

    enabled: bool = True
    provider: TTSProviderName = TTSProviderName.MINIMAX
    voice: str = "female-shaonv"
    audio_format: str = "mp3"
    streaming: bool = True
    auto_play: bool = False
    sentence_buffer_chars: int = 120
    edge_rate: str = "+0%"
    minimax_group_id: str = ""
    minimax_model: str = "speech-02-hd"
    api_key: str = ""
    api_base: str = ""


class TTSRequest(BaseModel):
    """A single TTS synthesis request."""

    text: str
    voice: str
    audio_format: str
    sequence_no: int = 0


class TTSAudioChunkData(BaseModel):
    """A single audio chunk for streaming playback."""

    audio_bytes: bytes = Field(repr=False)
    chunk_index: int = 0
    is_final: bool = False


class TTSAudioChunk(BaseModel):
    """Normalized TTS audio output."""

    provider: str
    voice: str
    text: str
    audio_format: str
    audio_bytes: bytes = Field(repr=False)
    sequence_no: int = 0


class TTSAudioStreamStart(BaseModel):
    """Metadata emitted when a sentence audio stream starts."""

    provider: str
    voice: str
    text: str
    audio_format: str
    sequence_no: int = 0
