"""Semantic sample-data inference.

Generating *believable* rows is a different problem from generating *random*
ones. A column typed ``string`` could be an email, a person's name, a product
title, a slug or a status code — the type alone cannot tell you, but the
**name** almost always can.

So this module infers a semantic *role* from the column name first and falls
back to the declared type only when the name says nothing useful:

    email        -> "sara.ahmadi@example.com"     (not "Xk9wQ2")
    price        -> 24.99                          (not 0.48237194)
    status       -> "shipped"                      (not "lorem")
    is_active    -> True
    created_at   -> a date spread over the last 90 days

Design constraints
------------------
* **No `faker` dependency.** Adding ~15 MB to every generated project to
  produce a handful of demo rows is a bad trade. The word lists below are
  small, embedded in the generated file, and the user can edit them.
* **Deterministic.** Seeded from the table name, so regenerating a project
  produces the same rows and `diff` stays quiet.
* **Pure.** Returns Python values; the caller renders them. Nothing here
  touches a database or the disk.
* **Values are rendered with `py_str`** by the template, never f-strings —
  see SECURITY-002. A "product name" is free text and lands in source code.
"""
from __future__ import annotations

import hashlib
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any

__all__ = ["infer_role", "sample_values", "ROLE_ORDER", "WORDS"]

# ── word lists ───────────────────────────────────────────
# Deliberately small and multicultural. These end up in the generated
# seed.py where the user can read and replace them.
WORDS: dict[str, list[str]] = {
    "first": [
        "Sara", "Omar", "Lena", "Diego", "Mina", "Noah", "Yuki", "Amara",
        "Ivan", "Chloe", "Rafael", "Nadia", "Tom", "Priya", "Hugo", "Zoe",
    ],
    "last": [
        "Ahmadi", "Novak", "Silva", "Chen", "Okafor", "Weber", "Rossi",
        "Kim", "Dubois", "Costa", "Haddad", "Nilsson", "Reyes", "Patel",
    ],
    "product": [
        "Wireless Mouse", "Mechanical Keyboard", "USB-C Hub", "Desk Lamp",
        "Noise-Cancelling Headphones", "Laptop Stand", "Webcam 1080p",
        "Portable SSD 1TB", "Monitor Arm", "Ergonomic Chair", "Cable Organizer",
        "Bluetooth Speaker", "Standing Desk Mat", "Docking Station",
    ],
    "company": [
        "Northwind", "Acme Supply", "Blue Harbor", "Kestrel Labs",
        "Ironwood", "Lumen Works", "Redpine", "Havenstone",
    ],
    "city": [
        "Lisbon", "Toronto", "Osaka", "Nairobi", "Vienna", "Bogotá",
        "Tallinn", "Auckland", "Dublin", "Seoul",
    ],
    "country": [
        "Portugal", "Canada", "Japan", "Kenya", "Austria", "Colombia",
        "Estonia", "New Zealand", "Ireland", "South Korea",
    ],
    "status": ["pending", "paid", "shipped", "delivered", "cancelled"],
    "role": ["admin", "editor", "viewer", "member"],
    "priority": ["low", "medium", "high", "urgent"],
    "currency": ["USD", "EUR", "GBP", "JPY"],
    "color": ["slate", "amber", "emerald", "rose", "indigo"],
    "sentence": [
        "Works exactly as described and arrived early.",
        "Solid build quality for the price.",
        "Setup took under five minutes.",
        "Battery life is better than expected.",
        "Compact enough to carry every day.",
        "Would recommend to a colleague.",
    ],
    "paragraph": [
        "A dependable everyday option. The materials feel sturdy, the "
        "finish is clean, and it holds up well after months of use.",
        "Designed for people who care about the details. Quiet, light, "
        "and it does not get in the way of the work.",
        "Straightforward and honest. No unnecessary features, nothing "
        "that needs configuring before it is useful.",
    ],
    "title": [
        "Getting Started", "Field Notes", "A Short Retrospective",
        "What Changed This Month", "Lessons From Shipping",
        "On Keeping Things Simple",
    ],
}

