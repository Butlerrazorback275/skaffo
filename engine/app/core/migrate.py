"""Tiny forward-only migrator for Skaffo's own database.

Full Alembic is overkill here: this schema is ours, it only ever gains
columns, and users must never see a broken app after an update. Each step
is idempotent and guarded by a check against the live table info.
"""
from __future__ import annotations

from sqlalchemy import inspect, text

from .database import engine

# table -> [(column, DDL type + default)]
ADDITIVE: dict[str, list[tuple[str, str]]] = {
    "projects": [
        ("is_sample", "BOOLEAN DEFAULT 0"),
    ],
    "endpoints": [
        ("description", "TEXT DEFAULT ''"),
        ("params", "JSON DEFAULT '[]'"),
        ("request_fields", "JSON DEFAULT '[]'"),
        ("response_kind", "VARCHAR(24) DEFAULT 'entity'"),
        ("response_entity", "VARCHAR(120) DEFAULT ''"),
        ("status_code", "INTEGER DEFAULT 200"),
        ("auth_required", "BOOLEAN DEFAULT 0"),
        ("tag", "VARCHAR(80) DEFAULT ''"),
        ("sort_order", "INTEGER DEFAULT 0"),
    ],
}


def run_migrations() -> list[str]:
    """Add any missing columns. Returns a log of what changed."""
    applied: list[str] = []
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    with engine.begin() as conn:
        for table, columns in ADDITIVE.items():
            if table not in existing_tables:
                continue  # create_all will build it fresh
            have = {c["name"] for c in inspector.get_columns(table)}
            for name, ddl in columns:
                if name in have:
                    continue
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
                applied.append(f"{table}.{name}")

    if applied:
        print(f"[engine] migrated: {', '.join(applied)}", flush=True)
    return applied
