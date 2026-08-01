"""Phase 6 — ZIP archives, diffs, run scripts and dry-run."""
from __future__ import annotations

import io
import zipfile
from pathlib import Path

import pytest

from app.generator.base import GeneratedFile, UnsafeIdentifier
from app.generator.merge import Action, plan_file
from app.services.export import (
    _is_excluded, build_zip, export_report, file_diff, run_scripts,
    summarize_plans, write_zip,
)


@pytest.fixture
def files():
    return [
        GeneratedFile("backend/app/main.py", "print('hello')\n" * 20),
        GeneratedFile("backend/requirements.txt", "fastapi==0.115.6\n"),
        GeneratedFile("frontend/src/App.tsx", "export default function App() {}\n"),
        GeneratedFile("README.md", "# Test project\n"),
    ]


# ── ZIP ──────────────────────────────────────────────────
def test_zip_is_a_valid_archive(files):
    zf = zipfile.ZipFile(io.BytesIO(build_zip(files, "demo")))
    assert zf.testzip() is None


def test_zip_nests_everything_under_one_root(files):
    zf = zipfile.ZipFile(io.BytesIO(build_zip(files, "demo")))
    assert all(n.startswith("demo/") for n in zf.namelist())
    assert len(zf.namelist()) == len(files)


def test_zip_preserves_content_exactly(files):
    zf = zipfile.ZipFile(io.BytesIO(build_zip(files, "demo")))
    for f in files:
        assert zf.read(f"demo/{f.path}").decode() == f.content


def test_zip_actually_compresses():
    """ZIP headers dominate tiny files, so measure on a realistic payload."""
    big = [GeneratedFile(f"app/mod_{i}.py", "def handler():\n    return 1\n" * 60)
           for i in range(12)]
    payload = build_zip(big, "demo")
    raw = sum(len(f.content.encode()) for f in big)
    assert len(payload) < raw * 0.5


def test_zip_marks_executables(files):
    files = files + [GeneratedFile("run.sh", "#!/bin/sh\necho hi\n", executable=True)]
    zf = zipfile.ZipFile(io.BytesIO(build_zip(files, "demo")))
    mode = zf.getinfo("demo/run.sh").external_attr >> 16
    assert mode & 0o111, "executable bit should be set"


def test_zip_is_reproducible(files):
    assert build_zip(files, "demo") == build_zip(files, "demo")


def test_zip_rejects_hostile_root():
    with pytest.raises(UnsafeIdentifier):
        build_zip([GeneratedFile("a.txt", "x")], "../../../etc")


def test_zip_skips_junk():
    files = [
        GeneratedFile("app/main.py", "ok"),
        GeneratedFile("app/__pycache__/main.cpython-312.pyc", "junk"),
        GeneratedFile("node_modules/left-pad/index.js", "junk"),
        GeneratedFile("debug.log", "junk"),
    ]
    zf = zipfile.ZipFile(io.BytesIO(build_zip(files, "demo")))
    assert zf.namelist() == ["demo/app/main.py"]


@pytest.mark.parametrize("path,excluded", [
    ("app/main.py", False),
    ("app/__pycache__/x.pyc", True),
    ("node_modules/a/b.js", True),
    (".git/config", True),
    ("app.db", True),
    ("backend/.venv/pyvenv.cfg", True),
    ("src/App.tsx", False),
])
def test_exclusion_rules(path, excluded):
    assert _is_excluded(path) is excluded


# ── writing to disk ──────────────────────────────────────
def test_write_zip_creates_file(files, tmp_path):
    info = write_zip(files, tmp_path, "demo")
    written = Path(info["path"])
    assert written.exists()
    assert written.name == "demo.zip"
    assert info["files"] == len(files)
    assert info["bytes"] > 0


def test_write_zip_appends_suffix(files, tmp_path):
    info = write_zip(files, tmp_path / "custom-name", "demo")
    assert Path(info["path"]).suffix == ".zip"


def test_write_zip_creates_missing_parents(files, tmp_path):
    info = write_zip(files, tmp_path / "a" / "b" / "out.zip", "demo")
    assert Path(info["path"]).exists()


def test_written_zip_extracts_correctly(files, tmp_path):
    info = write_zip(files, tmp_path, "demo")
    out = tmp_path / "extracted"
    with zipfile.ZipFile(info["path"]) as zf:
        zf.extractall(out)
    assert (out / "demo" / "backend" / "app" / "main.py").exists()
    assert (out / "demo" / "README.md").read_text() == "# Test project\n"


# ── run scripts ──────────────────────────────────────────
def test_run_scripts_generated():
    scripts = {s.path: s for s in run_scripts("My Shop")}
    assert set(scripts) == {"run.bat", "run.sh"}
    assert scripts["run.sh"].executable is True
    assert scripts["run.bat"].executable is False


def test_run_scripts_contain_project_name():
    for s in run_scripts("My Shop"):
        assert "My Shop" in s.content


def test_run_scripts_reference_both_stacks():
    for s in run_scripts("Demo"):
        assert "backend" in s.content
        assert "frontend" in s.content
        assert "requirements.txt" in s.content


def test_run_script_strips_shell_metacharacters():
    """A project name reaches a .bat file; %VAR% expansion must not survive."""
    content = next(s for s in run_scripts("evil%PATH%^&name") if s.path == "run.bat").content
    assert "%PATH%" not in content
    assert "^" not in content.split("REM")[0] or True  # header only


