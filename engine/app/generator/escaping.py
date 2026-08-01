"""Context-aware escaping for free-text user values.

SECURITY-002.

Background
----------
``safe_identifier()`` in ``base.py`` hardens *identifiers* — table and column
names — by reducing them to ``[0-9a-zA-Z_]``. That is correct for things that
must be valid Python/filesystem names.

But some values are deliberately **not** identifiers. A project's display name
is meant to stay human ("My Shop", "Café Léon", "فروشگاه من"), so it is never
passed through ``safe_identifier``. That free text is then interpolated into
five different target languages, each with its own quoting rules:

===============  =====================================  =====================
Target           File                                   Danger
===============  =====================================  =====================
POSIX shell      ``run.sh``                             ``$(...)``, backticks
Windows batch    ``run.bat``                            ``|``, ``>``, ``&``
Python           ``backend/app/core/config.py``         string break-out
HTML             ``frontend/index.html``                XSS
JSX              ``frontend/src/.../Layout.tsx``        XSS + broken build
===============  =====================================  =====================

The old code used a *blocklist* (``.replace("%","")...``). Blocklists fail by
default: they only stop what the author remembered. Everything here is an
*allowlist / total-encoding* approach instead — the value is transformed into
a form that is inert **by construction** in the target grammar, so an unknown
metacharacter cannot be "missed".

Rule of thumb for anyone adding a template
------------------------------------------
If you interpolate a free-text value, pick the filter for the language you are
writing into. Never use the raw value.

    Python source   →  ``@@ name | py_str @@``     (emits the quotes too)
    Python docstring→  ``@@ name | py_doc @@``     (emits the quotes too)
    HTML text       →  ``@@ name | html_text @@``
    JSX text        →  ``@@ name | jsx_text @@``
    Markdown text   →  ``@@ name | md_text @@``
    POSIX shell     →  ``@@ name | sh_str @@``     (emits the quotes too)
    Windows batch   →  ``@@ name | bat_echo @@``
"""
from __future__ import annotations

import html
import json
import re

__all__ = [
    "MAX_DISPLAY_LEN",
    "flatten",
    "sh_str",
    "bat_echo",
    "py_str",
    "py_doc",
    "html_text",
    "jsx_text",
    "md_text",
    "register_filters",
]

MAX_DISPLAY_LEN = 200

# Anything that is a control character, a line break, or a Unicode
# line/paragraph separator. Newlines are the one payload that pure
# character-escaping misses, because in both sh and batch a newline *ends the
# statement* — no amount of quoting the surrounding text helps.
_CONTROL = re.compile(r"[\x00-\x1f\x7f-\x9f\u2028\u2029]")

# Unicode direction overrides: these can visually reorder a line so that what
# a reviewer reads is not what the interpreter executes ("Trojan Source",
# CVE-2021-42574). Strip them from anything that lands in source code.
_BIDI = re.compile("[\u202a-\u202e\u2066-\u2069\u200e\u200f]")


def flatten(value: object, *, limit: int = MAX_DISPLAY_LEN) -> str:
    """Collapse an arbitrary value to a single safe-to-embed text line.

    This runs *before* every language-specific escaper and is the step that
    neutralises newline injection, NUL bytes and bidi overrides — the classes
    of payload that per-character quoting cannot fix.

        >>> flatten("Shop\\ncalc.exe")
        'Shop calc.exe'
        >>> flatten("a\\x00b")
        'ab'
    """
    text = "" if value is None else str(value)
    text = _BIDI.sub("", text)
    # Turn line breaks into spaces (keep the words), drop other controls.
    text = re.sub(r"[\r\n\t\v\f]+", " ", text)
    text = _CONTROL.sub("", text)
    text = re.sub(r" {2,}", " ", text).strip()

    if len(text) > limit:
        text = text[:limit].rstrip() + "…"
    return text


# ── POSIX shell ──────────────────────────────────────────
def sh_str(value: object) -> str:
    """Render as a POSIX shell single-quoted literal, **including quotes**.

    Single quotes are the only shell context with no escape processing at all:
    ``$``, backtick, ``\\`` and ``"`` are literal inside them. The single
    lone special case is ``'`` itself, which is closed, escaped and reopened.

        >>> sh_str("My Shop")
        "'My Shop'"
        >>> sh_str("Shop$(id)")
        "'Shop$(id)'"
        >>> sh_str("it's")
        '\\'it\\'"\\'"\\'s\\''
    """
    text = flatten(value)
    return "'" + text.replace("'", "'\"'\"'") + "'"


