"""Entry point for the frozen engine executable.

`app/main.py` uses relative imports (`from .core...`), which only work when it
is run as part of the `app` package — `python -m app.main`. PyInstaller freezes
a *script*, so pointing it at `app/main.py` strips the package context and the
binary dies immediately with:

    ImportError: attempted relative import with no known parent package

This module is the thing PyInstaller freezes instead. It imports `app.main` as
a package member, which keeps every relative import intact, and then calls the
same `run()` the dev path uses — so the frozen and source paths cannot drift.
"""
from __future__ import annotations

import sys


def _run() -> int:
    from app.main import run
    return run() or 0


if __name__ == "__main__":
    sys.exit(_run())
