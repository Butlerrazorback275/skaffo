"""Database Designer persistence — tables, columns, relations."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..core.database import get_db
from ..services.serialize import relation_out, table_out

router = APIRouter(prefix="/api/projects/{pid}/schema", tags=["schema"])


def _project(db: Session, pid: str) -> models.Project:
    p = db.get(models.Project, pid)
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"project {pid} not found")
    return p


def _table(db: Session, pid: str, tid: str) -> models.Table:
    t = db.get(models.Table, tid)
    if not t or t.project_id != pid:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"table {tid} not found")
    return t


def _touch(p: models.Project) -> None:
    from datetime import datetime, timezone
    p.updated_at = datetime.now(timezone.utc)


def _log(db: Session, p: models.Project, kind: str, msg: str) -> None:
    db.add(models.Activity(project_id=p.id, project_name=p.name, kind=kind, message=msg))


@router.get("")
def get_schema(pid: str, db: Session = Depends(get_db)):
    p = _project(db, pid)
    return {
        "tables": [table_out(t) for t in p.tables],
        "relations": [relation_out(r) for r in p.relations],
    }


# ── tables ──────────────────────────────────────────────
@router.post("/tables", status_code=status.HTTP_201_CREATED)
def add_table(pid: str, body: schemas.TableIn, db: Session = Depends(get_db)):
    p = _project(db, pid)
    t = models.Table(
        project_id=p.id, name=body.name, color=body.color,
        pos_x=body.position.x, pos_y=body.position.y,
    )
    db.add(t)
    db.flush()

    cols = body.columns or [schemas.ColumnIn(
        name="id", type="integer", primaryKey=True, nullable=False, unique=True
    )]
    for i, c in enumerate(cols):
        db.add(models.Column(
            table_id=t.id, name=c.name, type=c.type,
            primary_key=c.primaryKey, nullable=c.nullable, unique=c.unique,
            default_value=c.defaultValue, sort_order=i,
        ))

    _touch(p)
    _log(db, p, "edit", f'Added table "{t.name}"')
    db.commit()
    db.refresh(t)
    return table_out(t)


@router.patch("/tables/{tid}")
def patch_table(pid: str, tid: str, body: schemas.TablePatch, db: Session = Depends(get_db)):
    p = _project(db, pid)
    t = _table(db, pid, tid)
    data = body.model_dump(exclude_unset=True)
    if "name" in data:
        t.name = data["name"]
    if "color" in data:
        t.color = data["color"]
    if "position" in data and data["position"]:
        t.pos_x = data["position"]["x"]
        t.pos_y = data["position"]["y"]
    _touch(p)
    db.commit()
    db.refresh(t)
    return table_out(t)


@router.delete("/tables/{tid}", status_code=status.HTTP_204_NO_CONTENT)
def delete_table(pid: str, tid: str, db: Session = Depends(get_db)):
    p = _project(db, pid)
    t = _table(db, pid, tid)
    # drop relations touching this table
    for r in list(p.relations):
        if tid in (r.from_table_id, r.to_table_id):
            db.delete(r)
    db.delete(t)
    _touch(p)
    db.commit()


@router.post("/tables/{tid}/duplicate", status_code=status.HTTP_201_CREATED)
def duplicate_table(pid: str, tid: str, db: Session = Depends(get_db)):
    p = _project(db, pid)
    src = _table(db, pid, tid)
    copy = models.Table(
        project_id=p.id, name=f"{src.name}_copy", color=src.color,
        pos_x=src.pos_x + 40, pos_y=src.pos_y + 40,
    )
    db.add(copy)
    db.flush()
    for c in src.columns:
        db.add(models.Column(
            table_id=copy.id, name=c.name, type=c.type,
            primary_key=c.primary_key, nullable=c.nullable, unique=c.unique,
            default_value=c.default_value, sort_order=c.sort_order,
        ))
    _touch(p)
    db.commit()
    db.refresh(copy)
    return table_out(copy)


# ── columns ─────────────────────────────────────────────
@router.post("/tables/{tid}/columns", status_code=status.HTTP_201_CREATED)
def add_column(pid: str, tid: str, body: schemas.ColumnIn, db: Session = Depends(get_db)):
    p = _project(db, pid)
    t = _table(db, pid, tid)
    c = models.Column(
        table_id=t.id, name=body.name, type=body.type,
        primary_key=body.primaryKey, nullable=body.nullable, unique=body.unique,
        default_value=body.defaultValue, sort_order=len(t.columns),
    )
    db.add(c)
    _touch(p)
    db.commit()
    db.refresh(t)
    return table_out(t)


@router.patch("/tables/{tid}/columns/{cid}")
def patch_column(pid: str, tid: str, cid: str, body: schemas.ColumnIn, db: Session = Depends(get_db)):
    p = _project(db, pid)
    _table(db, pid, tid)
    c = db.get(models.Column, cid)
    if not c or c.table_id != tid:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"column {cid} not found")

    data = body.model_dump(exclude_unset=True)
    mapping = {
        "name": "name", "type": "type", "primaryKey": "primary_key",
        "nullable": "nullable", "unique": "unique", "defaultValue": "default_value",
    }
    for wire, attr in mapping.items():
        if wire in data:
            setattr(c, attr, data[wire])

    _touch(p)
    db.commit()
    return table_out(db.get(models.Table, tid))


@router.delete("/tables/{tid}/columns/{cid}", status_code=status.HTTP_204_NO_CONTENT)
def delete_column(pid: str, tid: str, cid: str, db: Session = Depends(get_db)):
    p = _project(db, pid)
    _table(db, pid, tid)
    c = db.get(models.Column, cid)
    if not c or c.table_id != tid:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"column {cid} not found")
    for r in list(p.relations):
        if cid in (r.from_column_id, r.to_column_id):
            db.delete(r)
    db.delete(c)
    _touch(p)
    db.commit()


# ── relations ───────────────────────────────────────────
@router.post("/relations", status_code=status.HTTP_201_CREATED)
def add_relation(pid: str, body: schemas.RelationIn, db: Session = Depends(get_db)):
    p = _project(db, pid)
    r = models.Relation(
        project_id=p.id, kind=body.kind,
        from_table_id=body.fromTableId, from_column_id=body.fromColumnId,
        to_table_id=body.toTableId, to_column_id=body.toColumnId,
        on_delete=body.onDelete,
    )
    db.add(r)
    _touch(p)
    db.commit()
    db.refresh(r)
    return relation_out(r)


@router.delete("/relations/{rid}", status_code=status.HTTP_204_NO_CONTENT)
def delete_relation(pid: str, rid: str, db: Session = Depends(get_db)):
    p = _project(db, pid)
    r = db.get(models.Relation, rid)
    if not r or r.project_id != pid:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"relation {rid} not found")
    db.delete(r)
    _touch(p)
    db.commit()
