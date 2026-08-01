"""Generator registry + orchestration.

Plugins are pure: context in, files out. Only `writer.py` touches the disk.
"""
from __future__ import annotations

from .base import GeneratedFile, GenContext, Generator
from .fastapi_gen import FastAPIGenerator
from .project_gen import ProjectFilesGenerator
from .react_gen import ReactGenerator
from .seed_gen import SeedGenerator

REGISTRY: dict[str, Generator] = {}


def register(gen: Generator) -> None:
    REGISTRY[gen.id] = gen


register(FastAPIGenerator())
register(ReactGenerator())
register(ProjectFilesGenerator())
register(SeedGenerator())


def generators_for(ctx: GenContext) -> list[Generator]:
    """Pick generators from the project's stack — v1 supports one combo."""
    stack = ctx.stack
    chosen: list[Generator] = []
    if stack.get("backend") == "fastapi":
        chosen.append(REGISTRY["gen.fastapi"])
    if stack.get("frontend") == "react":
        chosen.append(REGISTRY["gen.react"])
    chosen.append(REGISTRY["gen.project"])
    if ctx.seed_enabled:
        chosen.append(REGISTRY["gen.seed"])
    return chosen


def run_all(ctx: GenContext) -> list[GeneratedFile]:
    """Render every applicable generator. Never writes to disk."""
    files: list[GeneratedFile] = []
    seen: set[str] = set()
    for gen in generators_for(ctx):
        for f in gen.generate(ctx):
            if f.path in seen:
                continue
            seen.add(f.path)
            files.append(f)
    return sorted(files, key=lambda f: f.path)


__all__ = ["GenContext", "GeneratedFile", "run_all", "REGISTRY", "register"]
