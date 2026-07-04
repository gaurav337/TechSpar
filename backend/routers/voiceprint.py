"""Voiceprint management routes."""

from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from backend.auth import get_current_user
from backend.models import VoiceprintCredentials

router = APIRouter(prefix="/api")


@router.get("/voiceprint/status")
def voiceprint_status(user_id: str = Depends(get_current_user)):
    """Returns the user voiceprint configuration status (not configured/Configured but not registered/registered)."""
    from backend.copilot import voiceprint_store

    return voiceprint_store.status_summary(user_id)


@router.put("/voiceprint/credentials")
async def voiceprint_put_credentials(
    payload: VoiceprintCredentials,
    user_id: str = Depends(get_current_user),
):
    """Save Tencent Cloud credentials. Before saving, ping to verify validity."""
    from backend.copilot import voiceprint_store
    from backend.copilot.voiceprint import VoiceprintClient

    client = VoiceprintClient(
        secret_id=payload.secret_id,
        secret_key=payload.secret_key,
        app_id=payload.app_id,
    )
    if not await client.ping():
        raise HTTPException(400, "Tencent Cloud credentials are invalid or the network is unavailable, please check SecretId / SecretKey")

    data = voiceprint_store.load(user_id)
    data["credentials"] = payload.model_dump()
    voiceprint_store.save(user_id, data)
    return {"ok": True}


@router.post("/voiceprint/enroll")
async def voiceprint_enroll(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user),
):
    """Upload a WAV file to register the candidate's voiceprint. The frontend should record ≥6 seconds 16kHz mono WAV."""
    from backend.copilot import voiceprint_store
    from backend.copilot.voiceprint import extract_pcm_from_wav

    client = voiceprint_store.get_client(user_id)
    if client is None:
        raise HTTPException(400, "Please configure Tencent Cloud credentials on the settings page first")

    wav_bytes = await file.read()
    if not wav_bytes:
        raise HTTPException(400, "The uploaded file is empty")
    try:
        pcm_bytes = extract_pcm_from_wav(wav_bytes)
    except ValueError as exc:
        raise HTTPException(400, f"WAV parsing failed:{exc}")

    if len(pcm_bytes) < 64000:
        raise HTTPException(400, "The recording is too short, at least 2 seconds")

    speaker_nick = f"techspar_{user_id}"
    voice_print_id = await client.enroll(speaker_nick, pcm_bytes)
    if not voice_print_id:
        raise HTTPException(500, "Tencent Cloud voiceprint registration failed, please check the log")

    data = voiceprint_store.load(user_id)
    data["enrollment"] = {
        "voice_print_id": voice_print_id,
        "speaker_nick": speaker_nick,
        "enrolled_at": datetime.now().isoformat(),
    }
    voiceprint_store.save(user_id, data)
    return {"ok": True, "enrolled_at": data["enrollment"]["enrolled_at"]}


@router.delete("/voiceprint/enroll")
async def voiceprint_unenroll(user_id: str = Depends(get_current_user)):
    """Delete registered voiceprint (local + Tencent Cloud). Keep credentials."""
    from backend.copilot import voiceprint_store

    voice_print_id = voiceprint_store.get_voice_print_id(user_id)
    if voice_print_id:
        client = voiceprint_store.get_client(user_id)
        if client is not None:
            await client.delete(voice_print_id)

    data = voiceprint_store.load(user_id)
    data.pop("enrollment", None)
    voiceprint_store.save(user_id, data)
    return {"ok": True}
