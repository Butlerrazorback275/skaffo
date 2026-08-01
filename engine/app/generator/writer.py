"""The only module allowed to touch the filesystem."""
from __future__ import annotations

import os
import sys
from dataclasses import asdict
from pathlib import Path

from .base import GeneratedFile, UnsafeIdentifier, safe_relpath
from .merge import Action, FilePlan, plan_file


def contained_path(target: Path, rel: str) -> Path:
    """Resolve ``rel`` under ``target`` and refuse to escape it.

    Last line of defence: even if a generator emitted something hostile,
    nothing is ever written outside the project directory.
    """
    rel = safe_relpath(rel)
    root = target.resolve()
    dest = (root / rel).resolve()
    if dest != root and root not in dest.parents:
        raise UnsafeIdentifier(f"path escapes project directory: {rel!r}")
    return dest


def default_workspace() -> Path:
    """Documents/SkaffoProjects on every OS.

    Projects generated before the rename live in `CodeForgeProjects`; that
    folder is reused if it exists so nobody has to move their work.
    """
    if sys.platform == "win32":
        docs = Path(os.environ.get("USERPROFILE", Path.home())) / "Documents"
    else:
        docs = Path.home() / "Documents"
    new = docs / "SkaffoProjects"
    legacy = docs / "CodeForgeProjects"
    if not new.exists() and legacy.exists():
        return legacy
    return new


def resolve_target(raw: str | None, slug: str) -> Path:
    """Expand a stored project path into a real absolute directory."""
    if not raw or raw.strip() in ("", "~", "~/Projects", "~/Projects/"):
        return default_workspace() / slug

    p = Path(raw.strip()).expanduser()

    # "~/Projects/foo" from the UI -> Documents/SkaffoProjects/foo
    if raw.strip().startswith("~/Projects"):
        tail = raw.strip()[len("~/Projects"):].strip("/\\")
        return default_workspace() / (tail or slug)

    if not p.is_absolute():
        return default_workspace() / p

    return _guard_target(p)


# Writing a whole project tree into one of these would be destructive.
_FORBIDDEN_TARGETS = {
    Path("/"), Path("/etc"), Path("/usr"), Path("/bin"), Path("/sbin"),
    Path("/boot"), Path("/dev"), Path("/proc"), Path("/sys"), Path("/var"),
    Path("C:/"), Path("C:/Windows"), Path("C:/Program Files"),
}


def _guard_target(p: Path) -> Path:
    """Refuse obviously destructive output directories."""
    resolved = p.resolve()
    if resolved in {t.resolve() for t in _FORBIDDEN_TARGETS if t.exists()}:
        raise ValueError(f"refusing to generate into system directory: {resolved}")
    if resolved == Path.home().resolve():
        raise ValueError("refusing to generate directly into the home directory")
    return resolved


def build_plan(files: list[GeneratedFile], target: Path) -> list[FilePlan]:
    """Compare rendered output against what's already on disk."""
    plans: list[FilePlan] = []
    for f in files:
        dest = contained_path(target, f.path)
        existing = None
        if dest.exists() and dest.is_file():
            try:
                existing = dest.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                existing = None
        plans.append(plan_file(f.path, f.content, existing))
    return plans


def apply_plan(
    plans: list[FilePlan],
    target: Path,
    *,
    overwrite_conflicts: bool = False,
) -> dict:
    """Write files. Conflicts are skipped unless explicitly allowed."""
    target.mkdir(parents=True, exist_ok=True)

    written = skipped = merged = conflicts = 0
    total_bytes = 0
    conflict_paths: list[str] = []

    for p in plans:
        if p.action is Action.SKIP:
            skipped += 1
            continue

        if p.action is Action.CONFLICT and not overwrite_conflicts:
            conflicts += 1
            conflict_paths.append(p.path)
            continue

        dest = contained_path(target, p.path)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(p.content, encoding="utf-8", newline="\n")

        total_bytes += len(p.content.encode("utf-8"))
        written += 1
        if p.action is Action.MERGE:
            merged += 1

    return {
        "target": str(target),
        "written": written,
        "merged": merged,
        "skipped": skipped,
        "conflicts": conflicts,
        "conflictPaths": conflict_paths,
        "bytes": total_bytes,
    }


def plan_to_dict(p: FilePlan) -> dict:
    d = asdict(p)
    d["action"] = p.action.value
    d.pop("content", None)          # keep the payload small
    return d


def count_lines(files: list[GeneratedFile]) -> int:
    return sum(f.content.count("\n") + 1 for f in files if f.content)