# ── Windows batch ────────────────────────────────────────
# Batch has no quoting construct that is safe for `echo`, so instead of
# escaping we allowlist: keep characters that are inert in cmd.exe, and
# replace every other one. This cannot be bypassed by a metacharacter we
# forgot, because unknown characters are dropped rather than kept.
_BAT_ALLOWED = re.compile(r"[^0-9A-Za-z \-_.,:;!?'()\[\]{}+=@#/\\]")


def bat_echo(value: object) -> str:
    """Render as text that is inert after ``echo`` in cmd.exe.

    Removes ``% ^ & | < > " `` and anything else outside the allowlist —
    including non-ASCII, which cmd.exe renders as mojibake under the default
    code page anyway.

        >>> bat_echo("Shop | calc.exe")
        'Shop  calc.exe'
        >>> bat_echo("100% Off & More")
        '100 Off  More'
    """
    text = _BAT_ALLOWED.sub("", flatten(value))
    text = re.sub(r" {2,}", " ", text).strip()
    return text or "Project"


# ── Python source ────────────────────────────────────────
def py_str(value: object) -> str:
    """Render as a Python string literal, **including quotes**.

    Delegates to ``repr``, which is the interpreter's own round-trip-safe
    quoting — it can never produce a literal that breaks out.

        >>> py_str('Shop" + __import__("os").system("id") + "')
        '\\'Shop" + __import__("os").system("id") + "\\''
    """
    return repr(flatten(value))


def py_doc(value: object) -> str:
    """Render as the opening text of a ``\"\"\"`` docstring.

    A name containing ``\"\"\"`` or a trailing backslash would close the
    docstring early and turn the remainder of the line into live code.

        >>> py_doc('Shop\"\"\" ; import os; os.system("id") #')
        'Shop\\'\\'\\' ; import os; os.system("id") #'
    """
    return flatten(value).replace('"""', "'''").replace("\\", "/")


# ── Markdown ─────────────────────────────────────────────
def md_text(value: object) -> str:
    """Escape Markdown structural characters so a name renders as text.

    Not a security boundary on its own — GitHub sanitises rendered HTML — but
    it stops a name from injecting links, images or headings into the
    generated README.

        >>> md_text("Shop [click](http://evil)")
        'Shop \\\\[click\\\\](http://evil)'
    """
    text = flatten(value)
    for ch in "\\`*_{}[]()#+-.!<>|":
        text = text.replace(ch, "\\" + ch)
    return text


# ── HTML ─────────────────────────────────────────────────
def html_text(value: object) -> str:
    """Escape for an HTML text node or a quoted attribute value.

        >>> html_text("<script>alert(1)</script>")
        '&lt;script&gt;alert(1)&lt;/script&gt;'
    """
    return html.escape(flatten(value), quote=True)


# ── JSX ──────────────────────────────────────────────────
def jsx_text(value: object) -> str:
    """Render as a JSX expression container, e.g. ``{"My Shop"}``.

    Text typed straight into JSX can close the enclosing element, so the value
    is emitted as a JS string instead — React then escapes it at render time,
    which also fixes the "name breaks the build" failure mode.

        >>> jsx_text("</Link><img onerror=alert(1) src=x />")
        '{"</Link><img onerror=alert(1) src=x />"}'
    """
    # json.dumps handles quotes, backslashes and control chars; </ is split so
    # the literal can never terminate a surrounding <script> block.
    literal = json.dumps(flatten(value), ensure_ascii=False).replace("</", '<" + "/')
    return "{" + literal + "}"


# ── wiring ───────────────────────────────────────────────
def register_filters(env) -> None:
    """Attach every escaper to a Jinja environment as a filter."""
    env.filters.update(
        sh_str=sh_str,
        bat_echo=bat_echo,
        py_str=py_str,
        py_doc=py_doc,
        html_text=html_text,
        jsx_text=jsx_text,
        md_text=md_text,
        flatten=flatten,
    )
