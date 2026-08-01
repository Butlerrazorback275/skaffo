"""Phase 5 — custom endpoints, OpenAPI, and generated endpoint code."""
from __future__ import annotations

import pytest

from app.generator.base import GenContext
from app.generator.custom_ep import build_custom_endpoints, func_name, py_literal
from app.services.openapi_spec import build_openapi


def col(cid, name, typ="string", pk=False, nul=True, uni=False):
    return {"id": cid, "name": name, "type": typ, "primaryKey": pk,
            "nullable": nul, "unique": uni, "defaultValue": None}


@pytest.fixture
def tables():
    return [{
        "id": "t1", "name": "products", "color": "#6366F1",
        "position": {"x": 0, "y": 0},
        "columns": [
            col("c1", "id", "integer", pk=True, nul=False, uni=True),
            col("c2", "title", nul=False),
            col("c3", "price", "decimal", nul=False),
        ],
    }]


@pytest.fixture
def project():
    return {
        "name": "Shop", "description": "",
        "stack": {"backend": "fastapi", "frontend": "react",
                  "database": "sqlite", "auth": "jwt", "docker": False},
    }


def endpoint(**kw):
    base = {
        "id": "e1", "method": "GET", "path": "/api/products/search",
        "summary": "Search", "entity": "products", "generated": False,
        "description": "", "params": [], "requestFields": [],
        "responseKind": "entity", "responseEntity": "", "statusCode": 200,
        "authRequired": False, "tag": "", "sortOrder": 0,
    }
    base.update(kw)
    return base


# ── function naming ──────────────────────────────────────
@pytest.mark.parametrize("method,path,expected", [
    ("GET", "/api/products/search", "get_products_search"),
    ("POST", "/api/orders/{order_id}/refund", "post_orders_by_order_id_refund"),
    ("DELETE", "/api/users/{user_id}/sessions", "delete_users_by_user_id_sessions"),
    ("GET", "/", "get_root"),
])
def test_func_name(method, path, expected):
    assert func_name(method, path) == expected


def test_func_name_sanitises_hostile_path():
    """Paths are untrusted; the function name must stay a valid identifier."""
    name = func_name("GET", "/api/../../etc/passwd")
    assert "/" not in name and ".." not in name
    assert name.isidentifier()


# ── default literals ─────────────────────────────────────
@pytest.mark.parametrize("value,typ,expected", [
    ("20", "integer", "20"),
    ("1.5", "float", "1.5"),
    ("true", "boolean", "True"),
    ("no", "boolean", "False"),
    ("hello", "string", '"hello"'),
    (None, "string", "None"),
    ("", "integer", "None"),
    ("notanumber", "integer", "None"),
])
def test_py_literal(value, typ, expected):
    assert py_literal(value, typ) == expected


def test_py_literal_escapes_quotes():
    out = py_literal('say "hi"', "string")
    assert out.startswith('"') and out.endswith('"')
    assert '\\"' in out


# ── building custom endpoints ────────────────────────────
def _ctx(project, tables, endpoints):
    return GenContext(project=project, tables=tables, relations=[],
                      endpoints=endpoints, crud_options={})


def _entities(ctx):
    from app.generator.fastapi_gen import FastAPIGenerator
    return FastAPIGenerator()._entities(ctx)


def test_generated_endpoints_are_skipped(project, tables):
    ctx = _ctx(project, tables, [endpoint(generated=True)])
    assert build_custom_endpoints(ctx, _entities(ctx)) == []


def test_custom_endpoint_is_built(project, tables):
    ctx = _ctx(project, tables, [endpoint(
        params=[{"name": "q", "in": "query", "type": "string", "required": True}],
    )])
    built = build_custom_endpoints(ctx, _entities(ctx))
    assert len(built) == 1
    assert built[0]["func"] == "get_products_search"
    assert built[0]["query_params"][0]["name"] == "q"
    assert built[0]["query_params"][0]["required"] is True


def test_path_params_are_extracted(project, tables):
    ctx = _ctx(project, tables, [endpoint(
        method="POST", path="/api/orders/{order_id}/refund",
        params=[{"name": "order_id", "in": "path", "type": "integer", "required": True}],
    )])
    built = build_custom_endpoints(ctx, _entities(ctx))[0]
    assert [p["name"] for p in built["path_params"]] == ["order_id"]
    assert built["path_params"][0]["py"] == "int"


def test_required_query_params_sort_first(project, tables):
    ctx = _ctx(project, tables, [endpoint(params=[
        {"name": "limit", "in": "query", "type": "integer", "required": False, "default": "20"},
        {"name": "q", "in": "query", "type": "string", "required": True},
    ])])
    built = build_custom_endpoints(ctx, _entities(ctx))[0]
    # Python forbids a non-default arg after a defaulted one
    assert [q["name"] for q in built["query_params"]] == ["q", "limit"]


def test_body_only_for_write_methods(project, tables):
    fields = [{"name": "reason", "type": "string", "required": True}]
    get_ctx = _ctx(project, tables, [endpoint(method="GET", requestFields=fields)])
    post_ctx = _ctx(project, tables, [endpoint(method="POST", requestFields=fields)])
    assert build_custom_endpoints(get_ctx, _entities(get_ctx))[0]["has_body"] is False
    assert build_custom_endpoints(post_ctx, _entities(post_ctx))[0]["has_body"] is True


