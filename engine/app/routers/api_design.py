"""API Designer persistence — endpoints + CRUD feature flags."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..core.database import get_db
from ..services.serialize import endpoint_out

router = APIRouter(prefix="/api/projects/{pid}/api", tags=["api-design"])


def _project(db: Session, pid: str) -> models.Project:
    p = db.get(models.Project, pid)
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"project {pid} not found")
    return p


def _payload(p: models.Project) -> dict:
    return {
        "endpoints": [endpoint_out(e) for e in p.endpoints],
        "crudOptions": {
            o.entity: {
                "search": o.search, "pagination": o.pagination,
                "sorting": o.sorting, "filtering": o.filtering,
            }
            for o in p.crud_options
        },
    }


@router.get("")
def get_api(pid: str, db: Session = Depends(get_db)):
    return _payload(_project(db, pid))


@router.post("/generate/{entity}")
def generate_crud(pid: str, entity: str, db: Session = Depends(get_db)):
    """Regenerate the standard 6 REST endpoints for one entity."""
    p = _project(db, pid)
    singular = entity[:-1] if entity.endswith("s") else entity
    base = f"/api/{entity}"

    for e in list(p.endpoints):
        if e.entity == entity:
            db.delete(e)

    spec = [
        ("GET", base, f"List {entity}"),
        ("POST", base, f"Create {singular}"),
        ("GET", f"{base}/{{id}}", f"Get {singular}"),
        ("PUT", f"{base}/{{id}}", f"Replace {singular}"),
        ("PATCH", f"{base}/{{id}}", f"Update {singular}"),
        ("DELETE", f"{base}/{{id}}", f"Delete {singular}"),
    ]
    for method, path, summary in spec:
        db.add(models.Endpoint(
            project_id=p.id, method=method, path=path,
            summary=summary, entity=entity, generated=True,
        ))

    if not any(o.entity == entity for o in p.crud_options):
        db.add(models.CrudOption(project_id=p.id, entity=entity))

    db.add(models.Activity(
        project_id=p.id, project_name=p.name,
        kind="generate", message=f"Generated CRUD for {entity}",
    ))

    from datetime import datetime, timezone
    p.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(p)
    return _payload(p)


@router.patch("/crud/{entity}")
def patch_crud_options(
    pid: str, entity: str, body: schemas.CrudOptionsPatch, db: Session = Depends(get_db)
):
    p = _project(db, pid)
    opt = next((o for o in p.crud_options if o.entity == entity), None)
    if not opt:
        opt = models.CrudOption(project_id=p.id, entity=entity)
        db.add(opt)
        db.flush()
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(opt, field, value)
    db.commit()
    db.refresh(p)
    return _payload(p)


@router.delete("/endpoints/{eid}", status_code=status.HTTP_204_NO_CONTENT)
def delete_endpoint(pid: str, eid: str, db: Session = Depends(get_db)):
    _project(db, pid)
    e = db.get(models.Endpoint, eid)
    if not e or e.project_id != pid:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"endpoint {eid} not found")
    db.delete(e)
    db.commit()


# ── custom endpoints (Phase 5) ───────────────────────────
def _default_status(method: str) -> int:
    return {"POST": 201, "DELETE": 204}.get(method.upper(), 200)


def _normalize_path(raw: str) -> str:
    p = "/" + str(raw).strip().strip("/")
    return p.replace("//", "/")


@router.post("/endpoints", status_code=status.HTTP_201_CREATED)
def create_endpoint(pid: str, body: schemas.EndpointIn, db: Session = Depends(get_db)):
    """Add a hand-written endpoint."""
    p = _project(db, pid)
    path = _normalize_path(body.path)

    clash = next(
        (e for e in p.endpoints
         if e.path == path and e.method.upper() == body.method.upper()), None
    )
    if clash:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{body.method.upper()} {path} already exists",
        )

    e = models.Endpoint(
        project_id=p.id,
        method=body.method.upper(),
        path=path,
        summary=body.summary or f"{body.method.upper()} {path}",
        entity=body.entity or "",
        generated=False,                       # hand-written, never auto-replaced
        description=body.description,
        params=body.params,
        request_fields=body.requestFields,
        response_kind=body.responseKind,
        response_entity=body.responseEntity,
        status_code=body.statusCode or _default_status(body.method),
        auth_required=body.authRequired,
        tag=body.tag,
        sort_order=len(p.endpoints),
    )
    db.add(e)
    db.add(models.Activity(
        project_id=p.id, project_name=p.name, kind="edit",
        message=f"Added endpoint {e.method} {e.path}",
    ))
    from datetime import datetime, timezone
    p.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(p)
    return _payload(p)


@router.patch("/endpoints/{eid}")
def patch_endpoint(pid: str, eid: str, body: schemas.EndpointPatch, db: Session = Depends(get_db)):
    p = _project(db, pid)
    e = db.get(models.Endpoint, eid)
    if not e or e.project_id != pid:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"endpoint {eid} not found")

    data = body.model_dump(exclude_unset=True)
    mapping = {
        "method": "method", "path": "path", "summary": "summary", "entity": "entity",
        "description": "description", "params": "params",
        "requestFields": "request_fields", "responseKind": "response_kind",
        "responseEntity": "response_entity", "statusCode": "status_code",
        "authRequired": "auth_required", "tag": "tag", "sortOrder": "sort_order",
    }
    for wire, attr in mapping.items():
        if wire not in data:
            continue
        value = data[wire]
        if wire == "method":
            value = str(value).upper()
        if wire == "path":
            value = _normalize_path(value)
        setattr(e, attr, value)

    # editing a generated endpoint makes it hand-written
    e.generated = False

    from datetime import datetime, timezone
    p.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(p)
    return _payload(p)


@router.get("/openapi")
def openapi_spec(pid: str, db: Session = Depends(get_db)):
    """Live OpenAPI 3.1 document for the designed API."""
    from ..services.openapi_spec import build_openapi
    from ..services.serialize import project_out, table_out

    p = _project(db, pid)
    data = project_out(p)
    return build_openapi(
        project=data,
        tables=[table_out(t) for t in p.tables],
        endpoints=data["api"]["endpoints"],
    )
