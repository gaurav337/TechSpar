"""Speech segment segmenter based on webrtcvad.

Responsibility: Cut out of the continuous 16kHz PCM stream"at least min_speech_Pure speech segment of ms",
Used to asynchronously feed voiceprint recognition (not to ASR).

Not a neural network——webrtcvad is a pure C VAD for the WebRTC project,<100KB, extremely low CPU overhead.

Segmentation strategy:
- One frame every 30ms (webrtcvad only accepts 10/20/30ms frame)
- Continuously detected speech frames, accumulated ≥ min_speech_ms and trailing silence appears later. → yield
- Hard cap max_speech_ms → Force yield (to prevent long sentences from never being cut)
- shorter than min_speech_ms speech segment (e.g."Yeah""OK") discard directly
"""
from __future__ import annotations

import logging
from typing import Iterator

logger = logging.getLogger("uvicorn")

_FRAME_MS = 30
_SAMPLE_RATE = 16000
_BYTES_PER_SAMPLE = 2  # 16-bit
_FRAME_BYTES = _SAMPLE_RATE * _FRAME_MS // 1000 * _BYTES_PER_SAMPLE  # 960 bytes


class VADSegmenter:
    """Incremental slicer.feed() Returns the list of cut speech segments."""

    def __init__(
        self,
        sample_rate: int = _SAMPLE_RATE,
        min_speech_ms: int = 1500,
        max_speech_ms: int = 3000,
        trailing_silence_ms: int = 400,
        aggressiveness: int = 2,
    ):
        if sample_rate != _SAMPLE_RATE:
            raise ValueError("VADSegmenter currently only supports 16kHz")
        try:
            import webrtcvad
        except ImportError as e:
            raise RuntimeError(
                "webrtcvad is not installed. Run:pip install webrtcvad"
            ) from e

        self._vad = webrtcvad.Vad(aggressiveness)
        self._sample_rate = sample_rate
        self._min_speech_frames = min_speech_ms // _FRAME_MS
        self._max_speech_frames = max_speech_ms // _FRAME_MS
        self._trailing_silence_frames = trailing_silence_ms // _FRAME_MS

        self._residual = b""                    # There are less than one frame of bytes left in the last feed
        self._speech_buf: list[bytes] = []      # accumulated speech frames
        self._silence_tail = 0                  # The number of silent frames at the end of the current accumulation

    def feed(self, pcm_chunk: bytes) -> list[bytes]:
        """Feed a piece of PCM and return chopped speech segments (possibly 0, 1 or more segments)."""
        segments: list[bytes] = []
        data = self._residual + pcm_chunk

        offset = 0
        while offset + _FRAME_BYTES <= len(data):
            frame = data[offset:offset + _FRAME_BYTES]
            offset += _FRAME_BYTES

            try:
                is_speech = self._vad.is_speech(frame, self._sample_rate)
            except Exception:
                is_speech = False

            if is_speech:
                self._speech_buf.append(frame)
                self._silence_tail = 0

                # hard cap trigger
                if len(self._speech_buf) >= self._max_speech_frames:
                    segments.append(b"".join(self._speech_buf))
                    self._speech_buf.clear()
                    self._silence_tail = 0
            else:
                if self._speech_buf:
                    self._silence_tail += 1
                    # If the silence at the end is long enough, the paragraph is judged to be over.
                    if self._silence_tail >= self._trailing_silence_frames:
                        if len(self._speech_buf) >= self._min_speech_frames:
                            segments.append(b"".join(self._speech_buf))
                        # Otherwise discard (too short)
                        self._speech_buf.clear()
                        self._silence_tail = 0
                # mute and buf is empty → do nothing

        self._residual = data[offset:]
        return segments

    def flush(self) -> bytes | None:
        """Called when the stream ends, using the remainder in buf as a yield (if long enough)."""
        if self._speech_buf and len(self._speech_buf) >= self._min_speech_frames:
            segment = b"".join(self._speech_buf)
            self._speech_buf.clear()
            self._silence_tail = 0
            self._residual = b""
            return segment
        self._speech_buf.clear()
        self._silence_tail = 0
        self._residual = b""
        return None

    def reset(self) -> None:
        self._residual = b""
        self._speech_buf.clear()
        self._silence_tail = 0
