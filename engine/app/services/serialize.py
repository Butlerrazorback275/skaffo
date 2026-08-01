"""ORM -> wire-format helpers.

Keeps route handlers thin and guarantees the JSON shape the React store
already expects (see src/core/types.ts).
"""
from __future__ import annotations

from .. import models


def column_out(c: models.Column) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "type": c.type,
        "primaryKey": c.primary_key,
        "nullable": c.nullable,
        "unique": c.unique,
        "defaultValue": c.default_value,
    }


def table_out(t: models.Table) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "color": t.color,
        "position": {"x": t.pos_x, "y": t.pos_y},
        "columns": [column_out(c) for c in t.columns],
    }


def relation_out(r: models.Relation) -> dict:
    return {
        "id": r.id,
        "kind": r.kind,
        "fromTableId": r.from_table_id,
        "fromColumnId": r.from_column_id,
        "toTableId": r.to_table_id,
        "toColumnId": r.to_column_id,
        "onDelete": r.on_delete,
    }


def endpoint_out(e: models.Endpoint) -> dict:
    return {
        "id": e.id,
        "method": e.method,
        "path": e.path,
        "summary": e.summary,
        "entity": e.entity,
        "generated": e.generated,
        "description": e.description or "",
        "params": e.params or [],
        "requestFields": e.request_fields or [],
        "responseKind": e.response_kind or "entity",
        "responseEntity": e.response_entity or "",
        "statusCode": e.status_code or 200,
        "authRequired": bool(e.auth_required),
        "tag": e.tag or "",
        "sortOrder": e.sort_order or 0,
    }


def _iso(dt) -> str | None:
    return dt.isoformat() if dt else None


def project_out(p: models.Project) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "description": p.description,
        "template": p.template,
        "stack": {
            "backend": p.backend,
            "frontend": p.frontend,
            "database": p.database,
            "auth": p.auth,
            "docker": p.docker,
        },
        "schema": {
            "tables": [table_out(t) for t in p.tables],
            "relations": [relation_out(r) for r in p.relations],
        },
        "api": {
            "endpoints": [endpoint_out(e) for e in p.endpoints],
            "crudOptions": {
                o.entity: {
                    "search": o.search,
                    "pagination": o.pagination,
                    "sorting": o.sorting,
                    "filtering": o.filtering,
                }
                for o in p.crud_options
            },
        },
        "path": p.path,
        "pinned": p.pinned,
        "isSample": bool(getattr(p, "is_sample", False)),
        "createdAt": _iso(p.created_at),
        "updatedAt": _iso(p.updated_at),
        "lastBuildAt": _iso(p.last_build_at),
        "lastExportAt": _iso(p.last_export_at),
        "fileCount": p.file_count,
        "linesOfCode": p.lines_of_code,
    }


def activity_out(a: models.Activity) -> dict:
    return {
        "id": a.id,
        "kind": a.kind,
        "projectId": a.project_id,
        "projectName": a.project_name,
        "message": a.message,
        "at": _iso(a.at),
    }
