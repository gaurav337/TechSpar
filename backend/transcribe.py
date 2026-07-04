"""Speech transcription module: two independent links.

Short audio (a few seconds~a few minutes,≤10MB):
    base64 data URI → DashScope qwen3-asr-flash synchronization chat/completions, zero OSS.

Long audio (recording and replay, maybe tens of minutes):
    bytes → Alibaba Cloud OSS (signed URL, expires in 1h)→ DashScope qwen3-asr-flash-filetrans asynchronous + Polling.
"""
import base64
import uuid
import time
import logging
import requests

import oss2

from backend.llm_provider import resolve_dashscope_key, resolve_oss_config

logger = logging.getLogger("uvicorn")

_DASHSCOPE_SYNC = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
_DASHSCOPE_SUBMIT = "https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription"
_DASHSCOPE_QUERY = "https://dashscope.aliyuncs.com/api/v1/tasks/"

# DashScope sync endpoint limit: single input ≤10MB, duration ≤5 minutes.
# base64 will make the volume ×4/3, so the original audio leaves a 7MB safe line.
_SYNC_MAX_RAW_BYTES = 7 * 1024 * 1024

_AUDIO_MIME = {
    ".webm": "audio/webm",
    ".mp3": "audio/mp3",
    ".wav": "audio/wav",
    ".m4a": "audio/m4a",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
}


def transcribe_short(audio_bytes: bytes, suffix: str = ".webm") -> str:
    """Short audio synchronous transcription:base64 data URI → DashScope qwen3-asr-flash.

    Suitable for voice input for answering questions, etc. ≤5min / ≤7MB short snippets, no reliance on object storage.
    Please leave if you exceed the limit. transcribe_long (long audio filetrans link).
    """
    api_key = resolve_dashscope_key()
    if not api_key:
        raise RuntimeError("DASHSCOPE_API_KEY not configured")

    if not audio_bytes:
        raise RuntimeError("empty audio payload")

    if len(audio_bytes) > _SYNC_MAX_RAW_BYTES:
        raise RuntimeError(
            f"audio too large for sync endpoint: {len(audio_bytes)} bytes "
            f"(limit {_SYNC_MAX_RAW_BYTES}); use transcribe_long instead"
        )

    mime = _AUDIO_MIME.get(suffix.lower(), "audio/webm")
    data_uri = f"data:{mime};base64,{base64.b64encode(audio_bytes).decode()}"

    payload = {
        "model": "qwen3-asr-flash",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "input_audio", "input_audio": {"data": data_uri}},
                ],
            }
        ],
        "stream": False,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    resp = requests.post(_DASHSCOPE_SYNC, headers=headers, json=payload, timeout=60)
    if resp.status_code != 200:
        raise RuntimeError(f"DashScope sync ASR failed [{resp.status_code}]: {resp.text}")

    data = resp.json()
    try:
        text = data["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError) as e:
        raise RuntimeError(f"DashScope response missing transcript: {e}; body={data}")

    logger.info(f"Sync transcription done: {len(text)} chars")
    return text


def _upload_to_oss(audio_bytes: bytes, suffix: str) -> str:
    """Upload bytes to Alibaba Cloud OSS, return a signed URL (1h expiry).

    Bucket can stay private — DashScope filetrans pulls via the signature.
    """
    cfg = resolve_oss_config()
    missing = [
        name for name, val in (
            ("ALIYUN_OSS_ACCESS_KEY_ID", cfg["access_key_id"]),
            ("ALIYUN_OSS_ACCESS_KEY_SECRET", cfg["access_key_secret"]),
            ("ALIYUN_OSS_BUCKET", cfg["bucket"]),
            ("ALIYUN_OSS_ENDPOINT", cfg["endpoint"]),
        ) if not val
    ]
    if missing:
        raise RuntimeError(f"Alibaba OSS not configured: missing {', '.join(missing)}")

    auth = oss2.Auth(cfg["access_key_id"], cfg["access_key_secret"])
    bucket = oss2.Bucket(auth, cfg["endpoint"], cfg["bucket"])
    key = f"audio/{uuid.uuid4().hex}{suffix}"

    bucket.put_object(key, audio_bytes)
    # slash_safe=True retains the key "/", to avoid DashScope not being able to retrieve the file
    url = bucket.sign_url("GET", key, 3600, slash_safe=True)
    logger.info(f"Uploaded to OSS: {key}")
    return url


def transcribe_long(audio_bytes: bytes, suffix: str = ".webm") -> str:
    """Asynchronous transcription of long audio: Alibaba Cloud OSS → DashScope qwen3-asr-flash-filetrans polling.

    For recording and replaying scenarios, it can last for dozens of minutes~Hours of taped interviews.
    Please give priority to short audio transcribe_short (faster, zero OSS dependencies).
    """
    api_key = resolve_dashscope_key()
    if not api_key:
        raise RuntimeError("DASHSCOPE_API_KEY not configured")

    file_url = _upload_to_oss(audio_bytes, suffix)

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable",
    }
    payload = {
        "model": "qwen3-asr-flash-filetrans",
        "input": {"file_url": file_url},
        "parameters": {"channel_id": [0]},
    }

    resp = requests.post(_DASHSCOPE_SUBMIT, headers=headers, json=payload)
    if resp.status_code != 200:
        raise RuntimeError(f"Transcription submit failed: {resp.text}")

    task_id = resp.json()["output"]["task_id"]
    logger.info(f"Transcription task: {task_id}")

    query_headers = {"Authorization": f"Bearer {api_key}"}
    for _ in range(300):
        time.sleep(3)
        qr = requests.get(_DASHSCOPE_QUERY + task_id, headers=query_headers)
        output = qr.json().get("output", {})
        status = output.get("task_status", "").upper()

        if status == "SUCCEEDED":
            text = _extract_text(output)
            logger.info(f"Transcription done: {len(text)} chars")
            return text
        elif status in ("FAILED", "UNKNOWN"):
            raise RuntimeError(f"Transcription {status}: {output.get('message', '')}")

    raise RuntimeError("Transcription timed out")


def _extract_text(output: dict) -> str:
    """Fetch transcription result and extract text."""
    # file_url pattern: result.transcription_url (singular)
    result = output.get("result", {})
    url = result.get("transcription_url")
    if not url:
        # file_urls pattern fallback: results[].transcription_url
        for item in output.get("results", []):
            url = item.get("transcription_url")
            if url:
                break
    if not url:
        return ""

    resp = requests.get(url)
    if resp.status_code != 200:
        return ""

    data = resp.json()
    texts = []
    for transcript in data.get("transcripts", []):
        text = transcript.get("text", "")
        if text:
            texts.append(text)
    return "\n".join(texts)
