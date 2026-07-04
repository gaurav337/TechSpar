"""Tencent Cloud VPR (Voice Print Recognition) Client encapsulation.

Call the CommonClient of tencentcloud-sdk-python-common to avoid introducing the asr-specific SDK.
Interface documentation:https://cloud.tencent.com/document/api/1093

Design constraints:
- Asynchronous external; the underlying Tencent SDK is synchronous, use asyncio.to_thread packaging
- When credentials are not configured, all methods directly return failure, and the caller decides whether to downgrade.
- PCM 16kHz mono input will be packaged into WAV and then sent, reducing coupling with Tencent format enumeration
"""
from __future__ import annotations

import asyncio
import base64
import io
import logging
import struct
from dataclasses import dataclass

logger = logging.getLogger("uvicorn")

# Tencent VPR general parameters
_PRODUCT = "asr"
_API_VERSION = "2019-06-14"
_REGION = "ap-shanghai"
_ENDPOINT = "asr.tencentcloudapi.com"

# Audio format enumeration (Tencent Cloud VPR):0=wav, 1=mp3, 2=m4a (we all use wav)
_VOICE_FORMAT_WAV = 0
_SAMPLE_RATE_16K = 16000


@dataclass
class VerifyResult:
    matched: bool
    score: float  # 0.0 - 100.0
    raw: dict


def extract_pcm_from_wav(wav_bytes: bytes) -> bytes:
    """Extract raw PCM data from WAV bytes. Supports standard 16bit mono WAV."""
    if len(wav_bytes) < 44 or wav_bytes[:4] != b"RIFF" or wav_bytes[8:12] != b"WAVE":
        raise ValueError("Not a valid WAV file")

    # Find "data" block position (skipping possible LIST/INFO and other auxiliary blocks)
    offset = 12
    while offset + 8 <= len(wav_bytes):
        chunk_id = wav_bytes[offset:offset + 4]
        chunk_size = struct.unpack("<I", wav_bytes[offset + 4:offset + 8])[0]
        if chunk_id == b"data":
            return wav_bytes[offset + 8:offset + 8 + chunk_size]
        offset += 8 + chunk_size
    raise ValueError("data block not found in WAV file")


def _wrap_pcm_to_wav(pcm: bytes, sample_rate: int = 16000) -> bytes:
    """Pack 16-bit mono PCM into a WAV byte stream (44-byte header + PCM data)."""
    num_channels = 1
    bits_per_sample = 16
    byte_rate = sample_rate * num_channels * bits_per_sample // 8
    block_align = num_channels * bits_per_sample // 8
    data_size = len(pcm)

    buf = io.BytesIO()
    buf.write(b"RIFF")
    buf.write(struct.pack("<I", 36 + data_size))
    buf.write(b"WAVE")
    buf.write(b"fmt ")
    buf.write(struct.pack("<I", 16))           # PCM header size
    buf.write(struct.pack("<H", 1))            # PCM format
    buf.write(struct.pack("<H", num_channels))
    buf.write(struct.pack("<I", sample_rate))
    buf.write(struct.pack("<I", byte_rate))
    buf.write(struct.pack("<H", block_align))
    buf.write(struct.pack("<H", bits_per_sample))
    buf.write(b"data")
    buf.write(struct.pack("<I", data_size))
    buf.write(pcm)
    return buf.getvalue()


