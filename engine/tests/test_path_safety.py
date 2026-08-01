"""Regression tests for generator path traversal.

Reported issue: table names flow straight into `models/<name>.py`, and the
`snake` filter only lowercased and swapped hyphens. A name like
`../../../evil` escaped the project directory.

Defence is layered:
  1. safe_identifier()  — strips separators/traversal from every name
  2. GeneratedFile      — validates its path on construction
  3. contained_path()   — writer refuses to resolve outside the target
"""
from __future__ import annotations

from pathlib import Path

import pytest

from app.generator.base import (
    GeneratedFile, GenContext, UnsafeIdentifier, safe_identifier, safe_relpath,
)
from app.generator.writer import contained_path


# ── layer 1: identifier sanitising ───────────────────────
@pytest.mark.parametrize(
    "raw,expected",
    [
        ("../../../evil", "evil"),
        ("../../../../escaped/OWNED", "escaped_owned"),
        ("..", "table"),                    # nothing usable -> fallback path
        ("users", "users"),
        ("my-table", "my_table"),
        ("My Table", "my_table"),
        ("C:\\Windows\\system32", "c_windows_system32"),
        ("/etc/passwd", "etc_passwd"),
        ("table;DROP TABLE x", "table_drop_table_x"),
        ("2fast", "table_2fast"),           # cannot start with a digit
        ("class", "class_"),                # python keyword
        ("con", "con_"),                    # reserved on Windows
        ("....//....//x", "x"),
        ("tab\nname", "tab_name"),
        ("emoji🔥name", "emoji_name"),
    ],
)
def test_safe_identifier(raw, expected):
    if expected == "table":
        with pytest.raises(UnsafeIdentifier):
            safe_identifier(raw)
    else:
        assert safe_identifier(raw) == expected


def test_safe_identifier_never_contains_separators():
    for raw in ["../x", "a/b", "a\\b", "..", ".", "///", "a/../b"]:
        try:
            out = safe_identifier(raw)
        except UnsafeIdentifier:
            continue
        assert "/" not in out and "\\" not in out and ".." not in out


def test_safe_identifier_rejects_empty():
    for raw in ["", "   ", "...", "///", "___"]:
        with pytest.raises(UnsafeIdentifier):
            safe_identifier(raw)


# ── layer 2: GeneratedFile validates on construction ─────
def test_generated_file_rejects_traversal():
    for bad in [
        "backend/app/models/../../../evil.py",
        "../outside.py",
        "/etc/passwd",
        "C:/Windows/evil.py",
        "a/../../b.py",
    ]:
        with pytest.raises(UnsafeIdentifier):
            GeneratedFile(bad, "content")


def test_generated_file_accepts_normal_paths():
    f = GeneratedFile("backend/app/models/user.py", "x")
    assert f.path == "backend/app/models/user.py"
    assert GeneratedFile("backend\\app\\main.py", "x").path == "backend/app/main.py"


# ── layer 3: writer containment ──────────────────────────
def test_contained_path_blocks_escape(tmp_path: Path):
    for bad in ["../evil.py", "a/../../evil.py", "/abs/evil.py"]:
        with pytest.raises(UnsafeIdentifier):
            contained_path(tmp_path, bad)


def test_contained_path_allows_nested(tmp_path: Path):
    dest = contained_path(tmp_path, "backend/app/models/user.py")
    assert dest.is_relative_to(tmp_path.resolve())


# ── end to end ───────────────────────────────────────────
def _ctx(table_name: str) -> GenContext:
    project = {
        "name": "Test Project",
        "description": "",
        "stack": {"backend": "fastapi", "frontend": "react",
                  "database": "sqlite", "auth": "none", "docker": False},
    }
    tables = [{
        "id": "t1", "name": table_name, "color": "#6366F1",
        "position": {"x": 0, "y": 0},
        "columns": [
            {"id": "c1", "name": "id", "type": "integer",
             "primaryKey": True, "nullable": False, "unique": True, "defaultValue": None},
            {"id": "c2", "name": "../../evil_col", "type": "string",
             "primaryKey": False, "nullable": True, "unique": False, "defaultValue": None},
        ],
    }]
    return GenContext(project=project, tables=tables, relations=[],
                      endpoints=[], crud_options={})


def test_generation_with_hostile_table_name_stays_contained(tmp_path: Path):
    from app.generator import run_all
    from app.generator.writer import apply_plan, build_plan

    files = run_all(_ctx("../../../../escaped/OWNED"))

    for f in files:
        assert not f.path.startswith("/")
        assert ".." not in f.path.split("/")

    apply_plan(build_plan(files, tmp_path), tmp_path)

    root = tmp_path.resolve()
    for written in tmp_path.rglob("*"):
        assert written.resolve().is_relative_to(root)


def test_hostile_project_name_slug(tmp_path: Path):
    ctx = _ctx("users")
    ctx.project["name"] = "../../../etc"
    assert ".." not in ctx.slug
    assert "/" not in ctx.slug
    assert "/" not in ctx.snake and ".." not in ctx.snake


def test_hostile_column_name_is_sanitised():
    from app.generator import run_all

    files = run_all(_ctx("items"))
    model = next(f for f in files if f.path.endswith("models/item.py"))
    assert "../" not in model.content
    assert "evil_col" in model.content
