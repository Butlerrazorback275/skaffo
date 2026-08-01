# How to test the two new features by hand

Everything below is done in the running app, from `F:\codeforge`.

> ⚠️ **Use `F:\codeforge`, not the Desktop copy.**
> `C:\Users\ilia\Desktop\codeforge` is the old checkout — it does not have any
> of this. Running `npm run dev` there will show you v0.9 and none of it will
> work.

```
cd /d F:\codeforge
npm run dev
```

---

## Feature 2 — Sample data (test this one first)

It needs no account and no internet, so it is the quicker of the two.

### Step 1 — make a project with the toggle on

1. **Dashboard → Create Project**
2. Name it `Seed Test`
3. Click **Next** through Type / Backend / Frontend / Database / Auth
4. **Step 7 (Docker)** — this is the new bit. Under the Yes/No cards there is
   now a **Sample data** row with a switch, on by default.
   Leave it on.
5. **Next → Generate**

### Step 2 — draw a schema worth seeding

Go to **Database** and build something with recognisable column names — the
whole point is that the values match the *meaning* of the column, so a table
of `col1, col2` proves nothing.

**users**

| column | type | flags |
|---|---|---|
| `id` | integer | primary key |
| `email` | string | unique |
| `full_name` | string | |
| `is_active` | boolean | |
| `created_at` | datetime | |

**products**

| column | type |
|---|---|
| `id` | integer (pk) |
| `title` | string |
| `slug` | string (unique) |
| `price` | decimal |
| `stock` | integer |

Then drag from `users.id` to a new `orders.user_id` if you want to see foreign
keys handled too.

### Step 3 — export and read the file

**Export → Folder → Generate**, then **Open Folder** and open:

```
backend\app\seed.py
```

**What to look for.** This is the actual test — not that a file exists, but
that the values make sense:

```python
USERS_ROWS = [
    {'email': 'amara.silva1@example.com', 'full_name': 'Amara Silva',
     'is_active': True, 'created_at': datetime(2026, 7, 23, 1, 0, 32, ...)},
    ...
]

PRODUCTS_ROWS = [
    {'title': 'Portable SSD 1TB', 'slug': 'portable-ssd-1tb-1', 'price': 364.58, 'stock': 160},
    ...
]
```

| Check | Should be | Would be wrong |
|---|---|---|
| `email` | a real email shape, all different | `String 1`, or all identical |
| `full_name` | `Amara Silva` | `Full Name 1` |
| `price` | `364.58` — two decimals | `0.4823719` |
| `slug` | `portable-ssd-1tb-1` | `Slug 1` |
| `is_active` | a mix of True and False | all False |
| `created_at` | dates in the last ~90 days | `1970-01-01` |
| `orders.user_id` | `_ref('users', 0)` | a hard-coded number |

That last one matters: integer ids are assigned by the database, so the child
row cannot know its parent's id in advance. `_ref` is resolved at runtime.

### Step 4 — actually run it

```
cd %USERPROFILE%\Documents\SkaffoProjects\seed-test
run.bat
```

`run.bat` now seeds automatically before starting the servers. You should see:

```
[*] Inserting sample data...
Seeding Seed Test
  seed  users                    +12 row(s)
  seed  products                 +12 row(s)

Done - 24 row(s) inserted.
[4/4] Starting servers...
```

Then open **http://localhost:5173** — the Users and Products pages should have
rows in them instead of *No items found*. **That is the whole feature.**

Also try **http://127.0.0.1:8000/docs** → `GET /api/users` → Execute, and you
should get real JSON back.

### Step 5 — prove it does not duplicate

Close the two windows, run `run.bat` again. This time it should say nothing
about seeding (a `backend\.seeded` marker was written), and the row counts in
the app must be unchanged.

To start over deliberately:

```
cd backend
.venv\Scripts\python -m app.seed --reset
```

### Step 6 — prove the toggle actually does something

Make a second project with **Sample data turned off**, generate it, and check
that `backend\app\seed.py` **does not exist**. If it does, the toggle is not
wired up.

---

## Feature 1 — Publish to GitHub

### Step 1 — make a token

Go to <https://github.com/settings/tokens/new?scopes=repo&description=Skaffo>
(the button inside the dialog opens exactly this URL).

- **Note:** `Skaffo`
- **Expiration:** 7 days is plenty for a test
- **Scopes:** tick **`repo`** — nothing else is needed

Click **Generate token** and copy it. GitHub shows it once.

> A `repo`-scope token can write to all of your private repositories. Use a
> short expiry for this test, and revoke it afterwards at
> <https://github.com/settings/tokens>.

### Step 2 — publish

1. Open the project you generated above
2. **Export → GitHub Repository** (it used to say *Not built yet*; it is now a
   live option)
3. Click **Create & push**
4. Paste the token → **Connect**

You should see **Connected as ilia-dev-cmyk** and a masked hint like
`Token ghp_…4f2a`. The full token is never shown again — the UI cannot read it
back, only the main process can.

5. Repository name is pre-filled from the project name, cleaned to GitHub's
   rules (`Seed Test` → `Seed-Test`)
6. Optionally flip **Private repository**
7. **Create & push**

The four steps tick off live: *Verifying token → Creating repository →
Committing files → Pushing to GitHub*, then a green panel with **Open on
GitHub**.

### Step 3 — verify on github.com

Click **Open on GitHub**. Check that:

- all the files are there (`backend/`, `frontend/`, `README.md`, `run.bat`)
- there is one commit: *Initial commit - generated by Skaffo*
- if you ticked private, the repo shows a **Private** badge

### Step 4 — check the token did not leak (the important one)

In the generated project folder:

```
notepad .git\config
```

The `[remote "origin"]` url must be a **plain** URL:

```
url = https://github.com/ilia-dev-cmyk/seed-test.git
```

If you ever see `https://ilia:ghp_xxxx@github.com/...` then a token was
written to disk in plaintext. It should not be — the token is passed to git
through an askpass helper instead, precisely so this file stays clean.

### Step 5 — error handling

Worth trying, because good errors are most of the value here:

| Try | Expected |
|---|---|
| Paste a nonsense token like `ghp_wrong` | *The token was rejected. It may be expired, revoked, or copied incompletely.* |
| Publish twice with the same name | Second time it adopts the (now non-empty) repo? No — it should **refuse**: *already exists and is not empty* |
| Turn off your internet, publish | *Could not reach github.com* with a note about filters/VPN |
| Click the trash icon next to the token | Token removed; the form asks for one again |

### Step 6 — check where the token lives

```
%APPDATA%\Skaffo\credentials.bin
```

Open it in Notepad. It should be **binary garbage**, not your token — it is
encrypted with Windows DPAPI, tied to your Windows account. If you can read
the token in there, something is wrong.

There should be **no** token anywhere in `skaffo.db`.

---

## Automated equivalents

If you would rather not do it by hand, these cover the same ground:

```
cd F:\codeforge\engine
.venv\Scripts\python -m pytest tests\test_seed.py -v

cd /d F:\codeforge
node scripts\test-github.cjs
```

The second one spins up a fake GitHub API and pushes into a real local git
repository, then asserts the token is absent from `.git/config` and from every
error message.
