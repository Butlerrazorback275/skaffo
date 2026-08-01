# v0.10 — Sample data and GitHub publishing

Two features that both attack the same problem: the gap between "Skaffo
generated files" and "I have a working project I can show someone".

---

## 1. Sample data

### The problem

A generated project used to start with empty tables. You would run it, open
the app, and every page said *No products found*. Technically correct,
emotionally dead — it looks broken even though it works.

### What it does

A toggle in the wizard (step 7, on by default) adds one file:

```
backend/app/seed.py
```

```bash
python -m app.seed              # insert, skip tables that already have rows
python -m app.seed --reset      # wipe the seeded tables first
python -m app.seed --count 50   # override rows per table
```

### Believable, not random

The interesting part is not generating data, it is generating data that looks
like *your* data. A column typed `string` could be an email, a price, a
status or a product name — the type cannot tell you, but the **name**
usually can.

`seed_data.py` infers a semantic role from the column name and only falls
back to the declared type when the name says nothing:

| Column | Value | Not |
|---|---|---|
| `email` | `sara.ahmadi3@example.com` | `Xk9wQ2` |
| `price`, `total`, `salary` | `24.99` | `0.48237194` |
| `status` | `shipped` | `lorem` |
| `full_name` | `Amara Silva` | `String 1` |
| `slug` | `wireless-mouse-2` | `abc123` |
| `created_at` | spread over the last 90 days | `1970-01-01` |
| `is_active` | a realistic mix of true/false | all false |
| `password` | `changeme-not-a-real-password` | a plausible secret |

The **table** name breaks ties the column name cannot: `title` in `products`
produces *Wireless Mouse*, but `title` in `posts` produces *Field Notes*.

### Decisions worth recording

**No `faker` dependency.** Adding ~15 MB to every generated project for a
handful of demo rows is a bad trade. The word lists are small, embedded in
the generated file, and the user can edit them.

**Deterministic.** Values are derived from `blake2b(table, row_index)`, so
regenerating a project produces byte-identical rows and `Sync` stays quiet
instead of showing a fake diff every time.

**A generator, not an inserter.** `SeedGenerator` obeys the project rule:
context in, `GeneratedFile[]` out, never a database connection. Because it
only emits a file, dry-run, ZIP export and per-file diffs work on seed data
for free — and the user can read exactly what will be inserted before running
anything.

**Foreign keys are resolved at runtime.** Integer primary keys are assigned
by the database, so a child row cannot hard-code its parent's id. Rows are
emitted as `_ref("users", 3)` and resolved after the parent table has been
flushed:

```python
{'title': 'On Keeping Things Simple', 'author_id': _ref('users', 0)},
```

Tables are topologically sorted so parents insert first. Cycles and
self-references are tolerated — those rows are skipped rather than crashing.

**Idempotent.** A table that already has rows is skipped, so running it twice
never duplicates data.

### Security

Sample values are free text derived from column names, and column names can
come from an imported database. Every value is rendered through the
SECURITY-002 escapers — `_literal()` is the only place a value becomes Python.

This caught a real bug during development: the template originally used
`py_doc` inside `print("Seeding @@ name @@")`. `py_doc` only protects triple-
quoted docstrings, so a project named `Shop""" ; import os; ...` produced a
file that would not parse. Fixed to `print("Seeding", @@ name | py_str @@)`.

### Verified

A three-table schema (users → orders ← products) was generated, a real
virtualenv built, dependencies installed, and `python -m app.seed` executed
against a real SQLite file:

```
  seed  users                    +10 row(s)
  seed  products                 +10 row(s)
  seed  orders                   +10 row(s)

joined: (1, 'Amara Silva', 'Portable SSD 1TB', 102, 'paid')
orphan FK rows: 0
users after 2nd run: 10   (no duplicates)
```

---

## 2. GitHub publishing

Replaces the `Git Repository` chip in Export that used to say *Not built yet*.

Creates a real repository on the user's account and pushes the generated
project to it, with live progress: verify → create → commit → push.

### The token is the whole design problem

