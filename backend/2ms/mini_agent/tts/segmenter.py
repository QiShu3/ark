"""Sentence segmentation helpers for streaming TTS."""


class SentenceSegmenter:
    """Accumulate text until it is ready for TTS synthesis."""

    SENTENCE_ENDINGS = {"。", "！", "？", "!", "?", "；", ";", "\n"}

    def __init__(self, sentence_buffer_chars: int = 120):
        self.sentence_buffer_chars = max(1, sentence_buffer_chars)
        self._buffer = ""

    @property
    def buffer(self) -> str:
        """Return the current pending buffer."""
        return self._buffer

    def push(self, text: str) -> list[str]:
        """Push incremental text and return completed sentences."""
        sentences: list[str] = []
        if not text:
            return sentences

        for char in text:
            self._buffer += char
            if char in self.SENTENCE_ENDINGS or len(self._buffer) >= self.sentence_buffer_chars:
                sentence = self._buffer.strip()
                self._buffer = ""
                if sentence:
                    sentences.append(sentence)
        return sentences

    def flush(self) -> str | None:
        """Flush any remaining text."""
        sentence = self._buffer.strip()
        self._buffer = ""
        return sentence or None

    def reset(self) -> None:
        """Discard pending text."""
        self._buffer = ""
