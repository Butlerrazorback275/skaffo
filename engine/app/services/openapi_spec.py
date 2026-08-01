"""Build an OpenAPI 3.1 document from the designed schema + endpoints.

This is what the Swagger preview renders, and it doubles as a check that
the design is coherent before any code is generated.
"""
from __future__ import annotations

from typing import Any

OPENAPI_TYPES: dict[str, dict[str, Any]] = {
    "integer": {"type": "integer"},
    "bigint": {"type": "integer", "format": "int64"},
    "string": {"type": "string"},
    "text": {"type": "string"},
    "boolean": {"type": "boolean"},
    "float": {"type": "number", "format": "double"},
    "decimal": {"type": "number", "format": "decimal"},
    "datetime": {"type": "string", "format": "date-time"},
    "date": {"type": "string", "format": "date"},
    "uuid": {"type": "string", "format": "uuid"},
    "json": {"type": "object", "additionalProperties": True},
}


def _schema_for(t: str) -> dict:
    return dict(OPENAPI_TYPES.get(t, {"type": "string"}))


def _pascal(name: str) -> str:
    return "".join(p.title() for p in str(name).replace("-", "_").split("_"))


def _singular(name: str) -> str:
    return name[:-1] if name.endswith("s") else name


def build_openapi(project: dict, tables: list[dict], endpoints: list[dict]) -> dict:
    """Assemble the full document."""
    title = project.get("name", "API")
    auth = project.get("stack", {}).get("auth", "none")

    components: dict[str, Any] = {"schemas": {}}
    if auth != "none":
        components["securitySchemes"] = {
            "bearerAuth": {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}
        }

    by_name = {t["name"].lower(): t for t in tables}

    # ── component schemas, one set per table ──
    for t in tables:
        model = _pascal(_singular(t["name"]))
        props: dict[str, Any] = {}
        required: list[str] = []
        create_props: dict[str, Any] = {}
        create_required: list[str] = []

        for c in t["columns"]:
            spec = _schema_for(c["type"])
            if c.get("nullable"):
                spec = {"anyOf": [spec, {"type": "null"}]}
            props[c["name"]] = spec
            if not c.get("nullable"):
                required.append(c["name"])

            if not c.get("primaryKey"):
                create_props[c["name"]] = spec
                if not c.get("nullable"):
                    create_required.append(c["name"])

        components["schemas"][model] = {
            "type": "object", "properties": props,
            **({"required": required} if required else {}),
        }
        components["schemas"][f"{model}Create"] = {
            "type": "object", "properties": create_props,
            **({"required": create_required} if create_required else {}),
        }
        components["schemas"][f"{model}Page"] = {
            "type": "object",
            "properties": {
                "items": {"type": "array", "items": {"$ref": f"#/components/schemas/{model}"}},
                "total": {"type": "integer"}, "page": {"type": "integer"},
                "size": {"type": "integer"}, "pages": {"type": "integer"},
            },
            "required": ["items", "total", "page", "size", "pages"],
        }

    components["schemas"]["HTTPError"] = {
        "type": "object",
        "properties": {"detail": {"type": "string"}},
        "required": ["detail"],
    }

    # ── paths ──
    paths: dict[str, Any] = {}

    for ep in sorted(endpoints, key=lambda e: (e.get("sortOrder", 0), e["path"])):
        raw_path = ep["path"]
        # {id} in our UI == {id} in OpenAPI, so no rewrite needed
        method = ep["method"].lower()
        entity = (ep.get("entity") or "").lower()
        table = by_name.get(entity)
        model = _pascal(_singular(entity)) if entity else None

        operation: dict[str, Any] = {
            "summary": ep.get("summary") or f"{ep['method']} {raw_path}",
            "operationId": _operation_id(ep),
            "tags": [ep.get("tag") or entity or "default"],
        }
        if ep.get("description"):
            operation["description"] = ep["description"]

        params: list[dict] = []

        # path params discovered from the URL template
        for name in _path_params(raw_path):
            declared = next(
                (p for p in ep.get("params", []) if p.get("name") == name and p.get("in") == "path"),
                None,
            )
            ptype = declared.get("type") if declared else _pk_type(table)
            params.append({
                "name": name, "in": "path", "required": True,
                "schema": _schema_for(ptype),
                **({"description": declared["description"]} if declared and declared.get("description") else {}),
            })

        for p in ep.get("params", []):
            if p.get("in") == "path":
                continue  # already handled
            entry: dict[str, Any] = {
                "name": p["name"],
                "in": p.get("in", "query"),
                "required": bool(p.get("required")),
                "schema": _schema_for(p.get("type", "string")),
            }
            if p.get("default") not in (None, ""):
                entry["schema"]["default"] = _coerce_default(
                    p["default"], p.get("type", "string"))
            if p.get("description"):
                entry["description"] = p["description"]
            params.append(entry)

        if params:
            operation["parameters"] = params

        # request body
        if method in ("post", "put", "patch"):
            fields = ep.get("requestFields") or []
            if fields:
                body_props = {
                    f["name"]: _schema_for(f.get("type", "string")) for f in fields
                }
                body_required = [f["name"] for f in fields if f.get("required")]
                operation["requestBody"] = {
                    "required": True,
                    "content": {"application/json": {"schema": {
                        "type": "object", "properties": body_props,
                        **({"required": body_required} if body_required else {}),
                    }}},
                }
            elif model and ep.get("generated"):
                ref = f"{model}Create" if method == "post" else model
                operation["requestBody"] = {
                    "required": True,
                    "content": {"application/json": {
                        "schema": {"$ref": f"#/components/schemas/{ref}"}}},
                }

        # response
        status = str(ep.get("statusCode") or _default_status(ep["method"]))
        operation["responses"] = {
            status: _response_for(ep, model),
            "404": {"description": "Not found",
                    "content": {"application/json": {
                        "schema": {"$ref": "#/components/schemas/HTTPError"}}}},
        }
        if method in ("post", "put", "patch"):
            operation["responses"]["422"] = {"description": "Validation error"}

        if ep.get("authRequired") or (auth != "none" and ep.get("generated")):
            operation["security"] = [{"bearerAuth": []}]

        paths.setdefault(raw_path, {})[method] = operation

    paths["/health"] = {
        "get": {
            "summary": "Health check", "operationId": "health", "tags": ["health"],
            "responses": {"200": {
                "description": "Service is up",
                "content": {"application/json": {"schema": {
                    "type": "object",
                    "properties": {"status": {"type": "string"}, "service": {"type": "string"}},
                }}},
            }},
        }
    }

    doc: dict[str, Any] = {
        "openapi": "3.1.0",
        "info": {
            "title": title,
            "version": "0.1.0",
            "description": project.get("description") or f"Generated by Skaffo",
        },
        "servers": [{"url": "http://127.0.0.1:8000", "description": "Local development"}],
        "paths": paths,
        "components": components,
    }
    return doc


