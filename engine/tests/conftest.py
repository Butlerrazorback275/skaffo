"""Shared fixtures and capability probes.

The important one here is `requires_bash`.

Several security tests prove that a hostile project name cannot execute a
command by running the generated `run.sh` through a *real* bash and checking
whether a marker file appeared. That is the right way to test it — asserting
on characters would pass against an escaper that merely deleted one sequence.

But it means the tests need a working bash, and "is bash on PATH" is not the
same question. On Windows, `C:\\Windows\\System32\\bash.exe` exists by default
as a **WSL launcher stub**. With no distribution installed it prints

    Windows Subsystem for Linux has no installed distributions.

in UTF-16LE and exits 1 — so `shutil.which("bash")` succeeds, the subprocess
runs, and the assertion fails for a reason that has nothing to do with the
code under test.

So we probe behaviour instead of presence: ask bash to print a known string
and require exactly that string back.
"""
from __future__ import annotations

import os
import shutil
import subprocess

import pytest


def _candidate_shells() -> list[str]:
    """Places a genuine bash may live, best first.

    On Windows the bash on PATH is usually the WSL stub, but Git for Windows
    ships a real one that is *not* on PATH. Since the project already requires
    Git, looking there means these tests normally still run on Windows instead
    of being quietly skipped.
    """
    found: list[str] = []

    on_path = shutil.which("bash")
    if on_path:
        found.append(on_path)

    if os.name == "nt":
        for root in (
            os.environ.get("ProgramFiles", r"C:\Program Files"),
            os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"),
            os.environ.get("LOCALAPPDATA", ""),
        ):
            if not root:
                continue
            for tail in (r"Git\bin\bash.exe", r"Git\usr\bin\bash.exe",
                         r"Programs\Git\bin\bash.exe"):
                candidate = os.path.join(root, tail)
                if os.path.isfile(candidate):
                    found.append(candidate)

        git = shutil.which("git")
        if git:
            # <git>/cmd/git.exe -> <git>/bin/bash.exe
            base = os.path.dirname(os.path.dirname(git))
            for tail in (r"bin\bash.exe", r"usr\bin\bash.exe"):
                candidate = os.path.join(base, tail)
                if os.path.isfile(candidate):
                    found.append(candidate)

    # de-duplicate, keep order
    return list(dict.fromkeys(found))


def _probe(exe: str) -> tuple[bool, str]:
    try:
        proc = subprocess.run(
            [exe, "-c", "printf skaffo-probe-ok"],
            capture_output=True, timeout=20,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return False, f"could not start ({exc.__class__.__name__})"

    if proc.returncode != 0:
        return False, f"exited {proc.returncode} on a trivial command"

    if proc.stdout != b"skaffo-probe-ok":
        if b"\x00" in proc.stdout[:60]:
            return False, "is the Windows WSL launcher stub, not a shell"
        return False, f"unexpected output {proc.stdout[:40]!r}"

    return True, ""


def _find_bash() -> tuple[str | None, str]:
    """Return (path, reason_if_none). Probes behaviour, not just presence."""
    candidates = _candidate_shells()
    if not candidates:
        return None, "no bash found on PATH or in a Git for Windows install"

    problems = []
    for exe in candidates:
        ok, why = _probe(exe)
        if ok:
            return exe, ""
        problems.append(f"{exe}: {why}")

    hint = ("; install Git for Windows (which bundles a real bash) or a WSL "
            "distribution") if os.name == "nt" else ""
    return None, "; ".join(problems) + hint


BASH, _BASH_WHY = _find_bash()
_BASH_OK = BASH is not None

#: Skip a test that needs a genuine POSIX shell.
requires_bash = pytest.mark.skipif(not _BASH_OK, reason=_BASH_WHY or "bash unusable")


@pytest.fixture(scope="session")
def bash_available() -> bool:
    return _BASH_OK


def pytest_report_header(config) -> str:
    """Make the shell situation visible in the test header.

    A skipped security test should never be silent — if these are not running
    on your machine you should be able to see that at a glance.
    """
    if _BASH_OK:
        return f"bash: {BASH} (shell injection tests will run)"
    return f"bash: UNUSABLE - {_BASH_WHY}\n      -> shell injection tests will be SKIPPED"
