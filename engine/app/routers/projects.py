from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..core.database import get_db
from ..services.serialize import activity_out, project_out

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _get(db: Session, pid: str) -> models.Project:
    p = db.get(models.Project, pid)
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"project {pid} not found")
    return p


def _log(db: Session, p: models.Project | None, kind: str, message: str) -> None:
    db.add(models.Activity(
        project_id=p.id if p else None,
        project_name=p.name if p else "—",
        kind=kind, message=message,
    ))


@router.get("")
def list_projects(db: Session = Depends(get_db)):
    rows = db.scalars(select(models.Project).order_by(models.Project.updated_at.desc())).all()
    return [project_out(p) for p in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_project(body: schemas.ProjectCreate, db: Session = Depends(get_db)):
    slug = body.name.strip().lower().replace(" ", "-")
    p = models.Project(
        name=body.name.strip(),
        description=body.description,
        template=body.template,
        backend=body.stack.backend,
        frontend=body.stack.frontend,
        database=body.stack.database,
        auth=body.stack.auth,
        docker=body.stack.docker,
        path=body.path or f"~/Projects/{slug}",
    )
    db.add(p)
    db.flush()
    _log(db, p, "create", f"Project created from {body.template}")
    db.commit()
    db.refresh(p)
    return project_out(p)


@router.get("/{pid}")
def get_project(pid: str, db: Session = Depends(get_db)):
    return project_out(_get(db, pid))


@router.patch("/{pid}")
def patch_project(pid: str, body: schemas.ProjectPatch, db: Session = Depends(get_db)):
    p = _get(db, pid)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(p, field, value)
    db.commit()
    db.refresh(p)
    return project_out(p)


@router.delete("/{pid}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(pid: str, db: Session = Depends(get_db)):
    db.delete(_get(db, pid))
    db.commit()


@router.post("/{pid}/build")
def mark_build(pid: str, db: Session = Depends(get_db)):
    from datetime import datetime, timezone

    p = _get(db, pid)
    p.last_build_at = datetime.now(timezone.utc)
    _log(db, p, "build", "Build succeeded")
    db.commit()
    db.refresh(p)
    return project_out(p)


@router.post("/{pid}/export")
def mark_export(pid: str, db: Session = Depends(get_db)):
    from datetime import datetime, timezone

    p = _get(db, pid)
    p.last_export_at = datetime.now(timezone.utc)
    _log(db, p, "export", "Project exported")
    db.commit()
    db.refresh(p)
    return project_out(p)


@router.get("/{pid}/activity")
def project_activity(pid: str, limit: int = 40, db: Session = Depends(get_db)):
    _get(db, pid)
    rows = db.scalars(
        select(models.Activity)
        .where(models.Activity.project_id == pid)
        .order_by(models.Activity.at.desc())
        .limit(limit)
    ).all()
    return [activity_out(a) for a in rows]
