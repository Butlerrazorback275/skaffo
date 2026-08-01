"""Runtime configuration for the Skaffo engine."""
from __future__ import annotations

import os
import sys
from pathlib import Path


def _base_dir() -> Path:
    if sys.platform == "win32":
        return Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support"
    return Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))


def _default_data_dir() -> Path:
    """Per-OS location for skaffo.db (survives app updates)."""
    return _base_dir() / "Skaffo"


def adopt_legacy_data(data_dir: Path) -> str | None:
    """Carry a pre-rename database over to the new location.

    The product was called CodeForge until v0.8, so an existing install has
    its projects in `CodeForgeStudio/codeforge.db`. Losing that on upgrade
    would be unforgivable, so the file is copied (never moved — the old copy
    stays as a safety net) the first time the new build runs.
    """
    new_db = data_dir / "skaffo.db"
    if new_db.exists():
        return None

    legacy_dir = _base_dir() / "CodeForgeStudio"
    legacy_db = legacy_dir / "codeforge.db"
    if not legacy_db.exists():
        return None

    import shutil

    data_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(legacy_db, new_db)
    # WAL sidecars hold committed pages that are not yet in the main file.
    for suffix in ("-wal", "-shm"):
        sidecar = legacy_db.with_name(legacy_db.name + suffix)
        if sidecar.exists():
            shutil.copy2(sidecar, new_db.with_name(new_db.name + suffix))

    return str(legacy_db)


class Settings:
    APP_NAME = "Skaffo Engine"
    VERSION = "0.2.0"

    # Electron passes --port; fall back to env then default.
    PORT: int = int(os.environ.get("SKAFFO_PORT", "8731"))
    HOST: str = os.environ.get("SKAFFO_HOST", "127.0.0.1")

    DATA_DIR: Path = Path(os.environ.get("SKAFFO_DATA_DIR", _default_data_dir()))

    @property
    def db_path(self) -> Path:
        return self.DATA_DIR / "skaffo.db"

    @property
    def database_url(self) -> str:
        return f"sqlite:///{self.db_path}"

    # Renderer runs on file:// in prod and localhost in dev.
    CORS_ORIGINS = [
        "http://localhost:5273",
        "http://127.0.0.1:5273",
    ]


settings = Settings()
settings.DATA_DIR.mkdir(parents=True, exist_ok=True)

# Must run before SQLAlchemy opens a connection, otherwise it creates an
# empty database and the user's real one is never picked up.
_adopted = adopt_legacy_data(settings.DATA_DIR)
if _adopted:
    print(f"[engine] imported existing data from {_adopted}", flush=True)
