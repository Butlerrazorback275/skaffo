"""generator-react — emits a runnable React + TS + Vite + Tailwind frontend."""
from __future__ import annotations

from .base import GenContext, GeneratedFile, make_env, safe_identifier, ts_type


class ReactGenerator:
    id = "gen.react"
    name = "React Generator"

    def generate(self, ctx: GenContext) -> list[GeneratedFile]:
        env = make_env("frontend")
        files: list[GeneratedFile] = []
        entities = self._entities(ctx)

        common = {
            "project": ctx.project,
            "name": ctx.name,
            "slug": ctx.slug,
            "auth": ctx.auth,
            "entities": entities,
            "has_entities": bool(entities),
        }

        def render(tpl: str, out: str, **extra):
            files.append(GeneratedFile(out, env.get_template(tpl).render(**common, **extra)))

        render("package.json.j2", "frontend/package.json")
        render("vite.config.ts.j2", "frontend/vite.config.ts")
        render("tsconfig.json.j2", "frontend/tsconfig.json")
        render("tsconfig.node.json.j2", "frontend/tsconfig.node.json")
        render("tailwind.config.js.j2", "frontend/tailwind.config.js")
        render("postcss.config.js.j2", "frontend/postcss.config.js")
        render("index.html.j2", "frontend/index.html")
        render("main.tsx.j2", "frontend/src/main.tsx")
        render("App.tsx.j2", "frontend/src/App.tsx")
        render("index.css.j2", "frontend/src/index.css")
        render("api.ts.j2", "frontend/src/lib/api.ts")
        render("types.ts.j2", "frontend/src/lib/types.ts")
        render("Layout.tsx.j2", "frontend/src/components/Layout.tsx")
        render("DataTable.tsx.j2", "frontend/src/components/DataTable.tsx")
        render("useApi.ts.j2", "frontend/src/hooks/useApi.ts")
        render("Home.tsx.j2", "frontend/src/pages/Home.tsx")
        render("env.d.ts.j2", "frontend/src/vite-env.d.ts")
        render("env.example.j2", "frontend/.env.example")

        if ctx.auth != "none":
            render("auth store.ts.j2".replace(" ", ""), "frontend/src/store/auth.ts")
            render("Login.tsx.j2", "frontend/src/pages/Login.tsx")

        for e in entities:
            render("EntityPage.tsx.j2", f"frontend/src/pages/{e['pascal_plural']}.tsx", e=e)

        return files

    def _entities(self, ctx: GenContext) -> list[dict]:
        out = []
        for t in ctx.tables:
            # Same rule as the backend: sanitize before it reaches a path.
            plural = safe_identifier(t["name"])
            singular = plural[:-1] if plural.endswith("s") else plural
            pascal = lambda s: "".join(p.title() for p in safe_identifier(s).split("_")) or "Item"
            cols = [{
                "name": safe_identifier(c["name"], fallback="field"),
                "ts": ts_type(c["type"]),
                "pk": c["primaryKey"],
                "optional": c["nullable"],
                "raw_type": c["type"],
            } for c in t["columns"]]
            out.append({
                "plural": plural,
                "singular": singular,
                "pascal": pascal(singular),
                "pascal_plural": pascal(plural),
                "label": plural.replace("_", " ").title(),
                "columns": cols,
                "list_columns": cols[:5],
                "pk": next((c for c in cols if c["pk"]), cols[0] if cols else None),
                "writable": [c for c in cols if not c["pk"]],
            })
        return out
