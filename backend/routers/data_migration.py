"""Data migration endpoint: export/Import the data of the currently logged in user.

with CLI (scripts/export_data.py、scripts/import_data.py) share
backend.storage.data_Core implementation in migration.

The HTTP portal always attributes data to the currently logged in user (rebind_user_id=user_id), to prevent
Written or leaked across users.
"""
from __future__ import annotations

import shutil
import tempfile
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from backend.auth import get_current_user
from backend.storage.data_migration import (
    SCHEMA_VERSION,
    export_archive,
    import_archive,
)

router = APIRouter(prefix="/api/data")

# Hard cap for single upload——Defensive to prevent the temporary disk from being filled up
MAX_UPLOAD_BYTES = 500 * 1024 * 1024  # 500 MB


def _cleanup_dir(path: Path) -> None:
    # Use rmtree instead of rmdir: rmdir will fail if there are residual files under Windows
    shutil.rmtree(path, ignore_errors=True)


@router.get("/export")
def export_data(
    background: BackgroundTasks,
    user_id: str = Depends(get_current_user),
):
    """Returns all data of the current user in tar.gz format."""
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    tmp_dir = Path(tempfile.mkdtemp(prefix="techspar-export-"))
    archive_path = tmp_dir / f"techspar-backup-{ts}.tar.gz"

    try:
        export_archive(archive_path, user_id=user_id)
    except FileNotFoundError as e:
        _cleanup_dir(tmp_dir)
        raise HTTPException(500, str(e))
    except Exception:
        _cleanup_dir(tmp_dir)
        raise

    background.add_task(_cleanup_dir, tmp_dir)

    return FileResponse(
        archive_path,
        media_type="application/gzip",
        filename=archive_path.name,
    )


@router.post("/import")
async def import_data(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    db_strategy: str = Form("skip"),
    overwrite_files: bool = Form(False),
    user_id: str = Depends(get_current_user),
):
    """Import the uploaded backup archive. All data belongs to the currently logged in user."""
    if db_strategy not in {"skip", "overwrite"}:
        raise HTTPException(400, "db_strategy must be 'skip' or 'overwrite'")

    filename = file.filename or "upload"
    if not (filename.endswith(".tar.gz") or filename.endswith(".tgz")):
        raise HTTPException(400, "Only .tar.gz / .tgz archives are supported")

    tmp_dir = Path(tempfile.mkdtemp(prefix="techspar-import-"))
    archive_path = tmp_dir / "upload.tar.gz"

    total = 0
    try:
        with archive_path.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES:
                    raise HTTPException(413, f"Archive too large (upper limit {MAX_UPLOAD_BYTES // 1024 // 1024} MB)")
                out.write(chunk)

        try:
            result = import_archive(
                archive_path,
                db_strategy=db_strategy,
                overwrite_files=overwrite_files,
                rebind_user_id=user_id,
            )
        except (RuntimeError, ValueError) as e:
            raise HTTPException(400, f"Archive parsing failed: {e}")
    finally:
        background.add_task(_cleanup_dir, tmp_dir)

    return {
        "ok": True,
        "schema_version": result.schema_version,
        "current_schema_version": SCHEMA_VERSION,
        "db_inserted": result.db_inserted,
        "db_skipped": result.db_skipped,
        "files_copied": result.files_copied,
        "files_skipped": result.files_skipped,
    }
