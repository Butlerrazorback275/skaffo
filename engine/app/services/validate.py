"""Schema validation — catch problems before they reach the generator.

Every issue has a stable `code` so the UI can group and link them, a
severity, and where possible the exact table/column it refers to.
"""
from __future__ import annotations

import keyword
import re
from dataclasses import asdict, dataclass, field
from typing import Literal

Severity = Literal["error", "warning", "info"]

IDENT_RE = re.compile(r"^[a-zA-Z_][0-9a-zA-Z_]*$")

# Reserved in SQL engines we target (or plan to).
SQL_RESERVED = {
    "select", "from", "where", "table", "index", "order", "group", "by",
    "insert", "update", "delete", "create", "drop", "alter", "join", "union",
    "primary", "foreign", "key", "constraint", "default", "null", "not",
    "and", "or", "in", "is", "as", "on", "having", "limit", "offset",
    "values", "into", "set", "distinct", "case", "when", "then", "else", "end",
    "user", "check", "references", "column", "database", "view", "grant",
}

# Columns that almost always want an index.
LOOKUP_HINTS = ("email", "slug", "username", "code", "token", "uuid")


@dataclass
class Issue:
    code: str
    severity: Severity
    message: str
    tableId: str | None = None
    tableName: str | None = None
    columnId: str | None = None
    columnName: str | None = None
    hint: str | None = None
    fixable: bool = False


@dataclass
class ValidationReport:
    issues: list[Issue] = field(default_factory=list)

    @property
    def errors(self) -> int:
        return sum(1 for i in self.issues if i.severity == "error")

    @property
    def warnings(self) -> int:
        return sum(1 for i in self.issues if i.severity == "warning")

    def to_dict(self) -> dict:
        return {
            "issues": [asdict(i) for i in self.issues],
            "errors": self.errors,
            "warnings": self.warnings,
            "infos": sum(1 for i in self.issues if i.severity == "info"),
            "ok": self.errors == 0,
        }


def _dupes(names: list[str]) -> set[str]:
    seen, dupe = set(), set()
    for n in names:
        low = n.lower()
        if low in seen:
            dupe.add(low)
        seen.add(low)
    return dupe


