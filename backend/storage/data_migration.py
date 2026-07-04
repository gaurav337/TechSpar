"""Cross-machine data migration: Export/Import user data as tar.gz.

CLI (scripts/export_data.py、scripts/import_data.py) with HTTP endpoint
(routers/data_migration.py) Share the implementation here.

HTTP side pass `rebind_user_id` All data in the archive will be attributed to the currently logged in user to avoid cross-user
leak / Mismatch; CLI defaults to leaving original user_id to support administrator-level migration of the entire database.
"""
from __future__ import annotations

import io
import json
import shutil
import sqlite3
import tarfile
import tempfile
from contextlib import closing
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from backend.config import settings

SCHEMA_VERSION = 1
EXCLUDE_DIR_NAMES = {".index_cache", "__pycache__"}

# with storage/sessions.py remains consistent; use it to create tables when the target library does not exist
_SESSIONS_DDL = """
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    topic TEXT,
    meta TEXT DEFAULT '{}',
    questions TEXT DEFAULT '[]',
    transcript TEXT DEFAULT '[]',
    scores TEXT DEFAULT '[]',
    weak_points TEXT DEFAULT '[]',
    overall TEXT DEFAULT '{}',
    reference_answers TEXT DEFAULT '{}',
    review TEXT,
    status TEXT DEFAULT 'ongoing',
    review_error TEXT,
    user_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)
"""


def _data_dir() -> Path:
    return settings.base_dir / "data"


def _db_path() -> Path:
    return settings.db_path


def _users_dir() -> Path:
    return _data_dir() / "users"


@dataclass
class ImportResult:
    db_inserted: int = 0
    db_skipped: int = 0
    files_copied: int = 0
    files_skipped: int = 0
    schema_version: int | None = None


def _filter_tar_member(tarinfo: tarfile.TarInfo) -> tarfile.TarInfo | None:
    parts = Path(tarinfo.name).parts
    if any(name in EXCLUDE_DIR_NAMES for name in parts):
        return None
    return tarinfo


def _export_filtered_db(user_id: str, dst: Path) -> None:
    """Generate only the specified user_DB copy of row id.

    use closing() Explicitly closed: sqlite3's with syntax only commit/rollback, not close,
    An unclosed connection on Windows holds a file lock, which makes subsequent tmp_db.unlink() failed.
    """
    src_path = _db_path()
    with closing(sqlite3.connect(str(src_path))) as src, \
         closing(sqlite3.connect(str(dst))) as dst_conn:
        src.backup(dst_conn)
        dst_conn.execute("DELETE FROM sessions WHERE user_id != ?", (user_id,))
        dst_conn.commit()
    with closing(sqlite3.connect(str(dst))) as dst_conn:
        dst_conn.execute("VACUUM")


def export_archive(
    output_path: Path,
    *,
    user_id: str | None = None,
) -> Path:
    """Pack data/ for tar.gz.

    user_id=None means export all users (CLI only); specify user_id, only the user is exported.
    Return output_path (write completion confirmed).
    """
    data_dir = _data_dir()
    if not data_dir.exists():
        raise FileNotFoundError(f"data directory does not exist: {data_dir}")

    output_path = Path(output_path).resolve()
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "exported_at": datetime.now().isoformat(timespec="seconds"),
        "user_id": user_id,
        "source": str(data_dir),
    }

    tmp_db: Path | None = None
    db_source = _db_path()
    if user_id and db_source.exists():
        ts = datetime.now().strftime("%Y%m%d-%H%M%S")
        tmp_db = output_path.parent / f".techspar-export-{ts}.db"
        _export_filtered_db(user_id, tmp_db)
        db_source = tmp_db

    try:
        with tarfile.open(output_path, "w:gz") as tar:
            manifest_bytes = json.dumps(manifest, indent=2, ensure_ascii=False).encode("utf-8")
            info = tarfile.TarInfo("manifest.json")
            info.size = len(manifest_bytes)
            info.mtime = int(datetime.now().timestamp())
            tar.addfile(info, io.BytesIO(manifest_bytes))

            if db_source.exists():
                tar.add(db_source, arcname="data/interviews.db")

            users_dir = _users_dir()
            if users_dir.exists():
                if user_id:
                    udir = users_dir / user_id
                    if udir.exists():
                        tar.add(udir, arcname=f"data/users/{user_id}", filter=_filter_tar_member)
                else:
                    tar.add(users_dir, arcname="data/users", filter=_filter_tar_member)
    finally:
        if tmp_db and tmp_db.exists():
            tmp_db.unlink()

    return output_path


def _safe_extract(tar: tarfile.TarFile, dest: Path) -> None:
    dest_resolved = dest.resolve()
    for member in tar.getmembers():
        target = (dest / member.name).resolve()
        if not str(target).startswith(str(dest_resolved)):
            raise RuntimeError(f"archive contains out-of-bounds paths: {member.name}")
    try:
        tar.extractall(dest, filter="data")
    except TypeError:
        tar.extractall(dest)


