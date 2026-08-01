"""Contract tests for the GitHub publisher's redaction rules.

The publisher itself lives in Electron's main process (`electron/github.cjs`)
and is exercised by `scripts/test-github.cjs`. What is worth pinning down in
Python is the *rule*, because it is the part that protects the user: no code
path may return a string that still contains a token.

These tests re-implement the redaction regexes and check them against real
GitHub token formats, so a change to the shapes GitHub issues is caught here
even if the JS is refactored.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

_ELECTRON = Path(__file__).resolve().parents[2] / "electron"
GITHUB_CJS = _ELECTRON / "github.cjs"
SECRETS_CJS = _ELECTRON / "secrets.cjs"
PRELOAD_CJS = _ELECTRON / "preload.cjs"

# The source-level assertions below read files from the Electron side of the
# repo. When only `engine/` is present — a CI job that tests the Python
# package alone, or a partial checkout — skip them rather than reporting a
# failure that says nothing about the code.
requires_electron = pytest.mark.skipif(
    not GITHUB_CJS.exists(),
    reason="electron/ not present in this checkout",
)

# Mirrors redact() in github.cjs
PATTERNS = [
    (re.compile(r"gh[pousr]_[A-Za-z0-9]{16,}"), "***"),
    (re.compile(r"github_pat_[A-Za-z0-9_]{20,}"), "***"),
    (re.compile(r"(https?://)[^@\s/]+@"), r"\1***@"),
]

SAMPLE_TOKENS = [
    "ghp_" + "a" * 36,
    "gho_" + "b" * 36,
    "ghu_" + "c" * 36,
    "ghs_" + "d" * 36,
    "ghr_" + "e" * 36,
    "github_pat_" + "f" * 22 + "_" + "g" * 59,
]


def redact(text: str, token: str | None = None) -> str:
    out = text
    if token:
        out = out.replace(token, "***")
    for pattern, repl in PATTERNS:
        out = pattern.sub(repl, out)
    return out


@pytest.mark.parametrize("token", SAMPLE_TOKENS)
def test_every_github_token_format_is_redacted(token):
    message = f"remote: Invalid credentials for {token} while pushing"
    assert token not in redact(message)
    assert "***" in redact(message)


@pytest.mark.parametrize("token", SAMPLE_TOKENS)
def test_token_embedded_in_a_url_is_redacted(token):
    url = f"https://user:{token}@github.com/me/repo.git"
    out = redact(url)
    assert token not in out
    assert "github.com/me/repo.git" in out, "the useful part must survive"


def test_explicit_token_is_removed_even_if_shaped_oddly():
    """A token we hold is removed by identity, not only by pattern."""
    weird = "not-a-standard-shape-000"
    assert weird not in redact(f"failed with {weird}", weird)


def test_redaction_keeps_the_actionable_part_of_an_error():
    msg = ("remote: Permission to me/repo.git denied to user.\n"
           "fatal: unable to access 'https://x:ghp_" + "z" * 36 +
           "@github.com/me/repo.git/'")
    out = redact(msg)
    assert "ghp_" not in out
    assert "Permission to me/repo.git denied" in out


# ── source-level guarantees ──────────────────────────────
def _strip_comments(src: str) -> str:
    """Drop // and /* */ comments so prose cannot satisfy a code assertion."""
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    return re.sub(r"^\s*//.*$", "", src, flags=re.M)


@requires_electron
def test_preload_never_exposes_a_token_getter():
    """The renderer must not be able to read the token back."""
    src = PRELOAD_CJS.read_text()
    assert "gh:save-token" in src, "publishing bridge missing"
    code = _strip_comments(src)
    # Word-boundary matching: `forgetToken` legitimately contains "getToken".
    for forbidden in ("gh:get-token", "getToken", "readToken", "revealToken"):
        assert not re.search(rf"(?<![A-Za-z]){re.escape(forbidden)}", code), (
            f"preload exposes {forbidden}"
        )


@requires_electron
def test_main_process_is_the_only_reader():
    """getSecret must not be reachable from the renderer bridge."""
    assert "getSecret" not in _strip_comments(PRELOAD_CJS.read_text())


@requires_electron
def test_secrets_refuses_plaintext_fallback():
    """If the OS keystore is unavailable we must not write the token anyway."""
    src = SECRETS_CJS.read_text()
    assert "isEncryptionAvailable" in src
    assert "encryptString" in src
    # every write path is guarded by availability
    assert "if (!available()) return false;" in src


@requires_electron
def test_secrets_file_is_owner_only():
    assert "0o600" in SECRETS_CJS.read_text()


@requires_electron
def test_token_is_not_placed_in_the_git_remote():
    """A token in `origin` would persist in .git/config forever."""
    src = GITHUB_CJS.read_text()
    assert "repo.clone_url" in src
    # the remote is set from the plain URL, never an interpolated credential
    assert "@github.com" not in src.split("module.exports")[0].replace(
        "users.noreply.github.com", "")


@requires_electron
def test_token_is_passed_via_askpass_not_argv():
    src = GITHUB_CJS.read_text()
    assert "GIT_ASKPASS" in src
    assert "SKAFFO_GIT_TOKEN" in src
    assert "GIT_TERMINAL_PROMPT" in src, "git must never hang on a prompt"


@requires_electron
def test_publish_refuses_a_non_empty_existing_repository():
    """Pushing into someone's populated repo would be destructive."""
    src = GITHUB_CJS.read_text()
    assert "existing.size > 0" in src
