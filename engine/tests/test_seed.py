"""Sample-data generation.

The value of seed data is that it is *believable*, so these tests assert on
semantics rather than "a string was produced": an ``email`` column must
contain an ``@``, a ``price`` must have at most two decimals, a UNIQUE column
must not repeat, and a foreign key must be a deferred reference rather than a
literal id.

The generated file is also parsed with ``ast`` and, in the integration test,
executed against a real SQLite database.
"""
from __future__ import annotations

import ast
import re
import sys
from datetime import date, datetime
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.generator.base import GenContext  # noqa: E402
from app.generator.seed_data import infer_role, sample_values  # noqa: E402
from app.generator.seed_gen import (  # noqa: E402
    MAX_ROWS,
    SeedGenerator,
    _literal,
    _topo_sort,
    build_seed_entities,
)


# ── helpers ──────────────────────────────────────────────
def col(name, raw_type, *, pk=False, unique=False, nullable=False, fk=None):
    return {
        "name": name, "raw_type": raw_type, "pk": pk, "unique": unique,
        "nullable": nullable, "fk": fk, "py": "str", "sqla": "String(255)",
    }


def entity(table, columns, cls=None):
    return {
        "table": table, "plural": table, "singular": table.rstrip("s"),
        "class": cls or table.title().rstrip("s"), "snake": table.rstrip("s"),
        "columns": columns, "pk": next((c for c in columns if c["pk"]), columns[0]),
    }


def ctx_with(tables, relations=(), *, seed=True, rows=8):
    return GenContext(
        project={
            "id": "p", "name": "Demo",
            "stack": {"backend": "fastapi", "frontend": "react",
                      "database": "sqlite", "auth": "none", "docker": False,
                      "seedData": seed, "seedRows": rows},
        },
        tables=list(tables), relations=list(relations),
        endpoints=[], crud_options={},
    )


# ── role inference ───────────────────────────────────────
@pytest.mark.parametrize("name,declared,expected", [
    ("email", "string", "email"),
    ("e_mail", "string", "email"),
    ("user_email", "string", "email"),
    ("password", "string", "password"),
    ("api_key", "string", "password"),
    ("first_name", "string", "first_name"),
    ("surname", "string", "last_name"),
    ("full_name", "string", "full_name"),
    ("price", "decimal", "price"),
    ("unit_price", "decimal", "price"),
    ("total", "decimal", "price"),
    ("salary", "integer", "price"),
    ("quantity", "integer", "quantity"),
    ("stock", "integer", "quantity"),
    ("status", "string", "status"),
    ("slug", "string", "slug"),
    ("phone", "string", "phone"),
    ("created_at", "datetime", "created_at"),
    ("updated_at", "datetime", "updated_at"),
    ("is_active", "boolean", "is_flag"),
    ("is_published", "boolean", "is_flag"),
    ("can_edit", "boolean", "is_flag"),
    ("website", "string", "url"),
    ("city", "string", "city"),
    ("rating", "float", "rating"),
])
def test_infer_role_reads_the_name(name, declared, expected):
    assert infer_role(name, declared) == expected


def test_boolean_role_requires_a_boolean_column():
    """`active_users` is a count, not a flag."""
    assert infer_role("active_users", "integer") != "is_flag"
    assert infer_role("is_active", "boolean") == "is_flag"


def test_table_name_disambiguates_title():
    """`title` means a product in products, a headline in posts."""
    assert infer_role("title", "string", "products") == "product"
    assert infer_role("title", "string", "posts") == "title"
    assert infer_role("name", "string", "inventory_items") == "product"


def test_unknown_names_fall_back_to_the_type():
    assert infer_role("wibble", "integer") == "type:integer"
    assert infer_role("xyz", "boolean") == "type:boolean"


# ── value quality ────────────────────────────────────────
def test_emails_are_email_shaped_and_unique():
    rows = sample_values(entity("users", [
        col("id", "integer", pk=True), col("email", "string", unique=True),
    ]), 20)
    emails = [r["email"] for r in rows]
    assert all(re.fullmatch(r"[^@\s]+@[^@\s]+\.[a-z]+", e) for e in emails)
    assert len(set(emails)) == 20, "UNIQUE column repeated inside one batch"
    assert all(e.endswith("@example.com") for e in emails), "must not look real"


