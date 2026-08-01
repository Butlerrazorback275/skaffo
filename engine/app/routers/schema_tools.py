"""Phase 4 — validation, SQL export, and schema import."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models
from ..core.database import get_db
from ..services.ddl import DIALECTS, generate_ddl, introspect_sqlite, parse_sql
from ..services.serialize import project_out, relation_out, table_out
from ..services.validate import validate_schema

router = APIRouter(prefix="/api/projects/{pid}/schema", tags=["schema-tools"])


def _project(db: Session, pid: str) -> models.Project:
    p = db.get(models.Project, pid)
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"project {pid} not found")
    return p


def _schema(p: models.Project) -> tuple[list[dict], list[dict]]:
    return (
        [table_out(t) for t in p.tables],
        [relation_out(r) for r in p.relations],
    )


def _touch(p: models.Project) -> None:
    p.updated_at = datetime.now(timezone.utc)


@router.get("/validate")
def validate(pid: str, db: Session = Depends(get_db)):
    tables, relations = _schema(_project(db, pid))
    return validate_schema(tables, relations).to_dict()


@router.get("/ddl")
def ddl(pid: str, dialect: str = Query("sqlite"), db: Session = Depends(get_db)):
    if dialect not in DIALECTS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"dialect must be one of {DIALECTS}")
    tables, relations = _schema(_project(db, pid))
    return {"dialect": dialect, "sql": generate_ddl(tables, relations, dialect)}


# ── auto-fix ─────────────────────────────────────────────
class FixRequest(BaseModel):
    codes: list[str] | None = None      # None = apply every safe fix


SAFE_FIXES = {
    "table.no_pk", "table.no_columns", "column.pk_nullable",
    "column.should_be_unique", "table.not_snake_case",
    "relation.dangling", "relation.dangling_column",
    "relation.type_mismatch", "table.invalid_name",
    "column.invalid_name", "column.python_keyword",
}


def _sanitize(name: str, fallback: str) -> str:
    import re
    out = re.sub(r"[^0-9a-zA-Z_]+", "_", name).strip("_").lower()
    if not out:
        out = fallback
    if out[0].isdigit():
        out = f"{fallback}_{out}"
    return out


@router.post("/fix")
def fix(pid: str, body: FixRequest, db: Session = Depends(get_db)):
    """Apply mechanical fixes. Only touches issues flagged `fixable`."""
    p = _project(db, pid)
    wanted = set(body.codes) if body.codes else SAFE_FIXES
    wanted &= SAFE_FIXES

    tables, relations = _schema(p)
    report = validate_schema(tables, relations)
    applied: list[str] = []

    for issue in report.issues:
        if issue.code not in wanted:
            continue

        if issue.code in ("table.no_pk", "table.no_columns"):
            t = db.get(models.Table, issue.tableId)
            if t and not any(c.primary_key for c in t.columns):
                db.add(models.Column(
                    table_id=t.id, name="id", type="integer",
                    primary_key=True, nullable=False, unique=True, sort_order=-1,
                ))
                applied.append(f'Added primary key to "{t.name}"')

        elif issue.code == "column.pk_nullable":
            c = db.get(models.Column, issue.columnId)
            if c:
                c.nullable = False
                applied.append(f'"{issue.tableName}.{c.name}" is no longer nullable')

        elif issue.code == "column.should_be_unique":
            c = db.get(models.Column, issue.columnId)
            if c:
                c.unique = True
                applied.append(f'"{issue.tableName}.{c.name}" is now unique')

        elif issue.code == "table.not_snake_case":
            t = db.get(models.Table, issue.tableId)
            if t:
                old = t.name
                t.name = _sanitize(t.name, "table")
                applied.append(f'Renamed "{old}" → "{t.name}"')

        elif issue.code == "table.invalid_name":
            t = db.get(models.Table, issue.tableId)
            if t:
                old = t.name
                t.name = _sanitize(t.name, "table")
                applied.append(f'Renamed "{old}" → "{t.name}"')

        elif issue.code in ("column.invalid_name", "column.python_keyword"):
            c = db.get(models.Column, issue.columnId)
            if c:
                old = c.name
                new = _sanitize(c.name, "field")
                if issue.code == "column.python_keyword":
                    new = f"{new}_"
                c.name = new
                applied.append(f'Renamed column "{old}" → "{c.name}"')

        elif issue.code in ("relation.dangling", "relation.dangling_column"):
            for rel in list(p.relations):
                src = db.get(models.Table, rel.from_table_id)
                dst = db.get(models.Table, rel.to_table_id)
                bad = not src or not dst
                if not bad:
                    bad = not db.get(models.Column, rel.from_column_id) or \
                          not db.get(models.Column, rel.to_column_id)
                if bad:
                    db.delete(rel)
                    applied.append("Removed a dangling relation")

        elif issue.code == "relation.type_mismatch":
            for rel in p.relations:
                fc = db.get(models.Column, rel.from_column_id)
                tc = db.get(models.Column, rel.to_column_id)
                if fc and tc and fc.type != tc.type and tc.id == issue.columnId:
                    tc.type = fc.type
                    applied.append(f'"{issue.tableName}.{tc.name}" type set to {fc.type}')

    if applied:
        _touch(p)
        db.add(models.Activity(
            project_id=p.id, project_name=p.name, kind="edit",
            message=f"Auto-fixed {len(applied)} schema issue(s)",
        ))
        db.commit()
        db.refresh(p)

    tables, relations = _schema(p)
    return {
        "applied": applied,
        "report": validate_schema(tables, relations).to_dict(),
        "project": project_out(p),
    }


# ── import ───────────────────────────────────────────────
class ImportRequest(BaseModel):
    mode: str = "replace"               # replace | merge
    sql: str | None = None
    dbPath: str | None = None


@router.post("/import")
def import_schema(pid: str, body: ImportRequest, db: Session = Depends(get_db)):
    """Reverse-engineer a schema from pasted SQL or a SQLite file."""
    p = _project(db, pid)

    if body.sql:
        parsed = parse_sql(body.sql)
        source = "SQL"
    elif body.dbPath:
        try:
            parsed = introspect_sqlite(body.dbPath)
        except FileNotFoundError as exc:
            raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Could not read database: {exc}") from exc
        source = "SQLite file"
    else:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Provide either sql or dbPath")

    if not parsed["tables"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No CREATE TABLE statements found")

    if body.mode == "replace":
        for t in list(p.tables):
            db.delete(t)
        for r in list(p.relations):
            db.delete(r)
        db.flush()

    existing = {t.name.lower() for t in p.tables}
    id_map: dict[str, str] = {}
    col_map: dict[str, str] = {}
    added = skipped = 0

    for t in parsed["tables"]:
        if t["name"].lower() in existing:
            skipped += 1
            continue
        row = models.Table(
            project_id=p.id, name=t["name"], color=t["color"],
            pos_x=t["position"]["x"], pos_y=t["position"]["y"],
        )
        db.add(row)
        db.flush()
        id_map[t["id"]] = row.id

        for i, c in enumerate(t["columns"]):
            col = models.Column(
                table_id=row.id, name=c["name"], type=c["type"],
                primary_key=c["primaryKey"], nullable=c["nullable"],
                unique=c["unique"], default_value=c["defaultValue"], sort_order=i,
            )
            db.add(col)
            db.flush()
            col_map[c["id"]] = col.id
        added += 1

    rel_added = 0
    for rel in parsed["relations"]:
        f_t, t_t = id_map.get(rel["fromTableId"]), id_map.get(rel["toTableId"])
        f_c, t_c = col_map.get(rel["fromColumnId"]), col_map.get(rel["toColumnId"])
        if not all((f_t, t_t, f_c, t_c)):
            continue
        db.add(models.Relation(
            project_id=p.id, kind=rel["kind"],
            from_table_id=f_t, from_column_id=f_c,
            to_table_id=t_t, to_column_id=t_c,
            on_delete=rel["onDelete"],
        ))
        rel_added += 1

    _touch(p)
    db.add(models.Activity(
        project_id=p.id, project_name=p.name, kind="edit",
        message=f"Imported {added} table(s) from {source}",
    ))
    db.commit()
    db.refresh(p)

    tables, relations = _schema(p)
    return {
        "added": added, "skipped": skipped, "relations": rel_added,
        "source": source,
        "report": validate_schema(tables, relations).to_dict(),
        "project": project_out(p),
    }


class PreviewImportRequest(BaseModel):
    sql: str | None = None
    dbPath: str | None = None


@router.post("/import/preview")
def preview_import(pid: str, body: PreviewImportRequest, db: Session = Depends(get_db)):
    """Parse without touching the project."""
    _project(db, pid)
    try:
        if body.sql:
            parsed = parse_sql(body.sql)
        elif body.dbPath:
            parsed = introspect_sqlite(body.dbPath)
        else:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Provide either sql or dbPath")
    except HTTPException:
        raise
    except FileNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    return {
        "tables": [
            {"name": t["name"], "columns": len(t["columns"]),
             "fields": [c["name"] for c in t["columns"][:6]]}
            for t in parsed["tables"]
        ],
        "relationCount": len(parsed["relations"]),
    }


# ── bulk replace (used by Undo/Redo) ─────────────────────
class BulkColumn(BaseModel):
    name: str
    type: str = "string"
    primaryKey: bool = False
    nullable: bool = True
    unique: bool = False
    defaultValue: str | None = None


class BulkTable(BaseModel):
    id: str                                  # client-side id, for relation mapping
    name: str
    color: str = "#6366F1"
    position: dict = {"x": 80, "y": 80}
    columns: list[BulkColumn] = []


class BulkRelation(BaseModel):
    kind: str = "one-to-many"
    fromTableId: str
    fromColumnIndex: int
    toTableId: str
    toColumnIndex: int
    onDelete: str = "cascade"


class ReplaceSchemaRequest(BaseModel):
    tables: list[BulkTable] = []
    relations: list[BulkRelation] = []


@router.put("")
def replace_schema(pid: str, body: ReplaceSchemaRequest, db: Session = Depends(get_db)):
    """Atomically swap the whole schema.

    Undo/Redo used to issue one request per table *and* per column, which
    hammered SQLite and could trip "database is locked". This does the entire
    replacement inside a single transaction instead.
    """
    p = _project(db, pid)

    for t in list(p.tables):
        db.delete(t)
    for r in list(p.relations):
        db.delete(r)
    db.flush()

    tbl_map: dict[str, str] = {}
    col_map: dict[tuple[str, int], str] = {}

    for t in body.tables:
        row = models.Table(
            project_id=p.id, name=t.name, color=t.color,
            pos_x=t.position.get("x", 80), pos_y=t.position.get("y", 80),
        )
        db.add(row)
        db.flush()
        tbl_map[t.id] = row.id

        for i, c in enumerate(t.columns):
            col = models.Column(
                table_id=row.id, name=c.name, type=c.type,
                primary_key=c.primaryKey, nullable=c.nullable,
                unique=c.unique, default_value=c.defaultValue, sort_order=i,
            )
            db.add(col)
            db.flush()
            col_map[(t.id, i)] = col.id

    for rel in body.relations:
        f_t, t_t = tbl_map.get(rel.fromTableId), tbl_map.get(rel.toTableId)
        f_c = col_map.get((rel.fromTableId, rel.fromColumnIndex))
        t_c = col_map.get((rel.toTableId, rel.toColumnIndex))
        if not all((f_t, t_t, f_c, t_c)):
            continue
        db.add(models.Relation(
            project_id=p.id, kind=rel.kind,
            from_table_id=f_t, from_column_id=f_c,
            to_table_id=t_t, to_column_id=t_c,
            on_delete=rel.onDelete,
        ))

    _touch(p)
    db.commit()
    db.refresh(p)

    tables, relations = _schema(p)
    return {
        "report": validate_schema(tables, relations).to_dict(),
        "project": project_out(p),
    }
