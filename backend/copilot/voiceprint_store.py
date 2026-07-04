"""Per-user JSON persistence of user voiceprint configuration.

File path:data/users/{user_id}/voiceprint.json

Structure:
{
  "credentials": { "secret_id": "...", "secret_key": "...", "app_id": "" },
  "enrollment":  { "voice_print_id": "...", "speaker_nick": "...", "enrolled_at": "..." }
}

Both parts are optional:
- No credentials → The voiceprint function is not enabled and the UI falls back to the manual button
- There are credentials but no enrollment → The user has provided credentials but has not yet recorded their voiceprint.
- Have both → Fully enabled, real-time pipeline automatic identification role
"""
from __future__ import annotations

import json
from typing import Any

from backend.config import settings
from backend.copilot.voiceprint import VoiceprintClient


def _voiceprint_file(user_id: str):
    return settings.user_data_dir(user_id) / "voiceprint.json"


def load(user_id: str) -> dict[str, Any]:
    path = _voiceprint_file(user_id)
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8")) or {}
    except (json.JSONDecodeError, OSError):
        return {}


def save(user_id: str, data: dict[str, Any]) -> None:
    path = _voiceprint_file(user_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def delete(user_id: str) -> None:
    path = _voiceprint_file(user_id)
    if path.exists():
        path.unlink()


def get_client(user_id: str) -> VoiceprintClient | None:
    """Constructs VoiceprintClient from user configuration. Returns None if not configured or with incomplete credentials."""
    if settings.high_security_mode:
        return None
    data = load(user_id)
    creds = (data or {}).get("credentials") or {}
    secret_id = creds.get("secret_id") or ""
    secret_key = creds.get("secret_key") or ""
    if not secret_id or not secret_key:
        return None
    return VoiceprintClient(
        secret_id=secret_id,
        secret_key=secret_key,
        app_id=creds.get("app_id") or "",
    )


def get_voice_print_id(user_id: str) -> str | None:
    """Read the user's registered VoicePrintId (returns None if not registered)."""
    data = load(user_id)
    enrollment = (data or {}).get("enrollment") or {}
    return enrollment.get("voice_print_id") or None


def status_summary(user_id: str) -> dict[str, Any]:
    """give GET /api/voiceprint/Status summary for status."""
    if settings.high_security_mode:
        return {
            "configured": False,
            "enrolled": False,
            "enrolled_at": None,
            "speaker_nick": None,
        }
    data = load(user_id)
    creds = (data or {}).get("credentials") or {}
    enrollment = (data or {}).get("enrollment") or {}
    return {
        "configured": bool(creds.get("secret_id") and creds.get("secret_key")),
        "enrolled": bool(enrollment.get("voice_print_id")),
        "enrolled_at": enrollment.get("enrolled_at"),
        "speaker_nick": enrollment.get("speaker_nick"),
    }