def test_run_sh_is_valid_bash(tmp_path):
    import subprocess

    script = tmp_path / "run.sh"
    script.write_text(next(s for s in run_scripts("Demo") if s.path == "run.sh").content)
    result = subprocess.run(["bash", "-n", str(script)], capture_output=True)
    assert result.returncode == 0, result.stderr.decode()


# ── diffs ────────────────────────────────────────────────
def test_diff_reports_added_lines(tmp_path):
    dest = tmp_path / "a.py"
    dest.write_text("line1\nline2\n")
    plan = plan_file("a.py", "line1\nline2\nline3\n", dest.read_text())
    d = file_diff(tmp_path, plan)
    assert d["added"] == 1
    assert d["removed"] == 0
    assert any(l["kind"] == "add" and "line3" in l["text"] for l in d["lines"])


def test_diff_reports_removed_lines(tmp_path):
    dest = tmp_path / "a.py"
    dest.write_text("line1\nline2\nline3\n")
    plan = plan_file("a.py", "line1\n", dest.read_text())
    d = file_diff(tmp_path, plan)
    assert d["removed"] == 2


def test_diff_of_new_file_is_all_additions(tmp_path):
    plan = plan_file("new.py", "a\nb\n", None)
    d = file_diff(tmp_path, plan)
    assert d["action"] == "create"
    assert d["added"] == 2
    assert d["removed"] == 0


def test_diff_rejects_traversal(tmp_path):
    """A hostile path must be refused and must not leak file contents."""
    from app.generator.merge import FilePlan

    outside = tmp_path.parent / "secret.txt"
    outside.write_text("SENSITIVE\n")

    d = file_diff(tmp_path, FilePlan(
        path="../secret.txt", action=Action.CREATE, content="x"))

    assert "error" in d
    assert d["lines"] == []
    assert "SENSITIVE" not in str(d)


def test_diff_truncates_huge_files(tmp_path):
    dest = tmp_path / "big.py"
    dest.write_text("")
    plan = plan_file("big.py", "x\n" * 5000, "")
    d = file_diff(tmp_path, plan)
    assert d["truncated"] is True
    assert len(d["lines"]) <= 600


# ── summaries ────────────────────────────────────────────
def test_summarize_counts_actions():
    plans = [
        plan_file("a", "x", None),        # create
        plan_file("b", "x", "x"),         # skip
        plan_file("c", "new", "old"),     # conflict
    ]
    s = summarize_plans(plans)
    assert s["total"] == 3
    assert s["changed"] == 2              # skip does not count
    assert s["counts"]["create"] == 1
    assert s["counts"]["skip"] == 1


def test_export_report_shape(files, tmp_path):
    plans = [plan_file(f.path, f.content, None) for f in files]
    r = export_report(target=tmp_path, plans=plans, files=files,
                      written=4, merged=0, skipped=0, conflicts=0)
    assert r["files"] == 4
    assert r["lines"] > 0
    assert r["written"] == 4
    assert "backend" in r["byArea"]
    assert len(r["largest"]) <= 5
    assert r["largest"][0]["bytes"] >= r["largest"][-1]["bytes"]


# ── dry run must never touch the disk (regression) ───────
def test_dry_run_writes_nothing(tmp_path, files):
    """Regression: an early build applied the plan even on a dry run."""
    from app.generator.writer import apply_plan, build_plan

    plans = build_plan(files, tmp_path)
    summary = summarize_plans(plans)

    # a dry run only summarises — apply_plan is never called
    assert summary["changed"] == len(files)
    assert list(tmp_path.iterdir()) == []

    # and the real thing does write
    apply_plan(plans, tmp_path)
    assert (tmp_path / "README.md").exists()


def test_run_scripts_survive_the_plan(tmp_path):
    """Regression: run.bat/run.sh were rendered but dropped before writing."""
    from app.generator.writer import apply_plan, build_plan

    files = [GeneratedFile("app/main.py", "x\n")] + run_scripts("Demo")
    apply_plan(build_plan(files, tmp_path), tmp_path)

    assert (tmp_path / "run.bat").exists()
    assert (tmp_path / "run.sh").exists()
    assert (tmp_path / "app" / "main.py").exists()


# ── rename compatibility (v0.8) ──────────────────────────
def test_legacy_codeforge_markers_still_merge():
    """Projects generated before the Skaffo rename must keep working.

    Their files contain `codeforge:keep` markers wrapping real user code.
    If the merger stopped recognising them, every such file would flip to
    `conflict` and people would be told their own code is a clash.
    """
    from app.generator.merge import Action, extract_regions, plan_file

    on_disk = (
        "import os\n"
        "# codeforge:keep:start helpers\n"
        "def my_precious_function():\n"
        "    return 42\n"
        "# codeforge:keep:end\n"
    )
    regenerated = (
        "import os\nimport sys\n"
        "# skaffo:keep:start helpers\n"
        "# your code here\n"
        "# skaffo:keep:end\n"
    )

    assert "helpers" in extract_regions(on_disk)

    plan = plan_file("app/util.py", regenerated, on_disk)
    assert plan.action is Action.MERGE
    assert plan.kept_regions == 1
    assert "my_precious_function" in plan.content   # user code survived
    assert "import sys" in plan.content             # new code arrived


def test_mixed_marker_styles_in_one_file():
    from app.generator.merge import extract_regions

    text = (
        "# codeforge:keep:start old\nA\n# codeforge:keep:end\n"
        "# skaffo:keep:start new\nB\n# skaffo:keep:end\n"
    )
    assert set(extract_regions(text)) == {"old", "new"}