class VoiceprintClient:
    """Tencent Cloud VPR client. Asynchronous interface, synchronous bottom layer."""

    def __init__(self, secret_id: str, secret_key: str, app_id: str = ""):
        self._secret_id = secret_id
        self._secret_key = secret_key
        self._app_id = app_id
        self._client = None  # Lazy initialization

    @property
    def is_configured(self) -> bool:
        return bool(self._secret_id and self._secret_key)

    def _get_client(self):
        """Lazy loading of Tencent CommonClient (avoiding strong dependence on SDK at startup)."""
        if self._client is not None:
            return self._client
        try:
            from tencentcloud.common import credential
            from tencentcloud.common.profile.client_profile import ClientProfile
            from tencentcloud.common.profile.http_profile import HttpProfile
            from tencentcloud.common.common_client import CommonClient
        except ImportError as e:
            raise RuntimeError(
                "tencentcloud-sdk-python-common is not installed."
                "Run:pip install tencentcloud-sdk-python-common"
            ) from e

        cred = credential.Credential(self._secret_id, self._secret_key)
        http_profile = HttpProfile(endpoint=_ENDPOINT, reqTimeout=30)
        client_profile = ClientProfile(httpProfile=http_profile)
        self._client = CommonClient(
            _PRODUCT, _API_VERSION, cred, _REGION, profile=client_profile
        )
        return self._client

    def _call_sync(self, action: str, params: dict) -> dict:
        """Synchronously call Tencent CommonClient."""
        client = self._get_client()
        return client.call_json(action, params)

    async def _call(self, action: str, params: dict) -> dict:
        return await asyncio.to_thread(self._call_sync, action, params)

    # ---------- External API ----------

    async def ping(self) -> bool:
        """connectivity & Credential validity check. Call the lightweight interface VoicePrintCount."""
        if not self.is_configured:
            return False
        try:
            await self._call("VoicePrintCount", {})
            return True
        except Exception as e:
            logger.warning(f"VPR ping failed: {e}")
            return False

    async def enroll(self, speaker_nick: str, pcm_bytes: bytes) -> str | None:
        """Register the candidate’s voiceprint. Returns the VoicePrintId assigned by Tencent; returns None on failure.

        Args:
            speaker_nick: user-side naming (used in TechSpar techspar_<user_id>)
            pcm_bytes: 16kHz mono 16-bit PCM, recommended ≥6 seconds (≤30 seconds)
        """
        if not self.is_configured:
            return None
        wav_bytes = _wrap_pcm_to_wav(pcm_bytes, _SAMPLE_RATE_16K)
        data_b64 = base64.b64encode(wav_bytes).decode("ascii")
        params = {
            "VoiceFormat": _VOICE_FORMAT_WAV,
            "SampleRate": _SAMPLE_RATE_16K,
            "SpeakerNick": speaker_nick,
            "Data": data_b64,
            "DataLength": len(wav_bytes),
        }
        try:
            resp = await self._call("VoicePrintEnroll", params)
            # Response structure:{"Response": {"Data": {"VoicePrintId": "...", ...}, "RequestId": "..."}}
            inner = resp.get("Response", resp)
            data = inner.get("Data") or {}
            vpid = data.get("VoicePrintId") or inner.get("VoicePrintId")
            if not vpid:
                logger.warning(f"VPR enroll missing VoicePrintId: {inner}")
                return None
            logger.info(f"VPR enrolled: nick={speaker_nick} id={vpid}")
            return vpid
        except Exception as e:
            logger.error(f"VPR enroll failed: {e}")
            return None

    async def verify(self, voice_print_id: str, pcm_bytes: bytes) -> VerifyResult | None:
        """1:1 verification. Returning None indicates that the call failed.

        Args:
            voice_print_id: obtained when enrolling VoicePrintId
            pcm_bytes: 2-5 seconds 16kHz mono PCM
        """
        if not self.is_configured:
            return None
        wav_bytes = _wrap_pcm_to_wav(pcm_bytes, _SAMPLE_RATE_16K)
        data_b64 = base64.b64encode(wav_bytes).decode("ascii")
        params = {
            "VoicePrintId": voice_print_id,
            "VoiceFormat": _VOICE_FORMAT_WAV,
            "SampleRate": _SAMPLE_RATE_16K,
            "Data": data_b64,
            "DataLength": len(wav_bytes),
        }
        try:
            resp = await self._call("VoicePrintVerify", params)
            inner = resp.get("Response", resp)
            data = inner.get("Data") or inner
            # Tencent returns:Decision (0/1) + Score (0-100)
            decision = data.get("Decision")
            score = float(data.get("Score", 0.0) or 0.0)
            matched = bool(decision) if decision is not None else score >= 60.0
            return VerifyResult(matched=matched, score=score, raw=inner)
        except Exception as e:
            logger.warning(f"VPR verify failed: {e}")
            return None

    async def delete(self, voice_print_id: str) -> bool:
        if not self.is_configured:
            return False
        try:
            await self._call("VoicePrintDelete", {"VoicePrintIdSet": [voice_print_id]})
            logger.info(f"VPR deleted: {voice_print_id}")
            return True
        except Exception as e:
            logger.warning(f"VPR delete failed: {e}")
            return False
