"""Edge TTS provider."""

from pathlib import Path
import tempfile

from ..base import TTSProvider
from ..schemas import TTSAudioChunk, TTSRequest

try:
    import edge_tts
except ImportError:  # pragma: no cover - exercised via tests/mocking
    edge_tts = None


class EdgeTTSProvider(TTSProvider):
    """TTS provider backed by the edge-tts package."""

    @property
    def provider_name(self) -> str:
        return "edge"

    async def synthesize(self, request: TTSRequest) -> TTSAudioChunk:
        if edge_tts is None:
            raise RuntimeError("edge-tts is not installed. Run `uv sync` to install optional dependencies.")

        suffix = f".{request.audio_format or 'mp3'}"
        temp_file = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
        temp_file.close()
        path = Path(temp_file.name)
        try:
            communicate = edge_tts.Communicate(request.text, request.voice, rate=self.settings.edge_rate)
            await communicate.save(str(path))
            audio_bytes = path.read_bytes()
        finally:
            path.unlink(missing_ok=True)

        return TTSAudioChunk(
            provider=self.provider_name,
            voice=request.voice,
            text=request.text,
            audio_format=request.audio_format,
            audio_bytes=audio_bytes,
            sequence_no=request.sequence_no,
        )
