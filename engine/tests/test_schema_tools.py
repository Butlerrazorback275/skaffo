"""Phase 4 — validation, DDL export and schema import."""
from __future__ import annotations

import sqlite3

import pytest

from app.services.ddl import generate_ddl, introspect_sqlite, parse_sql
from app.services.validate import validate_schema


def col(cid, name, typ="string", pk=False, nul=True, uni=False, default=None):
    return {
        "id": cid, "name": name, "type": typ, "primaryKey": pk,
        "nullable": nul, "unique": uni, "defaultValue": default,
    }


def table(tid, name, columns, x=0, y=0):
    return {
        "id": tid, "name": name, "color": "#6366F1",
        "position": {"x": x, "y": y}, "columns": columns,
    }


@pytest.fixture
def good_schema():
    tables = [
        table("t1", "users", [
            col("c1", "id", "integer", pk=True, nul=False, uni=True),
            col("c2", "email", uni=True, nul=False),
        ]),
        table("t2", "orders", [
            col("c3", "id", "integer", pk=True, nul=False, uni=True),
            col("c4", "user_id", "integer", nul=False),
        ]),
    ]
    rels = [{
        "id": "r1", "kind": "one-to-many",
        "fromTableId": "t1", "fromColumnId": "c1",
        "toTableId": "t2", "toColumnId": "c4", "onDelete": "cascade",
    }]
    return tables, rels


# ── validation ───────────────────────────────────────────
def test_clean_schema_has_no_errors(good_schema):
    rep = validate_schema(*good_schema)
    assert rep.errors == 0
    assert rep.warnings == 0
    assert rep.to_dict()["ok"] is True


def test_empty_schema_is_info_only():
    rep = validate_schema([], [])
    assert rep.errors == 0
    assert rep.issues[0].code == "schema.empty"


def test_missing_primary_key():
    tables = [table("t1", "users", [col("c1", "email")])]
    codes = {i.code for i in validate_schema(tables, []).issues}
    assert "table.no_pk" in codes


def test_duplicate_table_name_case_insensitive():
    tables = [
        table("t1", "users", [col("c1", "id", "integer", pk=True, nul=False)]),
        table("t2", "Users", [col("c2", "id", "integer", pk=True, nul=False)]),
    ]
    assert "table.duplicate" in {i.code for i in validate_schema(tables, []).issues}


def test_duplicate_column_name():
    tables = [table("t1", "users", [
        col("c1", "id", "integer", pk=True, nul=False),
        col("c2", "email"), col("c3", "email"),
    ])]
    assert "column.duplicate" in {i.code for i in validate_schema(tables, []).issues}


def test_nullable_primary_key_is_error():
    tables = [table("t1", "users", [col("c1", "id", "integer", pk=True, nul=True)])]
    assert "column.pk_nullable" in {i.code for i in validate_schema(tables, []).issues}


def test_python_keyword_column_is_error():
    tables = [table("t1", "users", [
        col("c1", "id", "integer", pk=True, nul=False), col("c2", "class"),
    ])]
    assert "column.python_keyword" in {i.code for i in validate_schema(tables, []).issues}


def test_reserved_sql_word_is_warning():
    tables = [table("t1", "order", [col("c1", "id", "integer", pk=True, nul=False)])]
    issues = {i.code: i for i in validate_schema(tables, []).issues}
    assert issues["table.reserved_word"].severity == "warning"


def test_relation_type_mismatch(good_schema):
    tables, rels = good_schema
    tables[1]["columns"][1]["type"] = "string"      # user_id becomes str
    assert "relation.type_mismatch" in {i.code for i in validate_schema(tables, rels).issues}


def test_dangling_relation_detected(good_schema):
    tables, rels = good_schema
    rels[0]["fromTableId"] = "does-not-exist"
    assert "relation.dangling" in {i.code for i in validate_schema(tables, rels).issues}


def test_cycle_detection():
    tables = [
        table("a", "a", [col("a1", "id", "integer", pk=True, nul=False, uni=True),
                         col("a2", "b_id", "integer")]),
        table("b", "b", [col("b1", "id", "integer", pk=True, nul=False, uni=True),
                         col("b2", "a_id", "integer")]),
    ]
    rels = [
        {"id": "r1", "kind": "one-to-many", "fromTableId": "a", "fromColumnId": "a1",
         "toTableId": "b", "toColumnId": "b2", "onDelete": "cascade"},
        {"id": "r2", "kind": "one-to-many", "fromTableId": "b", "fromColumnId": "b1",
         "toTableId": "a", "toColumnId": "a2", "onDelete": "cascade"},
    ]
    cycles = [i for i in validate_schema(tables, rels).issues if i.code == "schema.cycle"]
    assert len(cycles) == 1          # reported once, not once per direction


