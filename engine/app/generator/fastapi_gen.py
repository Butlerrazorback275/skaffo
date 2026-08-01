"""generator-fastapi — emits a runnable FastAPI backend."""
from __future__ import annotations

from .base import (
    GenContext, GeneratedFile, make_env, py_default, py_type, safe_identifier, sqla_type,
)
from .custom_ep import build_custom_endpoints, custom_imports


class FastAPIGenerator:
    id = "gen.fastapi"
    name = "FastAPI Generator"

    def generate(self, ctx: GenContext) -> list[GeneratedFile]:
        env = make_env("backend")
        files: list[GeneratedFile] = []

        entities = self._entities(ctx)
        custom = build_custom_endpoints(ctx, entities)
        common = {
            "project": ctx.project,
            "name": ctx.name,
            "slug": ctx.slug,
            "snake": ctx.snake,
            "auth": ctx.auth,
            "docker": ctx.docker,
            "entities": entities,
            "has_tables": bool(entities),
            "custom": custom,
            "has_custom": bool(custom),
            "custom_imports": custom_imports(custom),
        }

        def render(tpl: str, out: str, **extra):
            files.append(GeneratedFile(out, env.get_template(tpl).render(**common, **extra)))

        render("main.py.j2", "backend/app/main.py")
        render("config.py.j2", "backend/app/core/config.py")
        render("database.py.j2", "backend/app/core/database.py")
        render("deps.py.j2", "backend/app/core/deps.py")
        render("requirements.txt.j2", "backend/requirements.txt")
        render("alembic.ini.j2", "backend/alembic.ini")
        render("alembic_env.py.j2", "backend/alembic/env.py")
        render("alembic_script.py.mako.j2", "backend/alembic/script.py.mako")

        if ctx.auth != "none":
            render("security.py.j2", "backend/app/core/security.py")
            render("auth_router.py.j2", "backend/app/routers/auth.py")
            render("auth_schema.py.j2", "backend/app/schemas/auth.py")

        # NOTE: "models" is deliberately excluded — it gets a real registry
        # below, and run_all() keeps the first file emitted for a given path.
        for pkg in ("", "core", "routers", "schemas", "services"):
            path = f"backend/app/{pkg}/__init__.py" if pkg else "backend/app/__init__.py"
            files.append(GeneratedFile(path, ""))

        for e in entities:
            render("model.py.j2", f"backend/app/models/{e['snake']}.py", e=e)
            render("schema.py.j2", f"backend/app/schemas/{e['snake']}.py", e=e)
            render("service.py.j2", f"backend/app/services/{e['snake']}_service.py", e=e)
            render("router.py.j2", f"backend/app/routers/{e['plural']}.py", e=e)
            render("test_entity.py.j2", f"backend/tests/test_{e['plural']}.py", e=e)

        if custom:
            render("custom_router.py.j2", "backend/app/routers/custom.py")
            render("test_custom.py.j2", "backend/tests/test_custom.py")

        render("models_init.py.j2", "backend/app/models/__init__.py")
        render("conftest.py.j2", "backend/tests/conftest.py")
        files.append(GeneratedFile("backend/tests/__init__.py", ""))

        return files

    # ── shape the schema into template-friendly dicts ────
    def _entities(self, ctx: GenContext) -> list[dict]:
        by_id = {t["id"]: t for t in ctx.tables}
        out: list[dict] = []

        for t in ctx.tables:
            # Table names are untrusted (UI input or an imported database),
            # and they become file paths — sanitize before anything else.
            plural = safe_identifier(t["name"])
            singular = plural[:-1] if plural.endswith("s") else plural
            cls = "".join(p.title() for p in singular.split("_")) or "Item"

            fks: dict[str, dict] = {}
            for r in ctx.relations:
                if r["toTableId"] == t["id"]:
                    parent = by_id.get(r["fromTableId"])
                    if not parent:
                        continue
                    pcol = next(
                        (c for c in parent["columns"] if c["id"] == r["fromColumnId"]),
                        None,
                    )
                    fks[r["toColumnId"]] = {
                        "table": parent["name"].lower(),
                        "column": pcol["name"] if pcol else "id",
                        "on_delete": r.get("onDelete", "cascade").upper(),
                    }

            cols = []
            for c in t["columns"]:
                cols.append({
                    "name": safe_identifier(c["name"], fallback="field"),
                    "sqla": sqla_type(c["type"]),
                    "py": py_type(c["type"]),
                    "pk": c["primaryKey"],
                    "nullable": c["nullable"] and not c["primaryKey"],
                    "unique": c["unique"],
                    "default": py_default(c),
                    "fk": fks.get(c["id"]),
                    "raw_type": c["type"],
                })

            # Precompute annotations: an inline {% endif %} would be eaten by
            # trim_blocks and join the next field onto the same line.
            for c in cols:
                c["ann"] = f"{c['py']} | None" if c["nullable"] else c["py"]
                c["ann_opt"] = f"{c['py']} | None = None" if c["nullable"] else c["py"]

            searchable = [c["name"] for c in cols if c["raw_type"] in ("string", "text")]
            opts = ctx.crud_options.get(plural, {})

            out.append({
                "table": plural,
                "plural": plural,
                "singular": singular,
                "class": cls,
                "snake": singular,
                "columns": cols,
                "pk": next((c for c in cols if c["pk"]), cols[0] if cols else None),
                "writable": [c for c in cols if not c["pk"]],
                "searchable": searchable,
                "needs_datetime": any(c["raw_type"] in ("datetime", "date") for c in cols),
                "needs_decimal": any(c["raw_type"] == "decimal" for c in cols),
                "opts": {
                    "search": opts.get("search", True) and bool(searchable),
                    "pagination": opts.get("pagination", True),
                    "sorting": opts.get("sorting", True),
                    "filtering": opts.get("filtering", False),
                },
            })
        return out
