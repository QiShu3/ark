"""Factory helpers for TTS providers."""

from .base import TTSProvider
from .providers.edge import EdgeTTSProvider
from .providers.minimax import MiniMaxTTSProvider
from .schemas import TTSProviderName, TTSSettings


def create_tts_provider(settings: TTSSettings) -> TTSProvider:
    """Create the configured TTS provider."""
    if settings.provider == TTSProviderName.EDGE:
        return EdgeTTSProvider(settings)
    return MiniMaxTTSProvider(settings)


def provider_supports_streaming(settings: TTSSettings) -> bool:
    """Return whether the configured provider supports provider-level audio streaming."""
    return settings.provider == TTSProviderName.MINIMAX
