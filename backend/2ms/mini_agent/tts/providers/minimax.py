"""MiniMax TTS provider."""

import base64
import binascii
import json
from collections.abc import AsyncIterator

import httpx

from ..base import TTSProvider
from ..schemas import TTSAudioChunk, TTSAudioChunkData, TTSRequest


class MiniMaxTTSProvider(TTSProvider):
    """TTS provider backed by the MiniMax HTTP API."""

    def __init__(self, settings):
        super().__init__(settings)
        self._client: httpx.AsyncClient | None = None

    @property
    def provider_name(self) -> str:
        return "minimax"

    @property
    def supports_streaming(self) -> bool:
        return True

    def _build_endpoint(self) -> str:
        api_base = (self.settings.api_base or "https://api.minimax.io").rstrip("/")
        if api_base.endswith("/v1"):
            return f"{api_base}/t2a_v2"
        return f"{api_base}/v1/t2a_v2"

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=60.0)
        return self._client

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.settings.api_key}",
            "Content-Type": "application/json",
        }

    def _params(self) -> dict[str, str]:
        return {"GroupId": self.settings.minimax_group_id}

    def _build_payload(self, request: TTSRequest, stream: bool) -> dict:
        return {
            "model": self.settings.minimax_model,
            "text": request.text,
            "stream": stream,
            "voice_setting": {
                "voice_id": request.voice,
                "speed": 1.5,
                "vol": 1.0,
                "pitch": 0,
            },
            "audio_setting": {
                "sample_rate": 32000,
                "bitrate": 128000,
                "format": request.audio_format,
                "channel": 1,
            },
        }

    def _decode_audio_payload(self, audio_payload: str) -> bytes:
        try:
            return binascii.unhexlify(audio_payload)
        except (binascii.Error, ValueError):
            try:
                return base64.b64decode(audio_payload, validate=True)
            except (binascii.Error, ValueError) as exc:
                raise RuntimeError("MiniMax TTS returned invalid audio payload.") from exc

    async def synthesize(self, request: TTSRequest) -> TTSAudioChunk:
        if not self.settings.api_key:
            raise RuntimeError("MiniMax TTS requires an API key.")

        if not self.settings.minimax_group_id:
            raise RuntimeError("MiniMax TTS requires `tts.minimax_group_id` to be configured.")

        client = await self._get_client()
        response = await client.post(
            self._build_endpoint(),
            headers=self._headers(),
            params=self._params(),
            json=self._build_payload(request, stream=False),
        )
        response.raise_for_status()
        data = response.json()

        base_resp = data.get("base_resp") or {}
        if base_resp.get("status_code") not in {0, "0", None}:
            raise RuntimeError(base_resp.get("status_msg") or "MiniMax TTS request failed.")

        audio_hex = data.get("data", {}).get("audio")
        if not audio_hex:
            raise RuntimeError("MiniMax TTS response did not contain audio data.")

        audio_bytes = self._decode_audio_payload(audio_hex)

        return TTSAudioChunk(
            provider=self.provider_name,
            voice=request.voice,
            text=request.text,
            audio_format=request.audio_format,
            audio_bytes=audio_bytes,
            sequence_no=request.sequence_no,
        )

    async def stream_synthesize(self, request: TTSRequest) -> AsyncIterator[TTSAudioChunkData]:
        if not self.settings.api_key:
            raise RuntimeError("MiniMax TTS requires an API key.")

        if not self.settings.minimax_group_id:
            raise RuntimeError("MiniMax TTS requires `tts.minimax_group_id` to be configured.")

        client = await self._get_client()
        chunk_index = 0
        saw_audio = False
        async with client.stream(
            "POST",
            self._build_endpoint(),
            headers=self._headers(),
            params=self._params(),
            json=self._build_payload(request, stream=True),
        ) as response:
            response.raise_for_status()
            async for raw_line in response.aiter_lines():
                line = raw_line.strip()
                if not line:
                    continue
                if line.startswith("data:"):
                    line = line[5:].strip()
                if line == "[DONE]":
                    break

                try:
                    data = json.loads(line)
                except json.JSONDecodeError:
                    continue

                base_resp = data.get("base_resp") or {}
                if base_resp.get("status_code") not in {0, "0", None}:
                    raise RuntimeError(base_resp.get("status_msg") or "MiniMax TTS request failed.")

                audio_payload = data.get("data", {}).get("audio")
                if not audio_payload:
                    continue

                saw_audio = True
                yield TTSAudioChunkData(
                    audio_bytes=self._decode_audio_payload(audio_payload),
                    chunk_index=chunk_index,
                    is_final=False,
                )
                chunk_index += 1

        if not saw_audio:
            raise RuntimeError("MiniMax TTS stream did not contain audio data.")

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None