def test_money_has_at_most_two_decimals():
    rows = sample_values(entity("orders", [
        col("id", "integer", pk=True), col("price", "decimal"),
    ]), 25)
    for r in rows:
        assert r["price"] > 0
        assert round(r["price"], 2) == r["price"], f"{r['price']} is not money-shaped"


def test_passwords_are_obviously_not_credentials():
    rows = sample_values(entity("users", [
        col("id", "integer", pk=True), col("password", "string"),
    ]), 5)
    for r in rows:
        assert "not-a-real-password" in r["password"]


def test_status_values_come_from_a_small_set():
    rows = sample_values(entity("orders", [
        col("id", "integer", pk=True), col("status", "string"),
    ]), 30)
    values = {r["status"] for r in rows}
    assert values <= {"pending", "paid", "shipped", "delivered", "cancelled"}
    assert len(values) > 1, "every row got the same status"


def test_booleans_are_not_all_false():
    rows = sample_values(entity("users", [
        col("id", "integer", pk=True), col("is_active", "boolean"),
    ]), 20)
    flags = [r["is_active"] for r in rows]
    assert any(flags) and not all(flags), "a demo needs a mix"


def test_dates_are_recent_and_typed():
    rows = sample_values(entity("posts", [
        col("id", "integer", pk=True),
        col("created_at", "datetime"), col("published_on", "date"),
    ]), 10)
    for r in rows:
        assert isinstance(r["created_at"], datetime)
        assert isinstance(r["published_on"], date)


def test_integer_primary_keys_are_left_to_the_database():
    rows = sample_values(entity("users", [
        col("id", "integer", pk=True), col("email", "string"),
    ]), 5)
    assert all("id" not in r for r in rows), "must not hard-code autoincrement ids"


def test_uuid_primary_keys_are_generated():
    rows = sample_values(entity("docs", [
        col("id", "uuid", pk=True), col("title", "string"),
    ]), 4)
    assert all(len(r["id"]) == 36 for r in rows)


def test_output_is_deterministic():
    """Regenerating a project must not produce a noisy diff."""
    spec = entity("users", [col("id", "integer", pk=True), col("email", "string")])
    assert sample_values(spec, 10) == sample_values(spec, 10)


def test_different_tables_get_different_data():
    a = sample_values(entity("users", [col("x", "string")]), 5)
    b = sample_values(entity("clients", [col("x", "string")]), 5)
    assert a != b, "seed is not varying per table"


def test_unicode_survives():
    rows = sample_values(entity("users", [
        col("id", "integer", pk=True), col("full_name", "string"),
    ]), 3)
    for r in rows:
        assert isinstance(r["full_name"], str) and r["full_name"]


# ── foreign keys ─────────────────────────────────────────
def test_topo_sort_puts_parents_first():
    users = entity("users", [col("id", "integer", pk=True)])
    orders = entity("orders", [
        col("id", "integer", pk=True),
        col("user_id", "integer", fk={"table": "users", "column": "id"}),
    ])
    ordered = [e["table"] for e in _topo_sort([orders, users])]
    assert ordered.index("users") < ordered.index("orders")


def test_topo_sort_survives_a_cycle():
    """A mutual reference must not hang or crash the generator."""
    a = entity("a", [col("id", "integer", pk=True),
                     col("b_id", "integer", fk={"table": "b", "column": "id"})])
    b = entity("b", [col("id", "integer", pk=True),
                     col("a_id", "integer", fk={"table": "a", "column": "id"})])
    out = _topo_sort([a, b])
    assert len(out) == 2


def test_self_reference_does_not_recurse_forever():
    t = entity("nodes", [col("id", "integer", pk=True),
                         col("parent_id", "integer",
                             fk={"table": "nodes", "column": "id"})])
    assert len(_topo_sort([t])) == 1


