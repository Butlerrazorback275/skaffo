"""First-run sample project.

Ships exactly ONE example so a new install has something to explore. It is
marked `is_sample` so the UI can offer to remove it, and every earlier build
also seeded four hollow projects with no tables — those were misleading and
have been dropped.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from .. import models
from ..core.database import SessionLocal


def _ago(days: float) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


def seed_if_empty() -> None:
    db = SessionLocal()
    try:
        if db.scalar(select(models.Project).limit(1)):
            return

        shop = models.Project(
            name="My Shop", description="Sample project — safe to delete",
            template="ecommerce", auth="jwt", docker=True,
            path="~/Projects/my-shop", pinned=True, is_sample=True,
            created_at=_ago(12), updated_at=_ago(0.4),
            last_build_at=_ago(0.4), last_export_at=_ago(1),
            file_count=148, lines_of_code=6420,
        )
        db.add(shop)
        db.flush()

        specs = {
            "users": ("#6366F1", 60, 60, [
                ("id", "integer", True, False, True, None),
                ("email", "string", False, False, True, None),
                ("password", "string", False, False, False, None),
                ("full_name", "string", False, True, False, None),
                ("is_active", "boolean", False, False, False, "true"),
                ("created_at", "datetime", False, False, False, "now()"),
            ]),
            "products": ("#10B981", 470, 40, [
                ("id", "integer", True, False, True, None),
                ("title", "string", False, False, False, None),
                ("slug", "string", False, False, True, None),
                ("description", "text", False, True, False, None),
                ("price", "decimal", False, False, False, None),
                ("stock", "integer", False, False, False, "0"),
                ("created_at", "datetime", False, False, False, "now()"),
            ]),
            "orders": ("#7C3AED", 265, 400, [
                ("id", "integer", True, False, True, None),
                ("user_id", "integer", False, False, False, None),
                ("product_id", "integer", False, False, False, None),
                ("quantity", "integer", False, False, False, "1"),
                ("total", "decimal", False, False, False, None),
                ("status", "string", False, False, False, "'pending'"),
                ("created_at", "datetime", False, False, False, "now()"),
            ]),
        }

        made: dict[str, models.Table] = {}
        for name, (color, x, y, cols) in specs.items():
            t = models.Table(project_id=shop.id, name=name, color=color, pos_x=x, pos_y=y)
            db.add(t)
            db.flush()
            for i, (cn, ct, pk, nul, uniq, dv) in enumerate(cols):
                db.add(models.Column(
                    table_id=t.id, name=cn, type=ct, primary_key=pk,
                    nullable=nul, unique=uniq, default_value=dv, sort_order=i,
                ))
            db.flush()
            made[name] = t

        def col_id(table: str, col: str) -> str:
            return next(c.id for c in made[table].columns if c.name == col)

        db.add(models.Relation(
            project_id=shop.id, kind="one-to-many",
            from_table_id=made["users"].id, from_column_id=col_id("users", "id"),
            to_table_id=made["orders"].id, to_column_id=col_id("orders", "user_id"),
            on_delete="cascade",
        ))
        db.add(models.Relation(
            project_id=shop.id, kind="one-to-many",
            from_table_id=made["products"].id, from_column_id=col_id("products", "id"),
            to_table_id=made["orders"].id, to_column_id=col_id("orders", "product_id"),
            on_delete="restrict",
        ))

        for method, path, summary, entity in [
            ("GET", "/api/users", "List users", "users"),
            ("POST", "/api/users", "Create user", "users"),
            ("GET", "/api/users/{id}", "Get user", "users"),
            ("PUT", "/api/users/{id}", "Replace user", "users"),
            ("DELETE", "/api/users/{id}", "Delete user", "users"),
            ("GET", "/api/products", "List products", "products"),
            ("POST", "/api/products", "Create product", "products"),
        ]:
            db.add(models.Endpoint(
                project_id=shop.id, method=method, path=path,
                summary=summary, entity=entity, generated=True,
            ))

        db.add(models.CrudOption(project_id=shop.id, entity="users", filtering=False))
        db.add(models.CrudOption(project_id=shop.id, entity="products", filtering=True))

        db.flush()
        for kind, msg, when in [
            ("build", "Build succeeded in 8.2s", 0.4),
            ("generate", "Generated CRUD for products", 0.5),
            ("export", "Exported as ZIP (2.4 MB)", 1),
        ]:
            db.add(models.Activity(
                project_id=shop.id, project_name=shop.name,
                kind=kind, message=msg, at=_ago(when),
            ))

        db.commit()
        print("[engine] seeded demo data", flush=True)
    finally:
        db.close()