# Longest / most specific patterns first — "email" must win over the
# generic string fallback, and "unit_price" must match `price`, not `unit`.
ROLE_PATTERNS: list[tuple[str, str]] = [
    ("email",       r"e[-_]?mail"),
    ("password",    r"password|passwd|pwd|secret|token|api[-_]?key"),
    ("avatar",      r"avatar|photo|image|picture|thumbnail|logo|icon"),
    ("url",         r"url|link|website|homepage|href"),
    ("slug",        r"slug|permalink"),
    ("phone",       r"phone|mobile|tel(ephone)?|contact[-_]?number"),
    ("first_name",  r"first[-_]?name|given[-_]?name|forename"),
    ("last_name",   r"last[-_]?name|surname|family[-_]?name"),
    ("full_name",   r"full[-_]?name|display[-_]?name|^name$|user[-_]?name|username"),
    ("company",     r"company|organization|organisation|employer|vendor|supplier|brand"),
    ("city",        r"city|town"),
    ("country",     r"country|nation"),
    ("address",     r"address|street|addr"),
    ("zip",         r"zip|postal|postcode"),
    ("status",      r"status|state(?!ment)"),
    ("role",        r"^role$|permission|access[-_]?level"),
    ("priority",    r"priority|severity|urgency"),
    ("currency",    r"currency|iso[-_]?code"),
    ("color",       r"colou?r"),
    ("price",       r"price|amount|total|cost|salary|fee|balance|revenue|subtotal"),
    ("percent",     r"percent|rate|ratio|discount|tax"),
    ("quantity",    r"quantity|qty|stock|count|units|inventory"),
    ("rating",      r"rating|score|stars"),
    ("age",         r"^age$"),
    ("year",        r"^year$"),
    ("bio",         r"bio|about|summary|note|comment|message|content|body|description"),
    ("title",       r"title|headline|subject|label|caption"),
    ("product",     r"product|item|sku|article"),
    ("created_at",  r"created|inserted|registered|joined|signed[-_]?up"),
    ("updated_at",  r"updated|modified|changed|edited"),
    ("deleted_at",  r"deleted|archived|removed"),
    ("birth",       r"birth|dob|born"),
    ("expiry",      r"expir|valid[-_]?until|due|deadline"),
    ("is_flag",     r"^(is|has|can|should|allow|enable|active|verified|published)[-_]?"),
]

ROLE_ORDER = [r for r, _ in ROLE_PATTERNS]

_COMPILED = [(role, re.compile(pat, re.I)) for role, pat in ROLE_PATTERNS]


# Tables whose "title"/"name" column should read as a product, not an
# article headline. Without this, `products.title` becomes "Field Notes".
_PRODUCTY = re.compile(r"product|item|sku|article|inventory|catalog|goods|part", re.I)


def infer_role(column_name: str, column_type: str, table_name: str = "") -> str:
    """Return a semantic role for a column, or ``type:<declared>``.

    The name wins over the type: a ``string`` called ``price`` is money, and
    a ``decimal`` called ``latitude`` is not. The *table* name breaks ties
    that the column name alone cannot — ``title`` means something different
    in ``products`` than in ``posts``.

        >>> infer_role("email", "string")
        'email'
        >>> infer_role("unit_price", "decimal")
        'price'
        >>> infer_role("title", "string", "products")
        'product'
        >>> infer_role("title", "string", "posts")
        'title'
        >>> infer_role("random_field", "string")
        'type:string'
    """
    name = str(column_name or "").strip()
    for role, pattern in _COMPILED:
        if pattern.search(name):
            # A boolean-looking name on a non-boolean column is a false
            # positive ("active_users" is a count, not a flag).
            if role == "is_flag" and column_type != "boolean":
                continue
            # "title"/"name" inside a product-ish table is a product name.
            if role in ("title", "full_name") and _PRODUCTY.search(str(table_name)):
                return "product"
            return role

    # Nothing matched on the column: let the table hint at a bare `name`.
    if column_type in ("string", "text") and _PRODUCTY.search(str(table_name)):
        return "product"
    return f"type:{column_type}"