def test_orphan_foreign_key_warning():
    tables = [
        table("t1", "users", [col("c1", "id", "integer", pk=True, nul=False)]),
        table("t2", "orders", [
            col("c2", "id", "integer", pk=True, nul=False),
            col("c3", "user_id", "integer"),
        ]),
    ]
    assert "column.orphan_fk" in {i.code for i in validate_schema(tables, []).issues}


# ── DDL ──────────────────────────────────────────────────
@pytest.mark.parametrize("dialect", ["sqlite", "postgresql", "mysql"])
def test_ddl_renders_every_dialect(good_schema, dialect):
    sql = generate_ddl(*good_schema, dialect)
    assert "CREATE TABLE" in sql
    assert "users" in sql and "orders" in sql
    assert "FOREIGN KEY" in sql


def test_ddl_is_executable_sqlite(good_schema, tmp_path):
    sql = generate_ddl(*good_schema, "sqlite")
    con = sqlite3.connect(tmp_path / "t.db")
    con.executescript(sql)              # raises if invalid
    names = {r[0] for r in con.execute("select name from sqlite_master where type='table'")}
    con.close()
    assert {"users", "orders"} <= names


def test_ddl_orders_parents_first(good_schema):
    sql = generate_ddl(*good_schema, "sqlite")
    assert sql.index('CREATE TABLE "users"') < sql.index('CREATE TABLE "orders"')


def test_ddl_rejects_unknown_dialect(good_schema):
    with pytest.raises(ValueError):
        generate_ddl(*good_schema, "oracle")


def test_postgres_uses_serial(good_schema):
    assert "SERIAL" in generate_ddl(*good_schema, "postgresql")


def test_mysql_uses_auto_increment(good_schema):
    assert "AUTO_INCREMENT" in generate_ddl(*good_schema, "mysql")


# ── import ───────────────────────────────────────────────
def test_roundtrip_ddl_then_introspect(good_schema, tmp_path):
    sql = generate_ddl(*good_schema, "sqlite")
    db = tmp_path / "rt.db"
    con = sqlite3.connect(db)
    con.executescript(sql)
    con.commit()
    con.close()

    back = introspect_sqlite(db)
    original = {t["name"]: sorted(c["name"] for c in t["columns"]) for t in good_schema[0]}
    restored = {t["name"]: sorted(c["name"] for c in t["columns"]) for t in back["tables"]}
    assert original == restored
    assert len(back["relations"]) == 1


def test_introspect_skips_internal_tables(tmp_path):
    db = tmp_path / "a.db"
    con = sqlite3.connect(db)
    con.executescript("""
        CREATE TABLE alembic_version (version_num VARCHAR(32) PRIMARY KEY);
        CREATE TABLE real_table (id INTEGER PRIMARY KEY, name TEXT);
    """)
    con.commit()
    con.close()
    names = [t["name"] for t in introspect_sqlite(db)["tables"]]
    assert names == ["real_table"]


def test_introspect_missing_file():
    with pytest.raises(FileNotFoundError):
        introspect_sqlite("/tmp/definitely-not-here.db")


def test_parse_mysql_style_dump():
    parsed = parse_sql("""
        CREATE TABLE IF NOT EXISTS `customers` (
          `id` INT NOT NULL AUTO_INCREMENT,
          `Email` VARCHAR(190) NOT NULL,
          `notes` LONGTEXT,
          PRIMARY KEY (`id`)
        );
        CREATE TABLE invoices (
            invoice_id BIGSERIAL PRIMARY KEY,
            customer_id INT NOT NULL,
            amount DECIMAL(10,2) DEFAULT 0.00,
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
        );
    """)
    names = {t["name"] for t in parsed["tables"]}
    assert names == {"customers", "invoices"}

    customers = next(t for t in parsed["tables"] if t["name"] == "customers")
    assert any(c["name"] == "id" and c["primaryKey"] for c in customers["columns"])
    assert any(c["name"] == "notes" and c["type"] == "text" for c in customers["columns"])
    assert len(parsed["relations"]) == 1
    assert parsed["relations"][0]["onDelete"] == "cascade"


def test_parse_empty_sql_returns_nothing():
    assert parse_sql("SELECT 1;")["tables"] == []


def test_imported_schema_validates(tmp_path):
    con = sqlite3.connect(tmp_path / "x.db")
    con.executescript("""
        PRAGMA foreign_keys=ON;
        CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
        CREATE TABLE books (
            id INTEGER PRIMARY KEY,
            author_id INTEGER NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
            title TEXT NOT NULL
        );
    """)
    con.commit()
    con.close()

    imported = introspect_sqlite(tmp_path / "x.db")
    rep = validate_schema(imported["tables"], imported["relations"])
    assert rep.errors == 0


def test_hostile_names_survive_import_to_ddl(tmp_path):
    """Import must not become an injection vector (see SECURITY-001)."""
    from app.generator.base import safe_identifier

    tables = [table("t1", "../../evil", [col("c1", "id", "integer", pk=True, nul=False)])]
    assert "/" not in safe_identifier(tables[0]["name"])
    assert ".." not in safe_identifier(tables[0]["name"])
