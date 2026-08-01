"""Pydantic v2 schemas — the wire format shared with the React app.

Field names are camelCase to match the TypeScript types exactly, so the
frontend store needs no translation layer.
"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class Base(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


# ── columns ─────────────────────────────────────────────
class ColumnIn(Base):
    id: str | None = None
    name: str
    type: str = "string"
    primaryKey: bool = Field(False, alias="primary_key")
    nullable: bool = True
    unique: bool = False
    defaultValue: str | None = Field(None, alias="default_value")


class ColumnOut(Base):
    id: str
    name: str
    type: str
    primaryKey: bool = Field(alias="primary_key")
    nullable: bool
    unique: bool
    defaultValue: str | None = Field(None, alias="default_value")


# ── tables ──────────────────────────────────────────────
class Position(Base):
    x: float = 80
    y: float = 80


class TableIn(Base):
    name: str
    position: Position = Position()
    color: str = "#6366F1"
    columns: list[ColumnIn] = []


class TablePatch(Base):
    name: str | None = None
    position: Position | None = None
    color: str | None = None


class TableOut(Base):
    id: str
    name: str
    color: str
    position: Position
    columns: list[ColumnOut] = []


# ── relations ───────────────────────────────────────────
class RelationIn(Base):
    kind: str = "one-to-many"
    fromTableId: str = Field(alias="from_table_id")
    fromColumnId: str = Field(alias="from_column_id")
    toTableId: str = Field(alias="to_table_id")
    toColumnId: str = Field(alias="to_column_id")
    onDelete: str = Field("cascade", alias="on_delete")


class RelationOut(RelationIn):
    id: str


# ── endpoints ───────────────────────────────────────────
class EndpointParam(Base):
    name: str
    in_: str = Field("query", alias="in")
    type: str = "string"
    required: bool = False
    default: str | None = None
    description: str = ""

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)


class RequestField(Base):
    name: str
    type: str = "string"
    required: bool = True


class EndpointOut(Base):
    id: str
    method: str
    path: str
    summary: str
    entity: str
    generated: bool
    description: str = ""
    params: list[dict] = []
    requestFields: list[dict] = Field([], alias="request_fields")
    responseKind: str = Field("entity", alias="response_kind")
    responseEntity: str = Field("", alias="response_entity")
    statusCode: int = Field(200, alias="status_code")
    authRequired: bool = Field(False, alias="auth_required")
    tag: str = ""
    sortOrder: int = Field(0, alias="sort_order")


class EndpointIn(Base):
    method: str = "GET"
    path: str
    summary: str = ""
    entity: str = ""
    description: str = ""
    params: list[dict] = []
    requestFields: list[dict] = []
    responseKind: str = "entity"
    responseEntity: str = ""
    statusCode: int | None = None
    authRequired: bool = False
    tag: str = ""


class EndpointPatch(Base):
    method: str | None = None
    path: str | None = None
    summary: str | None = None
    entity: str | None = None
    description: str | None = None
    params: list[dict] | None = None
    requestFields: list[dict] | None = None
    responseKind: str | None = None
    responseEntity: str | None = None
    statusCode: int | None = None
    authRequired: bool | None = None
    tag: str | None = None
    sortOrder: int | None = None


class CrudOptionsOut(Base):
    search: bool
    pagination: bool
    sorting: bool
    filtering: bool


class CrudOptionsPatch(Base):
    search: bool | None = None
    pagination: bool | None = None
    sorting: bool | None = None
    filtering: bool | None = None


# ── project ─────────────────────────────────────────────
class Stack(Base):
    backend: str = "fastapi"
    frontend: str = "react"
    database: str = "sqlite"
    auth: str = "none"
    docker: bool = True
    seedData: bool = True
    seedRows: int = 12


class ProjectCreate(Base):
    name: str
    description: str = ""
    template: str = "blank"
    stack: Stack = Stack()
    path: str | None = None


class ProjectPatch(Base):
    name: str | None = None
    description: str | None = None
    pinned: bool | None = None
    path: str | None = None


class SchemaOut(Base):
    tables: list[TableOut] = []
    relations: list[RelationOut] = []


class ApiOut(Base):
    endpoints: list[EndpointOut] = []
    crudOptions: dict[str, CrudOptionsOut] = {}


class ProjectOut(Base):
    id: str
    name: str
    description: str
    template: str
    stack: Stack
    schema_: SchemaOut = Field(alias="schema")
    api: ApiOut
    path: str
    pinned: bool
    createdAt: datetime = Field(alias="created_at")
    updatedAt: datetime = Field(alias="updated_at")
    lastBuildAt: datetime | None = Field(None, alias="last_build_at")
    lastExportAt: datetime | None = Field(None, alias="last_export_at")
    fileCount: int = Field(alias="file_count")
    linesOfCode: int = Field(alias="lines_of_code")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True, serialize_by_alias=True)


class ActivityOut(Base):
    id: str
    kind: str
    projectId: str | None = Field(None, alias="project_id")
    projectName: str = Field("", alias="project_name")
    message: str
    at: datetime

    model_config = ConfigDict(from_attributes=True, populate_by_name=True, serialize_by_alias=True)


class SettingsOut(Base):
    theme: str = "dark"
    language: str = "en"
    accent: str = "#6366F1"
    autoSave: bool = True
    defaultBackend: str = "fastapi"
    defaultFrontend: str = "react"
    defaultDatabase: str = "sqlite"
    workspace: str = "~/Projects"
    checkUpdates: bool = True
    welcomeSeen: bool = False
