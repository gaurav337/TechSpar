"""Copilot real time ASR — DashScope qwen3-asr-flash-realtime (WebSocket).

Replace the old Alibaba Cloud NLS SpeechTranscriber:
- Protocol: OpenAI Realtime API compatible
- Model: qwen3-asr-flash-realtime (Chinese, English and Japanese, server-side VAD)
- Authentication:DashScope API Key

The external interface maintains its form but the life cycle method is changed to async (start/stop/shutdown),
send_audio is still delivered synchronously + Internally sent asynchronously (without blocking the WebSocket main loop).

Also preserve VAD segments + Tencent Cloud Voiceprint Recognition Integration (lookup_role_now).
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import time
from collections import deque
from typing import Callable, Awaitable

import websockets
from websockets.exceptions import ConnectionClosed

from backend.copilot.asr_dedup import TranscriptDeduper

logger = logging.getLogger("uvicorn")

_DASHSCOPE_WS_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime"
_ASR_MODEL = "qwen3-asr-flash-realtime"
_AUDIO_CHUNK_SIZE = 3200  # ~100ms PCM16 mono @ 16kHz
_VP_WINDOW_SECONDS = 30.0  # Voiceprint results sliding window
_SEND_QUEUE_MAX = 512


class CopilotASR:
    """DashScope real-time ASR wrapper.

    External methods:
      await start()                              — Connect to WS and deliver session.update
      send_audio(pcm_bytes)                      — Synchronous delivery, internal asynchronous sending
      await stop() / await shutdown()            — graceful closing
      lookup_role_now() -> 'hr'|'candidate'|None — Determine the current situation based on the voiceprint window role

    Callback (async):
      on_interim(text)       — Streaming intermediate results
      on_sentence_end(text)  — End of sentence (duplication removed)
      on_error(message)
    """

    def __init__(
        self,
        loop: asyncio.AbstractEventLoop,
        api_key: str,
        voiceprint_client=None,
        voice_print_id: str | None = None,
    ):
        self._loop = loop
        self._api_key = api_key
        self._ws = None
        self._started = False
        self._ready = asyncio.Event()
        self._receive_task: asyncio.Task | None = None
        self._send_task: asyncio.Task | None = None
        self._send_queue: asyncio.Queue = asyncio.Queue(maxsize=_SEND_QUEUE_MAX)
        self._event_seq = 0
        self._dedup = TranscriptDeduper()

        # callback
        self.on_interim: Callable[[str], Awaitable] | None = None
        self.on_sentence_end: Callable[[str], Awaitable] | None = None
        self.on_error: Callable[[str], Awaitable] | None = None

        # Voiceprint integration (optional)
        self._vp_client = voiceprint_client
        self._vp_id = voice_print_id
        self._vp_segmenter = None
        if self._vp_client and self._vp_id:
            try:
                from backend.copilot.vad_segmenter import VADSegmenter
                self._vp_segmenter = VADSegmenter()
                logger.info("Voiceprint auto-role enabled")
            except Exception as e:
                logger.warning(f"VAD segmenter init failed, voiceprint disabled: {e}")
        self._vp_results: deque = deque(maxlen=64)

    def _next_event_id(self) -> str:
        self._event_seq += 1
        return f"asr-{id(self)}-{self._event_seq}"

    # ────────── life cycle ──────────

    async def start(self) -> bool:
        api_key = self._api_key
        if not api_key:
            raise RuntimeError(
                "DASHSCOPE_API_KEY required for real-time ASR. Configure it in settings."
            )

        try:
            self._ws = await websockets.connect(
                f"{_DASHSCOPE_WS_URL}?model={_ASR_MODEL}",
                additional_headers={
                    "Authorization": f"Bearer {api_key}",
                    "OpenAI-Beta": "realtime=v1",
                    "X-DashScope-DataInspection": "enable",
                },
                max_size=None,
            )
        except Exception as e:
            logger.error(f"DashScope ASR WS connect failed: {e}")
            raise

        # Deliver session configuration:PCM 16k + Server VAD
        session_update = {
            "event_id": self._next_event_id(),
            "type": "session.update",
            "session": {
                "modalities": ["text"],
                "input_audio_format": "pcm",
                "sample_rate": 16000,
                "turn_detection": {
                    "type": "server_vad",
                    "threshold": 0.45,
                    "silence_duration_ms": 320,
                },
            },
        }
        await self._ws.send(json.dumps(session_update))

        self._started = True
        self._receive_task = asyncio.create_task(self._receive_loop())
        self._send_task = asyncio.create_task(self._send_loop())
        logger.info("DashScope ASR started")
        return True

    async def stop(self) -> None:
        if not self._started and self._ws is None:
            return
        self._started = False
        self._ready.clear()
        self._dedup.reset()
        if self._vp_segmenter:
            self._vp_segmenter.reset()
        self._vp_results.clear()

        # Notification send_loop exit
        try:
            self._send_queue.put_nowait(None)
        except asyncio.QueueFull:
            pass

        ws = self._ws
        self._ws = None
        if ws is not None:
            try:
                await ws.send(json.dumps({
                    "event_id": self._next_event_id(),
                    "type": "session.finish",
                }))
            except Exception:
                pass
            try:
                await ws.close()
            except Exception:
                pass

        for task in (self._receive_task, self._send_task):
            if task and not task.done():
                task.cancel()
                try:
                    await task
                except (asyncio.CancelledError, Exception):
                    pass
        self._receive_task = None
        self._send_task = None
        logger.info("DashScope ASR stopped")

    async def shutdown(self) -> None:
        await self.stop()

    # ────────── Audio I/O ──────────

    def send_audio(self, pcm_data: bytes) -> bool:
        """Deliver PCM synchronously; no blocking. Drop frames when queue is full (better than blocking caller)."""
        if not self._started or not pcm_data:
            return False
        try:
            self._send_queue.put_nowait(pcm_data)
        except asyncio.QueueFull:
            logger.debug("ASR send queue full, dropping frame")
            return False

        # Parallel: Feed VAD to segment and send voiceprint verification asynchronously
        if self._vp_segmenter:
            try:
                segments = self._vp_segmenter.feed(pcm_data)
                for seg in segments:
                    self._loop.create_task(self._verify_segment(seg))
            except Exception as e:
                logger.debug(f"VAD feed error (ignored): {e}")
        return True

    async def _send_loop(self) -> None:
        """Get from send queue PCM → Cut into 100ms chunks → base64 → ws.send."""
        try:
            # Wait for session.created, up to 10 seconds
            try:
                await asyncio.wait_for(self._ready.wait(), timeout=10.0)
            except asyncio.TimeoutError:
                logger.warning("ASR session never became ready; send_loop exiting")
                return

            while self._started and self._ws is not None:
                pcm = await self._send_queue.get()
                if pcm is None:
                    return
                for offset in range(0, len(pcm), _AUDIO_CHUNK_SIZE):
                    chunk = pcm[offset:offset + _AUDIO_CHUNK_SIZE]
                    if not chunk:
                        continue
                    msg = {
                        "event_id": self._next_event_id(),
                        "type": "input_audio_buffer.append",
                        "audio": base64.b64encode(chunk).decode("ascii"),
                    }
                    try:
                        await self._ws.send(json.dumps(msg))
                    except ConnectionClosed:
                        logger.debug("ASR WS closed during send_loop")
                        return
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("ASR send loop error")

    async def _receive_loop(self) -> None:
        """Receives DashScope events and dispatches to callbacks."""
        try:
            if self._ws is None:
                return
            async for raw in self._ws:
                if isinstance(raw, bytes):
                    continue
                try:
                    data = json.loads(raw)
                except (json.JSONDecodeError, TypeError):
                    continue

                event_type = data.get("type", "")

                if event_type in ("session.created", "session.updated"):
                    self._ready.set()

                elif event_type == "conversation.item.input_audio_transcription.delta":
                    text = data.get("delta") or data.get("text") or ""
                    if text and self.on_interim:
                        try:
                            await self.on_interim(text)
                        except Exception:
                            logger.exception("on_interim callback error")

                elif event_type == "conversation.item.input_audio_transcription.text":
                    text = data.get("text") or data.get("stash") or ""
                    if text and self.on_interim:
                        try:
                            await self.on_interim(text)
                        except Exception:
                            logger.exception("on_interim callback error")

                elif event_type == "conversation.item.input_audio_transcription.completed":
                    text = (data.get("transcript") or data.get("text") or "").strip()
                    if not text:
                        continue
                    if not self._dedup.should_emit(text):
                        logger.debug(f"ASR final deduped: {text!r}")
                        continue
                    if self.on_sentence_end:
                        try:
                            await self.on_sentence_end(text)
                        except Exception:
                            logger.exception("on_sentence_end callback error")

                elif event_type == "error":
                    err_msg = str(data.get("error") or data)
                    logger.warning(f"ASR session error: {err_msg}")
                    if self.on_error:
                        try:
                            await self.on_error(err_msg)
                        except Exception:
                            pass

        except ConnectionClosed as e:
            logger.debug(f"ASR WebSocket closed: {e}")
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("ASR receive loop error")
        finally:
            self._started = False
            self._ready.clear()

    # ────────── Voiceprint integration (unchanged) ──────────

    async def _verify_segment(self, pcm_segment: bytes) -> None:
        """Asynchronously send a piece of audio to Tencent VPR, and the result is written into the sliding window."""
        if not (self._vp_client and self._vp_id):
            return
        try:
            result = await self._vp_client.verify(self._vp_id, pcm_segment)
            if result is None:
                return
            self._vp_results.append((time.monotonic(), result.matched, result.score))
            logger.debug(
                f"VPR verify: matched={result.matched} score={result.score:.1f}"
            )
        except Exception as e:
            logger.debug(f"VPR verify error (ignored): {e}")

    def lookup_role_now(self) -> str | None:
        """Determine the current speaker role based on the latest VPR window.

        Return:
          - "candidate": the latest result matched
          - "hr": the latest result unmatched
          - None: No results available, caller should default to hr
        """
        if not self._vp_results:
            return None
        now = time.monotonic()
        while self._vp_results and now - self._vp_results[0][0] > _VP_WINDOW_SECONDS:
            self._vp_results.popleft()
        if not self._vp_results:
            return None
        _, matched, _ = self._vp_results[-1]
        return "candidate" if matched else "hr"