def test_foreign_keys_are_emitted_as_deferred_refs():
    users = entity("users", [col("id", "integer", pk=True), col("email", "string")])
    orders = entity("orders", [
        col("id", "integer", pk=True),
        col("user_id", "integer", fk={"table": "users", "column": "id"}),
    ])
    blocks = build_seed_entities([orders, users], 4)
    order_block = next(b for b in blocks if b["table"] == "orders")
    fk_pairs = [p for row in order_block["rows"] for p in row if p["key"] == "user_id"]
    assert fk_pairs, "no foreign key emitted"
    assert all(p["value"].startswith("_ref('users'") for p in fk_pairs)


# ── literal rendering (SECURITY-002) ─────────────────────
@pytest.mark.parametrize("value", [
    'quote " inside', "apostrophe ' inside", "back\\slash",
    "new\nline", "null\x00byte", "bidi\u202eoverride", "کافه",
])
def test_literals_round_trip_safely(value):
    rendered = _literal(value)
    parsed = ast.literal_eval(rendered)
    assert isinstance(parsed, str)
    assert "\n" not in parsed and "\x00" not in parsed


def test_literal_types():
    assert _literal(None) == "None"
    assert _literal(True) == "True"
    assert ast.literal_eval(_literal(12)) == 12
    assert ast.literal_eval(_literal(1.5)) == 1.5
    assert "datetime(" in _literal(datetime(2025, 3, 4, 5, 6, 7))
    assert "date(" in _literal(date(2025, 3, 4))


def test_hostile_column_name_cannot_break_the_file():
    """A column named to inject code must stay inside a literal."""
    rows = sample_values(entity("t", [
        col("id", "integer", pk=True),
        col('x") ; import os; os.system("id', "string"),
    ]), 3)
    for row in rows:
        for value in row.values():
            ast.literal_eval(_literal(value))


# ── generator wiring ─────────────────────────────────────
def test_disabled_emits_nothing():
    c = ctx_with([{"id": "t1", "name": "users", "columns": [
        {"id": "c1", "name": "id", "type": "integer", "primaryKey": True,
         "nullable": False, "unique": False, "defaultValue": None}]}], seed=False)
    assert SeedGenerator().generate(c) == []


def test_enabled_emits_one_file():
    c = ctx_with([{"id": "t1", "name": "users", "columns": [
        {"id": "c1", "name": "id", "type": "integer", "primaryKey": True,
         "nullable": False, "unique": False, "defaultValue": None},
        {"id": "c2", "name": "email", "type": "string", "primaryKey": False,
         "nullable": False, "unique": True, "defaultValue": None}]}])
    files = SeedGenerator().generate(c)
    assert [f.path for f in files] == ["backend/app/seed.py"]


def test_no_tables_emits_nothing():
    assert SeedGenerator().generate(ctx_with([])) == []


def test_generated_file_is_valid_python():
    c = ctx_with([{"id": "t1", "name": "products", "columns": [
        {"id": "c1", "name": "id", "type": "integer", "primaryKey": True,
         "nullable": False, "unique": False, "defaultValue": None},
        {"id": "c2", "name": "title", "type": "string", "primaryKey": False,
         "nullable": False, "unique": False, "defaultValue": None},
        {"id": "c3", "name": "price", "type": "decimal", "primaryKey": False,
         "nullable": False, "unique": False, "defaultValue": None}]}])
    ast.parse(SeedGenerator().generate(c)[0].content)


def test_row_count_is_clamped():
    table = {"id": "t1", "name": "users", "columns": [
        {"id": "c1", "name": "id", "type": "integer", "primaryKey": True,
         "nullable": False, "unique": False, "defaultValue": None},
        {"id": "c2", "name": "email", "type": "string", "primaryKey": False,
         "nullable": False, "unique": True, "defaultValue": None}]}
    huge = SeedGenerator().generate(ctx_with([table], rows=10_000))[0].content
    assert huge.count("@example.com") <= MAX_ROWS

    tiny = SeedGenerator().generate(ctx_with([table], rows=0))[0].content
    assert tiny.count("@example.com") >= 1


def test_hostile_project_name_is_escaped_in_the_docstring():
    c = ctx_with([{"id": "t1", "name": "users", "columns": [
        {"id": "c1", "name": "id", "type": "integer", "primaryKey": True,
         "nullable": False, "unique": False, "defaultValue": None}]}])
    c.project["name"] = 'Shop""" ; import os; os.system("id") #'
    ast.parse(SeedGenerator().generate(c)[0].content)