# ── deterministic pseudo-randomness ──────────────────────
def _rng(seed: str, index: int) -> int:
    """A stable integer for (seed, index). Same input, same row, always."""
    h = hashlib.blake2b(f"{seed}#{index}".encode(), digest_size=8).digest()
    return int.from_bytes(h, "big")


def _pick(bucket: str, seed: str, index: int, offset: int = 0) -> str:
    items = WORDS[bucket]
    return items[(_rng(seed, index) + offset) % len(items)]


def _slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", str(text).lower()).strip("-") or "item"


# Roles whose value already contains the row index, so `sample_values` must
# not append another uniqueness suffix.
_SELF_UNIQUE = frozenset({"email", "slug", "avatar", "uuid"})


def _value_for(role: str, seed: str, index: int, col: dict) -> Any:
    """Produce one believable value for a role."""
    n = _rng(seed, index)

    if role == "email":
        first = _pick("first", seed, index).lower()
        last = _pick("last", seed, index, 3).lower()
        # index keeps it unique even when the name repeats — the column is
        # very often UNIQUE and a collision would abort the whole insert.
        return f"{first}.{last}{index + 1}@example.com"

    if role == "password":
        # Never a real-looking secret: make it obvious this is not a
        # credential, and never something that would pass a strength check.
        return "changeme-not-a-real-password"

    if role == "first_name":
        return _pick("first", seed, index)
    if role == "last_name":
        return _pick("last", seed, index)
    if role == "full_name":
        return f"{_pick('first', seed, index)} {_pick('last', seed, index, 3)}"

    if role == "company":
        return _pick("company", seed, index)
    if role == "city":
        return _pick("city", seed, index)
    if role == "country":
        return _pick("country", seed, index)
    if role == "address":
        return f"{n % 250 + 1} {_pick('last', seed, index, 5)} Street"
    if role == "zip":
        return f"{n % 90000 + 10000}"

    if role == "phone":
        return f"+1-555-{n % 900 + 100}-{(n >> 8) % 9000 + 1000}"

    if role == "url":
        return f"https://example.com/{_slugify(_pick('company', seed, index))}"
    if role == "avatar":
        return f"https://example.com/media/{index + 1:03d}.jpg"

    if role == "slug":
        # Already unique via the index — `sample_values` must not add a
        # second suffix on top ("desk-lamp-3-3").
        return f"{_slugify(_pick('product', seed, index))}-{index + 1}"

    if role == "status":
        return _pick("status", seed, index)
    if role == "role":
        return _pick("role", seed, index)
    if role == "priority":
        return _pick("priority", seed, index)
    if role == "currency":
        return _pick("currency", seed, index)
    if role == "color":
        return _pick("color", seed, index)

    if role == "price":
        # Money looks like money: two decimals, and often a .99/.50 ending.
        cents = (n % 40000) / 100 + 4.99
        return round(cents, 2)
    if role == "percent":
        return round((n % 3500) / 100, 2)
    if role == "quantity":
        return n % 200 + 1
    if role == "rating":
        return round(3 + (n % 21) / 10, 1)      # 3.0 – 5.0
    if role == "age":
        return n % 45 + 20

    if role == "year":
        return 2015 + (n % 11)

    if role == "title":
        return _pick("title", seed, index)
    if role == "product":
        return _pick("product", seed, index)
    if role == "bio":
        return _pick("paragraph", seed, index) if col.get("raw_type") == "text" \
            else _pick("sentence", seed, index)

    if role in ("created_at", "updated_at", "expiry", "deleted_at", "birth"):
        return _temporal(role, seed, index, col)

    if role == "is_flag":
        # Mostly true — an all-false demo looks broken.
        return (n % 4) != 0

    # ── fall back to the declared type ──
    kind = role.split(":", 1)[1] if role.startswith("type:") else "string"
    return _by_type(kind, seed, index, col)