def validate_schema(tables: list[dict], relations: list[dict]) -> ValidationReport:
    r = ValidationReport()
    add = r.issues.append

    by_id = {t["id"]: t for t in tables}

    if not tables:
        add(Issue(
            code="schema.empty", severity="info",
            message="No tables yet",
            hint="Add a table to start designing your database.",
        ))
        return r

    # ── table-level ──────────────────────────────────────
    dupe_tables = _dupes([t["name"] for t in tables])
    for t in tables:
        name = t["name"]
        low = name.lower()

        if low in dupe_tables:
            add(Issue(
                code="table.duplicate", severity="error",
                message=f'Duplicate table name "{name}"',
                tableId=t["id"], tableName=name,
                hint="Table names must be unique (case-insensitive).",
            ))

        if not IDENT_RE.match(name):
            add(Issue(
                code="table.invalid_name", severity="error",
                message=f'"{name}" is not a valid identifier',
                tableId=t["id"], tableName=name,
                hint="Use letters, digits and underscores; cannot start with a digit.",
                fixable=True,
            ))

        if low in SQL_RESERVED:
            add(Issue(
                code="table.reserved_word", severity="warning",
                message=f'"{name}" is a reserved SQL word',
                tableId=t["id"], tableName=name,
                hint=f'Consider "{name}s" or a more specific name.',
            ))

        cols = t.get("columns", [])
        if not cols:
            add(Issue(
                code="table.no_columns", severity="error",
                message=f'Table "{name}" has no columns',
                tableId=t["id"], tableName=name,
                hint="Every table needs at least a primary key.",
                fixable=True,
            ))
            continue

        pks = [c for c in cols if c.get("primaryKey")]
        if not pks:
            add(Issue(
                code="table.no_pk", severity="error",
                message=f'Table "{name}" has no primary key',
                tableId=t["id"], tableName=name,
                hint="Add an integer id column as the primary key.",
                fixable=True,
            ))
        elif len(pks) > 1:
            add(Issue(
                code="table.composite_pk", severity="warning",
                message=f'Table "{name}" has {len(pks)} primary keys',
                tableId=t["id"], tableName=name,
                hint="Composite keys are not supported by the generator in v1.",
            ))

        if name != low:
            add(Issue(
                code="table.not_snake_case", severity="info",
                message=f'"{name}" is not lower_snake_case',
                tableId=t["id"], tableName=name,
                hint="Most SQL styles prefer lowercase table names.",
                fixable=True,
            ))

        # ── column-level ─────────────────────────────────
        dupe_cols = _dupes([c["name"] for c in cols])
        for c in cols:
            cname = c["name"]
            clow = cname.lower()

            if clow in dupe_cols:
                add(Issue(
                    code="column.duplicate", severity="error",
                    message=f'Duplicate column "{cname}" in "{name}"',
                    tableId=t["id"], tableName=name,
                    columnId=c["id"], columnName=cname,
                ))

            if not IDENT_RE.match(cname):
                add(Issue(
                    code="column.invalid_name", severity="error",
                    message=f'"{name}.{cname}" is not a valid identifier',
                    tableId=t["id"], tableName=name,
                    columnId=c["id"], columnName=cname,
                    fixable=True,
                ))

            if clow in SQL_RESERVED:
                add(Issue(
                    code="column.reserved_word", severity="warning",
                    message=f'"{cname}" is a reserved SQL word',
                    tableId=t["id"], tableName=name,
                    columnId=c["id"], columnName=cname,
                ))

            if keyword.iskeyword(clow):
                add(Issue(
                    code="column.python_keyword", severity="error",
                    message=f'"{cname}" is a Python keyword',
                    tableId=t["id"], tableName=name,
                    columnId=c["id"], columnName=cname,
                    hint="It would produce invalid model code.",
                    fixable=True,
                ))

            if c.get("primaryKey") and c.get("nullable"):
                add(Issue(
                    code="column.pk_nullable", severity="error",
                    message=f'Primary key "{name}.{cname}" is nullable',
                    tableId=t["id"], tableName=name,
                    columnId=c["id"], columnName=cname,
                    fixable=True,
                ))

            if (
                clow.endswith("_id")
                and not c.get("primaryKey")
                and not any(rel["toColumnId"] == c["id"] for rel in relations)
            ):
                target = clow[:-3]
                exists = any(
                    x["name"].lower() in (target, target + "s") for x in tables
                )
                add(Issue(
                    code="column.orphan_fk", severity="warning",
                    message=f'"{name}.{cname}" looks like a foreign key but has no relation',
                    tableId=t["id"], tableName=name,
                    columnId=c["id"], columnName=cname,
                    hint=(f'Draw a relation from "{target}" to "{name}".'
                          if exists else "Create the referenced table, then link it."),
                ))

            if clow in LOOKUP_HINTS and not c.get("unique") and not c.get("primaryKey"):
                add(Issue(
                    code="column.should_be_unique", severity="info",
                    message=f'"{name}.{cname}" is usually unique',
                    tableId=t["id"], tableName=name,
                    columnId=c["id"], columnName=cname,
                    hint="Marking it unique also creates an index.",
                    fixable=True,
                ))

    # ── relations ────────────────────────────────────────
    seen_pairs: set[tuple] = set()
    for rel in relations:
        src, dst = by_id.get(rel["fromTableId"]), by_id.get(rel["toTableId"])

        if not src or not dst:
            add(Issue(
                code="relation.dangling", severity="error",
                message="Relation points to a table that no longer exists",
                hint="Delete the relation and redraw it.",
                fixable=True,
            ))
            continue

        from_col = next((c for c in src["columns"] if c["id"] == rel["fromColumnId"]), None)
        to_col = next((c for c in dst["columns"] if c["id"] == rel["toColumnId"]), None)

        if not from_col or not to_col:
            add(Issue(
                code="relation.dangling_column", severity="error",
                message=f'Relation {src["name"]} → {dst["name"]} references a deleted column',
                tableId=dst["id"], tableName=dst["name"],
                fixable=True,
            ))
            continue

        if from_col["type"] != to_col["type"]:
            add(Issue(
                code="relation.type_mismatch", severity="error",
                message=(f'{src["name"]}.{from_col["name"]} ({from_col["type"]}) '
                         f'≠ {dst["name"]}.{to_col["name"]} ({to_col["type"]})'),
                tableId=dst["id"], tableName=dst["name"],
                columnId=to_col["id"], columnName=to_col["name"],
                hint="Foreign key and referenced column must share a type.",
                fixable=True,
            ))

        if not from_col.get("primaryKey") and not from_col.get("unique"):
            add(Issue(
                code="relation.parent_not_unique", severity="warning",
                message=f'{src["name"]}.{from_col["name"]} is neither primary nor unique',
                tableId=src["id"], tableName=src["name"],
                columnId=from_col["id"], columnName=from_col["name"],
                hint="A relation should point at a unique column.",
            ))

        pair = (rel["fromTableId"], rel["fromColumnId"], rel["toTableId"], rel["toColumnId"])
        if pair in seen_pairs:
            add(Issue(
                code="relation.duplicate", severity="warning",
                message=f'Duplicate relation {src["name"]} → {dst["name"]}',
                tableId=dst["id"], tableName=dst["name"],
            ))
        seen_pairs.add(pair)

        if rel["fromTableId"] == rel["toTableId"]:
            add(Issue(
                code="relation.self_reference", severity="info",
                message=f'"{src["name"]}" references itself',
                tableId=src["id"], tableName=src["name"],
                hint="Supported, but check the ON DELETE rule.",
            ))

    # ── cycles ───────────────────────────────────────────
    for cycle in _find_cycles(tables, relations):
        names = " → ".join(by_id[t]["name"] for t in cycle if t in by_id)
        add(Issue(
            code="schema.cycle", severity="warning",
            message=f"Circular dependency: {names}",
            hint="Cascading deletes in a cycle can fail; make one side nullable.",
        ))

    # ── isolated tables ──────────────────────────────────
    if len(tables) > 1:
        linked = {r["fromTableId"] for r in relations} | {r["toTableId"] for r in relations}
        for t in tables:
            if t["id"] not in linked:
                add(Issue(
                    code="table.isolated", severity="info",
                    message=f'"{t["name"]}" has no relations',
                    tableId=t["id"], tableName=t["name"],
                    hint="Fine for standalone tables like settings or logs.",
                ))

    order = {"error": 0, "warning": 1, "info": 2}
    r.issues.sort(key=lambda i: (order[i.severity], i.code))
    return r


def _find_cycles(tables: list[dict], relations: list[dict]) -> list[list[str]]:
    """Return simple cycles in the FK graph (excluding self-references)."""
    graph: dict[str, list[str]] = {t["id"]: [] for t in tables}
    for rel in relations:
        f, t = rel["fromTableId"], rel["toTableId"]
        if f in graph and t in graph and f != t:
            graph[f].append(t)

    cycles: list[list[str]] = []
    seen_sets: set[frozenset] = set()
    WHITE, GREY, BLACK = 0, 1, 2
    colour = dict.fromkeys(graph, WHITE)

    def walk(node: str, stack: list[str]) -> None:
        colour[node] = GREY
        stack.append(node)
        for nxt in graph[node]:
            if colour[nxt] == GREY:
                cyc = stack[stack.index(nxt):]
                key = frozenset(cyc)
                if key not in seen_sets:
                    seen_sets.add(key)
                    cycles.append(cyc + [nxt])
            elif colour[nxt] == WHITE:
                walk(nxt, stack)
        stack.pop()
        colour[node] = BLACK

    for node in graph:
        if colour[node] == WHITE:
            walk(node, [])
    return cycles