A classic PAT with `repo` scope grants write access to **every private
repository the user owns**. Skaffo's database holds projects and schemas —
nothing sensitive — and putting a credential next to that data would be a
significant downgrade in the app's risk profile.

So:

**Stored by the operating system, not by Skaffo.**
`safeStorage` delegates to Windows DPAPI, macOS Keychain, or libsecret. The
ciphertext lands in a `0600` file in `userData`, written to a temp file and
renamed so a crash cannot leave a truncated blob.

**No plaintext fallback.** If `isEncryptionAvailable()` is false (some Linux
desktops with no keyring), Skaffo refuses to persist and keeps the token in
memory for that session only — and says so in the UI. Silently writing
plaintext because encryption was unavailable would be the worst outcome.

**The renderer can never read it back.** The preload bridge exposes
`saveToken`, `forgetToken`, `status` and `publish` — but no getter. `status`
returns only `{available, saved, hint}` where hint is `ghp_…xxxx`. An XSS in
the UI, or a compromised npm package in the renderer bundle, has nothing to
steal.

**Never in argv.** Process arguments are readable by other processes on both
Windows and Linux, so git receives the token through a `GIT_ASKPASS` helper
that reads it from an environment variable.

**Never in `.git/config`.** The remote is set to the plain `clone_url`. A
token embedded in `origin` would be written to disk in plaintext and survive
there indefinitely. This is asserted by a test that reads `.git/config` after
a real push.

**Never in an error.** `redact()` scrubs `ghp_`/`gho_`/`ghu_`/`ghs_`/`ghr_`/
`github_pat_` patterns plus `https://user:secret@`, and is applied twice —
once inside git output handling and again on the way out of the IPC handler.

### Refusing to be destructive

If the repository already exists, Skaffo adopts it **only when it is empty**
(`size === 0`). Pushing into a repository that already has content could
overwrite someone's work, so that case is a clear error instead:

> The repository "x" already exists and is not empty. Pick a different name,
> or delete the existing repository first.

### Error messages that help

Every failure maps to something actionable rather than an HTTP code:

| Situation | What the user is told |
|---|---|
| 401 | The token was rejected — expired, revoked, or copied incompletely |
| 403 with no scopes | The token is valid but lacks permission; it currently has: … |
| 403 rate limited | GitHub rate limit reached, try again in a few minutes |
| Network failure | Could not reach github.com — check your connection or filter |
| Git missing | Git is not installed — install from git-scm.com and restart |
| Folder missing | Generate the project first, then publish |

### Verified

`scripts/test-github.cjs` runs the real module against a fake GitHub API and
pushes into a real bare repository:

```
✓ verifyToken returns the account
✓ a bad token is rejected with a useful hint
✓ publish creates the repo and pushes a real commit
✓ the token never reaches .git/config
✓ an existing but empty repo is adopted
✓ an existing NON-empty repo is refused
✓ a push failure does not leak the token
✓ publishing twice is safe (re-run after a fix)
✓ a missing folder gives a clear error
✓ redact handles every token format
```

`engine/tests/test_github_contract.py` additionally pins the rules at source
level: the preload bridge must expose no token getter, `secrets.cjs` must
guard every write with `isEncryptionAvailable()`, and the file mode must be
`0600`.

---

## Also in this release

**The version in the title bar was wrong.** It had been hardcoded as
`v0.1.0 · Preview` in `Topbar.tsx` since Phase 1 and silently stayed there
through six releases — including in every screenshot in the README. It is now
injected from `package.json` at build time via `__APP_VERSION__`, so it cannot
drift again.

**`Input` forwards refs**, so dialogs can move focus to their first field when
they open.

---

## Tests

| Suite | Count |
|---|---|
| Existing (path safety, schema tools, API designer, export, injection) | 228 |
| `test_seed.py` | 58 |
| `test_github_contract.py` | 21 |
| **Python total** | **286** |
| `scripts/test-github.cjs` | 10 |

TypeScript clean, production build clean, zero console errors in a headless
Electron run.
