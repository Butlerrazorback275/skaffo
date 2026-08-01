"""Export engine — ZIP archives, diffs and run scripts.

Follows the project rule: generators stay pure, and every byte that
reaches the disk goes through the containment checks in writer.py.
"""
from __future__ import annotations

import difflib
import io
import os
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from ..generator.base import GeneratedFile, UnsafeIdentifier, safe_relpath
from ..generator.merge import Action, FilePlan

# Never ship these, even if something odd ends up in the output list.
EXCLUDE_DIRS = {
    "__pycache__", ".venv", "venv", "node_modules", ".git",
    "dist", "build", ".pytest_cache", ".mypy_cache", ".ruff_cache",
}
EXCLUDE_SUFFIX = {".pyc", ".pyo", ".log", ".db", ".sqlite3"}


def _is_excluded(rel: str) -> bool:
    parts = rel.split("/")
    if any(p in EXCLUDE_DIRS for p in parts):
        return True
    return any(rel.endswith(s) for s in EXCLUDE_SUFFIX)


def build_zip(files: list[GeneratedFile], root_name: str) -> bytes:
    """Pack generated files into a ZIP held in memory.

    Everything sits under a single top-level folder so extracting never
    scatters files across the user's Downloads.
    """
    safe_root = safe_relpath(root_name).strip("/") or "project"
    buffer = io.BytesIO()

    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        # Fixed timestamp keeps archives reproducible for identical input.
        stamp = (2026, 1, 1, 0, 0, 0)
        for f in sorted(files, key=lambda x: x.path):
            rel = safe_relpath(f.path)
            if _is_excluded(rel):
                continue
            info = zipfile.ZipInfo(f"{safe_root}/{rel}", date_time=stamp)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o755 if f.executable else 0o644) << 16
            archive.writestr(info, f.content.encode("utf-8"))

    return buffer.getvalue()


def write_zip(files: list[GeneratedFile], destination: Path, root_name: str) -> dict:
    """Write the archive to disk and report on it."""
    destination = destination.expanduser()
    if destination.is_dir():
        destination = destination / f"{root_name}.zip"
    if destination.suffix.lower() != ".zip":
        destination = destination.with_suffix(".zip")

    destination.parent.mkdir(parents=True, exist_ok=True)
    payload = build_zip(files, root_name)
    destination.write_bytes(payload)

    uncompressed = sum(len(f.content.encode("utf-8")) for f in files)
    return {
        "path": str(destination),
        "bytes": len(payload),
        "uncompressed": uncompressed,
        "files": len(files),
        "ratio": round(100 * (1 - len(payload) / uncompressed), 1) if uncompressed else 0,
    }


def default_zip_path(slug: str) -> Path:
    """Sibling of the project folder: Documents/SkaffoProjects/<slug>.zip"""
    from ..generator.writer import default_workspace

    return default_workspace() / f"{slug}.zip"


# ── diffs ────────────────────────────────────────────────
def file_diff(target: Path, plan: FilePlan, context: int = 3) -> dict:
    """Unified diff between what is on disk and what would be written."""
    from ..generator.writer import contained_path

    try:
        dest = contained_path(target, plan.path)
    except UnsafeIdentifier as exc:
        return {"path": plan.path, "error": str(exc), "lines": []}

    old_text = ""
    if dest.exists() and dest.is_file():
        try:
            old_text = dest.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            return {"path": plan.path, "error": "binary file", "lines": []}

    old_lines = old_text.splitlines(keepends=True)
    new_lines = plan.content.splitlines(keepends=True)

    diff = difflib.unified_diff(
        old_lines, new_lines,
        fromfile=f"a/{plan.path}", tofile=f"b/{plan.path}",
        n=context,
    )

    lines: list[dict] = []
    added = removed = 0
    for raw in diff:
        text = raw.rstrip("\n")
        if text.startswith("+++") or text.startswith("---"):
            kind = "meta"
        elif text.startswith("@@"):
            kind = "hunk"
        elif text.startswith("+"):
            kind = "add"
            added += 1
        elif text.startswith("-"):
            kind = "remove"
            removed += 1
        else:
            kind = "context"
        lines.append({"kind": kind, "text": text})

    return {
        "path": plan.path,
        "action": plan.action.value,
        "added": added,
        "removed": removed,
        "keptRegions": plan.kept_regions,
        "lines": lines[:600],          # keep the payload sane for huge files
        "truncated": len(lines) > 600,
    }


def summarize_plans(plans: list[FilePlan]) -> dict:
    counts: dict[str, int] = {}
    for p in plans:
        counts[p.action.value] = counts.get(p.action.value, 0) + 1
    return {
        "counts": counts,
        "changed": sum(1 for p in plans if p.action is not Action.SKIP),
        "total": len(plans),
    }


