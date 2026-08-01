"""ORM models for Skaffo's own metadata database."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.database import Base


def _uid() -> str:
    return uuid.uuid4().hex[:12]


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: f"prj_{_uid()}")
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    template: Mapped[str] = mapped_column(String(32), default="blank")

    backend: Mapped[str] = mapped_column(String(24), default="fastapi")
    frontend: Mapped[str] = mapped_column(String(24), default="react")
    database: Mapped[str] = mapped_column(String(24), default="sqlite")
    auth: Mapped[str] = mapped_column(String(16), default="none")
    docker: Mapped[bool] = mapped_column(Boolean, default=True)
    seed_data: Mapped[bool] = mapped_column(Boolean, default=True)
    seed_rows: Mapped[int] = mapped_column(Integer, default=12)

    path: Mapped[str] = mapped_column(String(512), default="")
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    # Seeded on first run; the UI offers to remove it.
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)
    last_build_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_export_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    file_count: Mapped[int] = mapped_column(Integer, default=0)
    lines_of_code: Mapped[int] = mapped_column(Integer, default=0)

    tables: Mapped[list["Table"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="Table.id"
    )
    relations: Mapped[list["Relation"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    endpoints: Mapped[list["Endpoint"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    crud_options: Mapped[list["CrudOption"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    activities: Mapped[list["Activity"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


class Table(Base):
    __tablename__ = "tables"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: f"tbl_{_uid()}")
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    pos_x: Mapped[float] = mapped_column(default=80.0)
    pos_y: Mapped[float] = mapped_column(default=80.0)
    color: Mapped[str] = mapped_column(String(16), default="#6366F1")

    project: Mapped[Project] = relationship(back_populates="tables")
    columns: Mapped[list["Column"]] = relationship(
        back_populates="table", cascade="all, delete-orphan", order_by="Column.sort_order"
    )


class Column(Base):
    __tablename__ = "columns"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uid)
    table_id: Mapped[str] = mapped_column(ForeignKey("tables.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    type: Mapped[str] = mapped_column(String(24), default="string")
    primary_key: Mapped[bool] = mapped_column(Boolean, default=False)
    nullable: Mapped[bool] = mapped_column(Boolean, default=True)
    unique: Mapped[bool] = mapped_column(Boolean, default=False)
    default_value: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    table: Mapped[Table] = relationship(back_populates="columns")


class Relation(Base):
    __tablename__ = "relations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(24), default="one-to-many")
    from_table_id: Mapped[str] = mapped_column(String(32))
    from_column_id: Mapped[str] = mapped_column(String(32))
    to_table_id: Mapped[str] = mapped_column(String(32))
    to_column_id: Mapped[str] = mapped_column(String(32))
    on_delete: Mapped[str] = mapped_column(String(16), default="cascade")

    project: Mapped[Project] = relationship(back_populates="relations")


class Endpoint(Base):
    __tablename__ = "endpoints"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    method: Mapped[str] = mapped_column(String(10))
    path: Mapped[str] = mapped_column(String(255))
    summary: Mapped[str] = mapped_column(String(255), default="")
    entity: Mapped[str] = mapped_column(String(120))
    generated: Mapped[bool] = mapped_column(Boolean, default=True)

    # ── custom endpoints (Phase 5) ──
    description: Mapped[str] = mapped_column(Text, default="")
    # [{name, in: query|path|header, type, required, default, description}]
    params: Mapped[list] = mapped_column(JSON, default=list)
    # [{name, type, required}] — JSON body for POST/PUT/PATCH
    request_fields: Mapped[list] = mapped_column(JSON, default=list)
    response_kind: Mapped[str] = mapped_column(String(24), default="entity")
    response_entity: Mapped[str] = mapped_column(String(120), default="")
    status_code: Mapped[int] = mapped_column(Integer, default=200)
    auth_required: Mapped[bool] = mapped_column(Boolean, default=False)
    tag: Mapped[str] = mapped_column(String(80), default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    project: Mapped[Project] = relationship(back_populates="endpoints")


class CrudOption(Base):
    __tablename__ = "crud_options"
    __table_args__ = (UniqueConstraint("project_id", "entity", name="uq_crud_project_entity"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    entity: Mapped[str] = mapped_column(String(120))
    search: Mapped[bool] = mapped_column(Boolean, default=True)
    pagination: Mapped[bool] = mapped_column(Boolean, default=True)
    sorting: Mapped[bool] = mapped_column(Boolean, default=True)
    filtering: Mapped[bool] = mapped_column(Boolean, default=False)

    project: Mapped[Project] = relationship(back_populates="crud_options")


class Activity(Base):
    __tablename__ = "activities"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uid)
    project_id: Mapped[str | None] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=True
    )
    project_name: Mapped[str] = mapped_column(String(120), default="")
    kind: Mapped[str] = mapped_column(String(24))
    message: Mapped[str] = mapped_column(Text)
    at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    project: Mapped[Project | None] = relationship(back_populates="activities")


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON)
