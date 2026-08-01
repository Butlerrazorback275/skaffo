"""Protected-region merge — the heart of Re-generate / Sync.

A generated file may contain regions the developer owns:

    # skaffo:keep:start imports
    import my_custom_thing
    # skaffo:keep:end

On regeneration those regions are lifted out of the file on disk and
re-injected into the freshly rendered template, so hand-written code
is never lost.

Any file with NO markers that differs from the template is reported as
`conflict` — the UI asks before overwriting.

Backwards compatibility
-----------------------
The product used to be called CodeForge, so projects generated before the
rename contain `codeforge:keep` markers sitting inside real user code we
must never break. Both spellings are recognised on read; new output always
uses `skaffo:keep`. A file mixing the two still merges correctly.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum

# `skaffo` is current; `codeforge` is the pre-rename spelling kept alive so
# existing projects keep merging instead of turning into conflicts.
_MARKER = r"(?:skaffo|codeforge)"

KEEP_START = re.compile(
    rf"^[ \t]*(?://|#|/\*|<!--)?[ \t]*{_MARKER}:keep:start[ \t]+([\w.-]+)",
    re.MULTILINE,
)
KEEP_END = re.compile(
    rf"^[ \t]*(?://|#|/\*|<!--)?[ \t]*{_MARKER}:keep:end",
    re.MULTILINE,
)


class Action(str, Enum):
    CREATE = "create"       # new file
    UPDATE = "update"       # regenerated, no user edits at risk
    MERGE = "merge"         # regenerated + user regions re-injected
    CONFLICT = "conflict"   # user edited outside a keep block
    SKIP = "skip"           # byte-identical


@dataclass
class FilePlan:
    path: str
    action: Action
    content: str
    kept_regions: int = 0
    old_size: int = 0
    new_size: int = 0


def extract_regions(text: str) -> dict[str, str]:
    """name -> body (excluding the marker lines)."""
    out: dict[str, str] = {}
    for m in KEEP_START.finditer(text):
        name = m.group(1)
        body_start = text.index("\n", m.end()) + 1 if "\n" in text[m.end():] else len(text)
        end = KEEP_END.search(text, body_start)
        if not end:
            continue
        out[name] = text[body_start:end.start()]
    return out


def inject_regions(template_text: str, regions: dict[str, str]) -> tuple[str, int]:
    """Put saved regions back into freshly rendered output."""
    if not regions:
        return template_text, 0

    injected = 0
    result: list[str] = []
    pos = 0

    for m in KEEP_START.finditer(template_text):
        name = m.group(1)
        if name not in regions:
            continue
        nl = template_text.find("\n", m.end())
        if nl == -1:
            continue
        body_start = nl + 1
        end = KEEP_END.search(template_text, body_start)
        if not end:
            continue

        result.append(template_text[pos:body_start])
        result.append(regions[name])
        pos = end.start()
        injected += 1

    result.append(template_text[pos:])
    return "".join(result), injected


def plan_file(path: str, new_content: str, existing: str | None) -> FilePlan:
    """Decide what to do with one file."""
    if existing is None:
        return FilePlan(path, Action.CREATE, new_content, new_size=len(new_content))

    if existing == new_content:
        return FilePlan(path, Action.SKIP, existing,
                        old_size=len(existing), new_size=len(new_content))

    regions = extract_regions(existing)
    if regions:
        merged, count = inject_regions(new_content, regions)
        if merged == existing:
            return FilePlan(path, Action.SKIP, existing,
                            kept_regions=count, old_size=len(existing), new_size=len(merged))
        return FilePlan(path, Action.MERGE, merged, kept_regions=count,
                        old_size=len(existing), new_size=len(merged))

    # No protected regions but the file changed — the user may have edited it.
    return FilePlan(path, Action.CONFLICT, new_content,
                    old_size=len(existing), new_size=len(new_content))
