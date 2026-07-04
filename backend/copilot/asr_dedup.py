"""ASR final result deduplication: prevent the same sentence from triggering downstream agents repeatedly within a short window.

Reference VoiceWings backend/app/services/asr.py:1.2 second window policy for 69-94.
"""
import time
from collections import deque


class TranscriptDeduper:
    """Duplicate text suppression within sliding time windows.

    used for DashScope qwen3-asr-flash-realtime interim→Final: The same sentence is finalized multiple times due to occasional repetitions and network jitter.
    """

    def __init__(self, window_seconds: float = 1.2, max_entries: int = 16):
        self._window = window_seconds
        self._recent: deque[tuple[float, str]] = deque(maxlen=max_entries)

    def should_emit(self, text: str) -> bool:
        """Returning True indicates that this text should be pushed to the downstream; False indicates that it is repeated and discarded."""
        text = (text or "").strip()
        if not text:
            return False

        now = time.monotonic()
        # Clean up expired entries
        while self._recent and now - self._recent[0][0] > self._window:
            self._recent.popleft()

        # Whether the same text appears in the window (or one is the prefix of the other)/suffix)
        for _, prev in self._recent:
            if prev == text or prev.endswith(text) or text.endswith(prev):
                return False

        self._recent.append((now, text))
        return True

    def reset(self) -> None:
        self._recent.clear()
