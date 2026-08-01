"""Health, settings and the global activity feed."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..core.config import settings as cfg
from ..core.database import get_db
from ..services.serialize import activity_out

router = APIRouter(tags=["misc"])

SETTINGS_KEY = "app"


@router.get("/health")
def health():
    return {
        "status": "ok",
        "app": cfg.APP_NAME,
        "version": cfg.VERSION,
        "db": str(cfg.db_path),
    }


@router.get("/api/activity")
def activity(limit: int = 40, db: Session = Depends(get_db)):
    rows = db.scalars(
        select(models.Activity).order_by(models.Activity.at.desc()).limit(limit)
    ).all()
    return [activity_out(a) for a in rows]


@router.get("/api/settings")
def get_settings(db: Session = Depends(get_db)):
    row = db.get(models.AppSetting, SETTINGS_KEY)
    if not row:
        return schemas.SettingsOut().model_dump()
    return {**schemas.SettingsOut().model_dump(), **row.value}


@router.put("/api/settings")
def put_settings(body: dict, db: Session = Depends(get_db)):
    row = db.get(models.AppSetting, SETTINGS_KEY)
    merged = {**(row.value if row else {}), **body}
    if row:
        row.value = merged
    else:
        db.add(models.AppSetting(key=SETTINGS_KEY, value=merged))
    db.commit()
    return {**schemas.SettingsOut().model_dump(), **merged}