def _merge_db(
    src_db: Path,
    dst_db: Path,
    *,
    strategy: str,
    rebind_user_id: str | None = None,
) -> tuple[int, int]:
    """Merge sessions table and return (Number of lines written, number of lines skipped).

    rebind_user_When id is non-empty, all rows in the archive user_id is rewritten to this value——For HTTP import,
    Prevent cross-user writing; also support cross-machine migration (user_id is different on the new machine).
    """
    if not dst_db.exists() and rebind_user_id is None:
        dst_db.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src_db, dst_db)
        with sqlite3.connect(str(dst_db)) as c:
            total = c.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
        return total, 0

    dst_db.parent.mkdir(parents=True, exist_ok=True)
    src = sqlite3.connect(str(src_db))
    dst = sqlite3.connect(str(dst_db))
    try:
        dst.execute(_SESSIONS_DDL)

        src_cols = [r[1] for r in src.execute("PRAGMA table_info(sessions)")]
        dst_cols = {r[1] for r in dst.execute("PRAGMA table_info(sessions)")}
        common = [c for c in src_cols if c in dst_cols]
        if "session_id" not in common:
            raise RuntimeError("session_The id column is missing and cannot be merged")

        existing = {r[0] for r in dst.execute("SELECT session_id FROM sessions")}
        rows = src.execute(f"SELECT {', '.join(common)} FROM sessions").fetchall()

        sid_idx = common.index("session_id")
        uid_idx = common.index("user_id") if "user_id" in common else -1

        inserted = 0
        skipped = 0
        for row in rows:
            row = list(row)
            if rebind_user_id is not None and uid_idx >= 0:
                row[uid_idx] = rebind_user_id
            sid = row[sid_idx]
            if sid in existing:
                if strategy == "overwrite":
                    set_cols = [c for c in common if c != "session_id"]
                    assigns = ", ".join(f"{c} = ?" for c in set_cols)
                    vals = [row[common.index(c)] for c in set_cols]
                    dst.execute(f"UPDATE sessions SET {assigns} WHERE session_id = ?", vals + [sid])
                    inserted += 1
                else:
                    skipped += 1
            else:
                placeholders = ", ".join(["?"] * len(common))
                dst.execute(
                    f"INSERT INTO sessions ({', '.join(common)}) VALUES ({placeholders})",
                    row,
                )
                inserted += 1
        dst.commit()
        return inserted, skipped
    finally:
        src.close()
        dst.close()


def _merge_users(
    src_users: Path,
    dst_users: Path,
    *,
    overwrite: bool,
    rebind_user_id: str | None = None,
) -> tuple[int, int]:
    """Copy data/users/ file under.

    rebind_user_When id is not empty, it can be any number in the archive. <some_id>/ The contents of the directory are written to
    <rebind_user_id>/ Below; used for HTTP import to attribute data to the currently logged in user.
    """
    copied = 0
    skipped = 0
    for src_file in src_users.rglob("*"):
        if not src_file.is_file():
            continue
        rel = src_file.relative_to(src_users)
        if rebind_user_id is not None:
            parts = list(rel.parts)
            if not parts:
                continue
            parts[0] = rebind_user_id
            rel = Path(*parts)
        dst_file = dst_users / rel
        if dst_file.exists() and not overwrite:
            skipped += 1
            continue
        dst_file.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src_file, dst_file)
        copied += 1
    return copied, skipped


def import_archive(
    archive_path: Path,
    *,
    db_strategy: str = "skip",
    overwrite_files: bool = False,
    rebind_user_id: str | None = None,
) -> ImportResult:
    """import export_tar.gz generated by archive.

    db_strategy: session_When id conflicts 'skip' Keep local,'overwrite' Overwrite with archive.
    overwrite_files: Whether to overwrite the local file when there is a file conflict.
    rebind_user_id: HTTP entry must be passed——File the archived data into this user_id.
    """
    if db_strategy not in {"skip", "overwrite"}:
        raise ValueError("db_strategy must be 'skip' or 'overwrite'")

    archive_path = Path(archive_path).resolve()
    if not archive_path.exists():
        raise FileNotFoundError(f"Archive not found: {archive_path}")

    result = ImportResult()

    with tempfile.TemporaryDirectory() as td_str:
        td = Path(td_str)
        with tarfile.open(archive_path, "r:gz") as tar:
            _safe_extract(tar, td)

        manifest_path = td / "manifest.json"
        if manifest_path.exists():
            try:
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                result.schema_version = manifest.get("schema_version")
            except json.JSONDecodeError:
                pass

        data_dir = _data_dir()
        data_dir.mkdir(parents=True, exist_ok=True)

        src_db = td / "data" / "interviews.db"
        if src_db.exists():
            ins, skip = _merge_db(
                src_db,
                _db_path(),
                strategy=db_strategy,
                rebind_user_id=rebind_user_id,
            )
            result.db_inserted = ins
            result.db_skipped = skip

        src_users = td / "data" / "users"
        if src_users.exists():
            copied, skipped = _merge_users(
                src_users,
                _users_dir(),
                overwrite=overwrite_files,
                rebind_user_id=rebind_user_id,
            )
            result.files_copied = copied
            result.files_skipped = skipped

    return result