def _temporal(role: str, seed: str, index: int, col: dict) -> Any:
    n = _rng(seed, index)
    if role == "birth":
        d = date(1970 + n % 35, n % 12 + 1, n % 28 + 1)
        return d if col.get("raw_type") == "date" else datetime(
            d.year, d.month, d.day, tzinfo=timezone.utc)

    if role == "expiry":
        moment = datetime.now(timezone.utc) + timedelta(days=n % 180 + 7)
    elif role == "updated_at":
        moment = datetime.now(timezone.utc) - timedelta(hours=n % 720)
    else:  # created_at, deleted_at
        moment = datetime.now(timezone.utc) - timedelta(
            days=n % 90, hours=(n >> 4) % 24, minutes=(n >> 8) % 60)

    return moment.date() if col.get("raw_type") == "date" else moment


def _by_type(kind: str, seed: str, index: int, col: dict) -> Any:
    n = _rng(seed, index)
    name = col.get("name", "value")

    if kind in ("integer", "bigint"):
        return n % 1000 + 1
    if kind in ("float",):
        return round((n % 10000) / 100, 2)
    if kind == "decimal":
        return round((n % 50000) / 100, 2)
    if kind == "boolean":
        return (n % 3) != 0
    if kind == "datetime":
        return datetime.now(timezone.utc) - timedelta(days=n % 60)
    if kind == "date":
        return (datetime.now(timezone.utc) - timedelta(days=n % 60)).date()
    if kind == "uuid":
        h = hashlib.blake2b(f"{seed}{index}".encode(), digest_size=16).hexdigest()
        return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"
    if kind == "json":
        return {"source": "skaffo-seed", "index": index + 1}
    if kind == "text":
        return _pick("paragraph", seed, index)

    # String and anything unknown. The label is derived from the column name
    # so it stays readable, and a word from the table's own stream is mixed in
    # so two tables with an identically-named generic column do not produce
    # byte-identical demo data.
    label = str(name).replace("_", " ").strip().title() or "Value"
    flavour = _pick("color", seed, index, 7).title()
    return f"{label} {flavour} {index + 1}"


def sample_values(
    entity: dict,
    count: int,
    *,
    parent_ids: dict[str, list[Any]] | None = None,
) -> list[dict[str, Any]]:
    """Build `count` believable rows for one entity.

    ``parent_ids`` maps a column name to the list of primary keys already
    generated for the table it references, so foreign keys point at rows that
    genuinely exist. Insert order is the caller's responsibility (the DDL
    service already topologically sorts tables).
    """
    seed = str(entity.get("table") or entity.get("plural") or "table")
    parent_ids = parent_ids or {}
    rows: list[dict[str, Any]] = []

    for i in range(count):
        row: dict[str, Any] = {}
        for col in entity.get("columns", []):
            cname = col["name"]

            # Integer primary keys are left to the database so that
            # AUTOINCREMENT and sequences behave normally.
            if col.get("pk") and col.get("raw_type") in ("integer", "bigint"):
                continue

            # Foreign keys must reference a row that exists.
            if col.get("fk"):
                pool = parent_ids.get(cname) or []
                if pool:
                    row[cname] = pool[_rng(seed + cname, i) % len(pool)]
                    continue
                if col.get("nullable"):
                    row[cname] = None
                    continue

            role = infer_role(cname, col.get("raw_type", "string"), seed)
            value = _value_for(role, seed, i, col)

            # A UNIQUE column must not repeat inside the batch. Roles that
            # already embed the row index are skipped, otherwise a slug
            # comes out as "desk-lamp-3-3".
            if (
                col.get("unique")
                and isinstance(value, str)
                and role not in _SELF_UNIQUE
            ):
                value = f"{value}-{i + 1}"

            row[cname] = value
        rows.append(row)

    return rows