def test_duplicate_function_names_are_disambiguated(project, tables):
    ctx = _ctx(project, tables, [
        endpoint(id="a", path="/api/products/search"),
        endpoint(id="b", path="/api/products/search/"),
    ])
    names = [c["func"] for c in build_custom_endpoints(ctx, _entities(ctx))]
    assert len(names) == len(set(names))


def test_unknown_method_is_ignored(project, tables):
    ctx = _ctx(project, tables, [endpoint(method="TRACE")])
    assert build_custom_endpoints(ctx, _entities(ctx)) == []


# ── OpenAPI ──────────────────────────────────────────────
def test_openapi_is_valid(project, tables):
    spec = build_openapi(project, tables, [endpoint(
        params=[{"name": "q", "in": "query", "type": "string", "required": True}])])
    from openapi_spec_validator import validate
    validate(spec)                     # raises on any violation


def test_openapi_defaults_are_typed(project, tables):
    """Defaults are text in the UI but must be real JSON types in the spec."""
    spec = build_openapi(project, tables, [endpoint(params=[
        {"name": "limit", "in": "query", "type": "integer",
         "required": False, "default": "20"},
    ])])
    param = spec["paths"]["/api/products/search"]["get"]["parameters"][0]
    assert param["schema"]["default"] == 20
    assert isinstance(param["schema"]["default"], int)


def test_openapi_has_component_schemas(project, tables):
    spec = build_openapi(project, tables, [])
    schemas = spec["components"]["schemas"]
    assert "Product" in schemas
    assert "ProductCreate" in schemas
    assert "ProductPage" in schemas
    # the primary key is not part of the create payload
    assert "id" not in schemas["ProductCreate"]["properties"]


def test_openapi_security_scheme_when_auth_enabled(project, tables):
    spec = build_openapi(project, tables, [])
    assert "bearerAuth" in spec["components"]["securitySchemes"]


def test_openapi_no_security_scheme_without_auth(project, tables):
    project["stack"]["auth"] = "none"
    spec = build_openapi(project, tables, [])
    assert "securitySchemes" not in spec["components"]


def test_openapi_path_params_are_required(project, tables):
    spec = build_openapi(project, tables, [endpoint(
        method="POST", path="/api/orders/{order_id}/refund")])
    param = spec["paths"]["/api/orders/{order_id}/refund"]["post"]["parameters"][0]
    assert param["in"] == "path"
    assert param["required"] is True


def test_openapi_includes_health(project, tables):
    assert "/health" in build_openapi(project, tables, [])["paths"]


def test_openapi_request_body_from_fields(project, tables):
    spec = build_openapi(project, tables, [endpoint(
        method="POST", path="/api/orders/{order_id}/refund",
        requestFields=[{"name": "reason", "type": "string", "required": True},
                       {"name": "amount", "type": "decimal", "required": False}])])
    body = spec["paths"]["/api/orders/{order_id}/refund"]["post"]["requestBody"]
    schema = body["content"]["application/json"]["schema"]
    assert schema["required"] == ["reason"]
    assert "amount" in schema["properties"]


# ── generated code ───────────────────────────────────────
def test_custom_router_is_generated(project, tables):
    from app.generator import run_all

    project["stack"]["auth"] = "none"
    ctx = _ctx(project, tables, [endpoint(
        params=[{"name": "q", "in": "query", "type": "string", "required": True}])])
    files = run_all(ctx)
    router = next((f for f in files if f.path.endswith("routers/custom.py")), None)
    assert router is not None
    assert "def get_products_search(" in router.content
    assert "skaffo:keep:start get_products_search" in router.content


def test_custom_router_imports_decimal_when_needed(project, tables):
    from app.generator import run_all

    project["stack"]["auth"] = "none"
    ctx = _ctx(project, tables, [endpoint(
        method="POST", path="/api/orders/refund",
        requestFields=[{"name": "amount", "type": "decimal", "required": True}])])
    router = next(f for f in run_all(ctx) if f.path.endswith("routers/custom.py"))
    assert "from decimal import Decimal" in router.content


def test_custom_routes_registered_before_crud(project, tables):
    """A literal path must beat /{item_id}, so custom routes come first."""
    from app.generator import run_all

    project["stack"]["auth"] = "none"
    ctx = _ctx(project, tables, [endpoint()])
    main = next(f for f in run_all(ctx) if f.path.endswith("app/main.py"))
    assert main.content.index("custom_router.router") < main.content.index("products_router.router")


def test_no_custom_router_when_none_defined(project, tables):
    from app.generator import run_all

    project["stack"]["auth"] = "none"
    ctx = _ctx(project, tables, [])
    assert not any(f.path.endswith("routers/custom.py") for f in run_all(ctx))


def test_generated_custom_code_is_valid_python(project, tables):
    import ast
    from app.generator import run_all

    project["stack"]["auth"] = "none"
    ctx = _ctx(project, tables, [
        endpoint(params=[{"name": "q", "in": "query", "type": "string", "required": True},
                         {"name": "limit", "in": "query", "type": "integer",
                          "required": False, "default": "20"}]),
        endpoint(id="e2", method="POST", path="/api/orders/{order_id}/refund",
                 entity="products",
                 params=[{"name": "order_id", "in": "path", "type": "integer", "required": True}],
                 requestFields=[{"name": "reason", "type": "string", "required": True}]),
    ])
    for f in run_all(ctx):
        if f.path.endswith(".py") and f.content.strip():
            ast.parse(f.content)       # raises SyntaxError on bad output
