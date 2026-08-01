"""First-run behaviour: deliberately nothing.

Skaffo used to ship a sample project ("My Shop" with three tables) so that a
fresh install had something to look at. That has been removed.

Why
---
A pre-made project is other people's work sitting in your workspace. It shows
up in Recent, in the statistics, in Activity, and it is the first thing you
see — so the app opens on someone else's data rather than yours. Deleting it
is an extra chore before you can start, and until you do, every number on the
dashboard is fiction.

The empty states now carry that job instead: Dashboard and Projects both
explain what to do next and put "Create Project" in front of you.

This module is kept (rather than deleted) so that `main.py` keeps a single,
obvious place to look for first-run logic, and so upgrades from a version that
*did* seed have a documented explanation. Existing sample projects in a user's
database are left alone — deleting data on upgrade would be worse than leaving
one stale row the user can remove themselves.
"""
from __future__ import annotations


def seed_if_empty() -> None:
    """No-op. Skaffo ships with an empty workspace by design."""
    return None
