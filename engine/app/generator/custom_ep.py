"""Shape hand-written endpoints into template-ready dicts.

Kept separate from fastapi_gen so the quoting-heavy string work lives in
one place. Every identifier is sanitised because it lands in Python source
(see SECURITY-001).
"""
from __future__ import annotations

from .base import GenContext, py_type, safe_identifier

ALLOWED_METHODS = ("GET", "POST", "PUT", "PATCH", "DELETE")
DEFAULT_STATUS = {"POST": 201, "DELETE": 204}


def path_params(path: str) -> list[str]:
    out: list[str] = []
    buf: list[str] = []
    inside = False
    for ch in path:
        if ch == "{":
            inside, buf = True, []
        elif ch == "}" and inside:
            out.append("".join(buf))
            inside = False
        elif inside:
            buf.append(ch)
    return out


def py_literal(value, typ: str) -> str:
    """Render a default value as valid Python source."""
    if value in (None, ""):
        return "None"
    text = str(value)
    if typ in ("integer", "bigint"):
        try:
            return str(int(text))
        except ValueError:
            return "None"
    if typ in ("float", "decimal"):
        try:
            return str(float(text))
        except ValueError:
            return "None"
    if typ == "boolean":
        return "True" if text.strip().lower() in ("true", "1", "yes") else "False"
    escaped = text.replace("\\", "\\\\").replace('"', '\\"')
    return '"' + escaped + '"'


def _safe_text(value, fallback: str = "") -> str:
    """Strip characters that would break a generated docstring or literal."""
    text = str(value or fallback)
    return text.replace('"""', "'''").replace("\\", "/").strip()


def func_name(method: str, path: str) -> str:
    parts = [p for p in path.strip("/").split("/") if p and p != "api"]
    cleaned = ["by_" + p.strip("{}") if p.startswith("{") else p for p in parts]
    base = "_".join(cleaned) or "root"
    return safe_identifier(method.lower() + "_" + base, fallback="endpoint")


def build_custom_endpoints(ctx: GenContext, entities: list[dict]) -> list[dict]:
    by_entity = {e["plural"]: e for e in entities}
    out: list[dict] = []
    seen: set[str] = set()

    for ep in ctx.endpoints:
        if ep.get("generated", True):
            continue                       # CRUD is emitted per entity

        method = str(ep.get("method", "GET")).upper()
        if method not in ALLOWED_METHODS:
            continue

        path = str(ep.get("path", "/")).strip()
        if not path.startswith("/"):
            path = "/" + path

        name = func_name(method, path)
        if name in seen:
            name = name + "_" + str(len(out))
        seen.add(name)

        declared = ep.get("params") or []

        p_params = []
        for pname in path_params(path):
            found = next(
                (p for p in declared
                 if p.get("name") == pname and p.get("in") == "path"),
                None,
            )
            raw = found.get("type") if found else "integer"
            p_params.append({
                "name": safe_identifier(pname, fallback="param"),
                "py": py_type(raw),
            })

        q_params = []
        for p in declared:
            if p.get("in") not in (None, "", "query"):
                continue
            if not p.get("name"):
                continue
            typ = p.get("type", "string")
            q_params.append({
                "name": safe_identifier(p["name"], fallback="param"),
                "py": py_type(typ),
                "required": bool(p.get("required")),
                "default": py_literal(p.get("default"), typ),
                "description": _safe_text(p.get("description")).replace('"', "'"),
            })
        q_params.sort(key=lambda q: not q["required"])

        body = [
            {
                "name": safe_identifier(f["name"], fallback="field"),
                "py": py_type(f.get("type", "string")),
                "required": bool(f.get("required", True)),
            }
            for f in (ep.get("requestFields") or [])
            if f.get("name")
        ]

        entity = str(ep.get("entity") or "").lower()
        meta = by_entity.get(entity, {})

        out.append({
            "func": name,
            "method": method.lower(),
            "path": path,
            "summary": _safe_text(ep.get("summary"), method + " " + path).replace('"', "'"),
            "description": _safe_text(ep.get("description")),
            "status": ep.get("statusCode") or DEFAULT_STATUS.get(method, 200),
            "path_params": p_params,
            "query_params": q_params,
            "body_fields": body,
            "has_body": bool(body) and method in ("POST", "PUT", "PATCH"),
            "model": meta.get("class"),
            "entity": meta.get("plural"),
            "snake": meta.get("snake"),
            "auth": bool(ep.get("authRequired")),
            "tag": safe_identifier(ep.get("tag") or entity or "custom", fallback="custom"),
            "returns": method != "DELETE" and ep.get("responseKind") != "none",
        })
    return out


def custom_imports(custom: list[dict]) -> dict:
    """Which stdlib types the generated router must import."""
    used: set[str] = set()
    for c in custom:
        for group in (c["path_params"], c["query_params"], c["body_fields"]):
            for item in group:
                used.add(item["py"])
    return {
        "decimal": "Decimal" in used,
        "datetime": "datetime" in used or "date" in used,
        "has_datetime": "datetime" in used,
        "has_date": "date" in used,
    }