def _coerce_default(value, typ: str):
    """Defaults are stored as text in the UI; OpenAPI wants real JSON types."""
    text = str(value)
    if typ in ("integer", "bigint"):
        try:
            return int(text)
        except ValueError:
            return None
    if typ in ("float", "decimal"):
        try:
            return float(text)
        except ValueError:
            return None
    if typ == "boolean":
        return text.strip().lower() in ("true", "1", "yes")
    return text


def _path_params(path: str) -> list[str]:
    out, buf, inside = [], [], False
    for ch in path:
        if ch == "{":
            inside, buf = True, []
        elif ch == "}" and inside:
            out.append("".join(buf))
            inside = False
        elif inside:
            buf.append(ch)
    return out


def _pk_type(table: dict | None) -> str:
    if not table:
        return "integer"
    pk = next((c for c in table["columns"] if c.get("primaryKey")), None)
    return pk["type"] if pk else "integer"


def _default_status(method: str) -> int:
    return {"POST": 201, "DELETE": 204}.get(method.upper(), 200)


def _response_for(ep: dict, model: str | None) -> dict:
    method = ep["method"].upper()
    kind = ep.get("responseKind", "entity")

    if method == "DELETE" or kind == "none":
        return {"description": "No content"}

    if kind == "list" and model:
        return {
            "description": "A page of results",
            "content": {"application/json": {
                "schema": {"$ref": f"#/components/schemas/{model}Page"}}},
        }
    if kind == "custom":
        return {"description": "Success",
                "content": {"application/json": {"schema": {"type": "object"}}}}
    if model:
        # list endpoints on a collection path return a page
        if method == "GET" and not _path_params(ep["path"]):
            return {
                "description": "A page of results",
                "content": {"application/json": {
                    "schema": {"$ref": f"#/components/schemas/{model}Page"}}},
            }
        return {"description": "Success",
                "content": {"application/json": {
                    "schema": {"$ref": f"#/components/schemas/{model}"}}}}
    return {"description": "Success"}


def _operation_id(ep: dict) -> str:
    base = ep["path"].strip("/").replace("/", "_").replace("{", "").replace("}", "")
    return f"{ep['method'].lower()}_{base}".replace("__", "_").replace("api_", "")
