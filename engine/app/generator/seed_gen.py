"""generator-seed — emits `backend/app/seed.py` with believable sample rows.

Architecture note
-----------------
This is a *generator*, so it obeys the project rule: context in,
``GeneratedFile[]`` out, never a database connection and never a write. The
sample data is not inserted here — a runnable script is produced and the user
(or `run.sh`) executes it. That keeps dry-run, ZIP export and per-file diffs
working for seed data for free, and means the user can read exactly what will
be inserted before anything happens.

Security
--------
Every value is emitted through the SECURITY-002 escapers. Sample values are
free text derived from column names, and column names can come from an
imported database, so they are untrusted input that lands in source code.
``_literal()`` below is the only place a value becomes Python.
"""
from __future__ import annotations

from datetime import date, datetime

from .base import GenContext, GeneratedFile, make_env, safe_identifier
from .escaping import py_str
from .seed_data import sample_values

DEFAULT_ROWS = 12
MAX_ROWS = 200


def _literal(value: object) -> str:
    """Render a Python value as source. Never interpolates raw text.

    Strings go through ``py_str`` (which is ``repr`` over a flattened value),
    so a product name containing a quote, a newline or a bidi override cannot
    break out of the literal.
    """
    if value is None:
        return "None"
    if isinstance(value, bool):
        return "True" if value else "False"
    if isinstance(value, (int, float)):
        return repr(value)
    if isinstance(value, datetime):
        tz = ", tzinfo=timezone.utc" if value.tzinfo else ""
        return (
            f"datetime({value.year}, {value.month}, {value.day}, "
            f"{value.hour}, {value.minute}, {value.second}{tz})"
        )
    if isinstance(value, date):
        return f"date({value.year}, {value.month}, {value.day})"
    if isinstance(value, dict):
        inner = ", ".join(f"{py_str(k)}: {_literal(v)}" for k, v in value.items())
        return "{" + inner + "}"
    if isinstance(value, (list, tuple)):
        return "[" + ", ".join(_literal(v) for v in value) + "]"
    return py_str(value)


def _topo_sort(entities: list[dict]) -> list[dict]:
    """Parents before children, so a foreign key always has a target.

    Cycles are tolerated: a self-referencing or mutually-referencing group is
    emitted in its original order and the runtime ``_ref`` resolution simply
    finds no parent and skips those rows rather than crashing.
    """
    by_table = {e["table"]: e for e in entities}
    ordered: list[dict] = []
    visiting: set[str] = set()
    done: set[str] = set()

    def visit(entity: dict) -> None:
        name = entity["table"]
        if name in done or name in visiting:
            return          # already placed, or a cycle — stop descending
        visiting.add(name)
        for col in entity.get("columns", []):
            fk = col.get("fk")
            if not fk:
                continue
            parent = by_table.get(safe_identifier(fk["table"]))
            if parent is not None and parent is not entity:
                visit(parent)
        visiting.discard(name)
        if name not in done:
            done.add(name)
            ordered.append(entity)

    for e in entities:
        visit(e)
    return ordered


def build_seed_entities(
    entities: list[dict], rows_per_table: int
) -> list[dict]:
    """Turn generator entities into render-ready seed blocks."""
    rows_per_table = max(1, min(int(rows_per_table), MAX_ROWS))
    ordered = _topo_sort(entities)
    out: list[dict] = []

    for entity in ordered:
        values = sample_values(entity, rows_per_table)

        rendered_rows = []
        for index, row in enumerate(values):
            pairs = []
            for col in entity.get("columns", []):
                cname = col["name"]
                if cname not in row:
                    continue          # DB-assigned primary key

                fk = col.get("fk")
                if fk:
                    parent = safe_identifier(fk["table"])
                    # Resolved at runtime against real primary keys.
                    pairs.append({
                        "key": cname,
                        "value": f"_ref({py_str(parent)}, {index})",
                    })
                    continue

                pairs.append({"key": cname, "value": _literal(row[cname])})

            # A table whose only column is an autoincrement primary key still
            # gets rows — `Model()` inserts a valid row, and a join table with
            # no payload columns is a normal thing to want seeded.
            rendered_rows.append(pairs)

        if not rendered_rows:
            continue

        pk = entity.get("pk") or {}
        out.append({
            "table": entity["table"],
            "cls": entity["class"],
            "var": entity["table"].upper(),
            "pk_attr": pk.get("name", "id"),
            "rows": rendered_rows,
        })

    return out


class SeedGenerator:
    id = "gen.seed"
    name = "Sample Data Generator"

    def generate(self, ctx: GenContext) -> list[GeneratedFile]:
        if not ctx.seed_enabled:
            return []

        # Reuse the FastAPI generator's entity shape: it already resolves
        # foreign keys, sanitises identifiers and precomputes types.
        from .fastapi_gen import FastAPIGenerator

        entities = FastAPIGenerator()._entities(ctx)
        if not entities:
            return []

        seed_entities = build_seed_entities(entities, ctx.seed_rows)
        if not seed_entities:
            return []

        env = make_env("backend")
        content = env.get_template("seed.py.j2").render(
            name=ctx.name,
            slug=ctx.slug,
            seed_entities=seed_entities,
        )
        return [GeneratedFile("backend/app/seed.py", content)]
