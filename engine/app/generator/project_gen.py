"""generator-project — Docker, README, and repo-root files."""
from __future__ import annotations

from .base import GenContext, GeneratedFile, make_env


class ProjectFilesGenerator:
    id = "gen.project"
    name = "Project Files Generator"

    def generate(self, ctx: GenContext) -> list[GeneratedFile]:
        env = make_env("root")
        files: list[GeneratedFile] = []

        entities = [
            {
                "plural": t["name"].lower(),
                "label": t["name"].replace("_", " ").title(),
                "count": len(t["columns"]),
            }
            for t in ctx.tables
        ]

        common = {
            "project": ctx.project,
            "name": ctx.name,
            "slug": ctx.slug,
            "auth": ctx.auth,
            "docker": ctx.docker,
            "entities": entities,
            "description": ctx.project.get("description") or "",
            "endpoint_count": len(ctx.endpoints),
        }

        def render(tpl: str, out: str, **extra):
            files.append(GeneratedFile(out, env.get_template(tpl).render(**common, **extra)))

        render("README.md.j2", "README.md")
        render("gitignore.j2", ".gitignore")
        render("env.example.j2", ".env.example")
        render("LICENSE.j2", "LICENSE")

        if ctx.docker:
            render("docker-compose.yml.j2", "docker-compose.yml")
            render("Dockerfile.backend.j2", "docker/Dockerfile.backend")
            render("Dockerfile.frontend.j2", "docker/Dockerfile.frontend")
            render("nginx.conf.j2", "docker/nginx/default.conf")
            render("dockerignore.j2", ".dockerignore")

        return files