# ── run scripts ──────────────────────────────────────────
RUN_BAT = r"""@echo off
REM Generated by Skaffo — one-shot setup and run.
setlocal

cd /d "%~dp0"

echo ============================================
echo  {name}
echo ============================================
echo.

REM ---------- backend ----------
if not exist "backend\.venv" (
  echo [1/4] Creating Python virtualenv...
  python -m venv backend\.venv
  if errorlevel 1 (
    echo.
    echo ERROR: Python not found. Install Python 3.10+ from python.org
    echo and make sure "Add Python to PATH" is checked.
    pause
    exit /b 1
  )
) else (
  echo [1/4] Virtualenv already exists.
)

echo [2/4] Installing backend dependencies...
backend\.venv\Scripts\python -m pip install --upgrade pip -q
backend\.venv\Scripts\pip install -r backend\requirements.txt -q
if errorlevel 1 (
  echo ERROR: pip install failed. Check your connection.
  pause
  exit /b 1
)

REM ---------- frontend ----------
if not exist "frontend\node_modules" (
  echo [3/4] Installing frontend dependencies...
  pushd frontend
  call npm install
  popd
) else (
  echo [3/4] node_modules already present.
)

echo [4/4] Starting servers...
echo.
echo   Backend  http://127.0.0.1:8000/docs
echo   Frontend http://localhost:5173
echo.

start "backend" cmd /k "cd /d %~dp0backend && .venv\Scripts\uvicorn app.main:app --reload"
start "frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo Two windows opened. Close them to stop the servers.
pause
"""

RUN_SH = r"""#!/usr/bin/env bash
# Generated by Skaffo — one-shot setup and run.
set -e
cd "$(dirname "$0")"

echo "============================================"
echo " {name}"
echo "============================================"

# ---------- backend ----------
if [ ! -d backend/.venv ]; then
  echo "[1/4] Creating Python virtualenv..."
  python3 -m venv backend/.venv
else
  echo "[1/4] Virtualenv already exists."
fi

echo "[2/4] Installing backend dependencies..."
backend/.venv/bin/python -m pip install --upgrade pip -q
backend/.venv/bin/pip install -r backend/requirements.txt -q

# ---------- frontend ----------
if [ ! -d frontend/node_modules ]; then
  echo "[3/4] Installing frontend dependencies..."
  (cd frontend && npm install)
else
  echo "[3/4] node_modules already present."
fi

echo "[4/4] Starting servers..."
echo "  Backend  http://127.0.0.1:8000/docs"
echo "  Frontend http://localhost:5173"

trap 'kill 0' EXIT
(cd backend && .venv/bin/uvicorn app.main:app --reload) &
(cd frontend && npm run dev) &
wait
"""


def run_scripts(project_name: str) -> list[GeneratedFile]:
    """A double-clickable launcher for the generated project."""
    safe_name = str(project_name).replace("%", "").replace("^", "").replace("&", "")
    return [
        GeneratedFile("run.bat", RUN_BAT.replace("{name}", safe_name)),
        GeneratedFile("run.sh", RUN_SH.replace("{name}", safe_name), executable=True),
    ]


# ── reveal in file manager ───────────────────────────────
def reveal_in_explorer(path: Path) -> bool:
    """Open the OS file manager at `path`. Never raises."""
    import subprocess

    target = Path(path).expanduser()
    if not target.exists():
        return False
    try:
        if sys.platform == "win32":
            os.startfile(str(target))                      # noqa: S606
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(target)])
        else:
            subprocess.Popen(["xdg-open", str(target)])
        return True
    except Exception:
        return False


def export_report(
    *, target: Path, plans: list[FilePlan], files: list[GeneratedFile],
    written: int, merged: int, skipped: int, conflicts: int,
) -> dict:
    """Human-readable summary shown after an export."""
    by_area: dict[str, int] = {}
    for f in files:
        area = f.path.split("/")[0] if "/" in f.path else "root"
        by_area[area] = by_area.get(area, 0) + 1

    total_lines = sum(f.content.count("\n") + 1 for f in files if f.content)
    total_bytes = sum(len(f.content.encode("utf-8")) for f in files)

    return {
        "target": str(target),
        "at": datetime.now(timezone.utc).isoformat(),
        "files": len(files),
        "lines": total_lines,
        "bytes": total_bytes,
        "written": written,
        "merged": merged,
        "skipped": skipped,
        "conflicts": conflicts,
        "byArea": dict(sorted(by_area.items(), key=lambda kv: -kv[1])),
        "largest": sorted(
            ({"path": f.path, "bytes": len(f.content.encode("utf-8"))} for f in files),
            key=lambda x: -x["bytes"],
        )[:5],
    }
