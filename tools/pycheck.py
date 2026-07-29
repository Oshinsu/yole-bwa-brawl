#!/usr/bin/env python3
"""Compile tous les scripts Python du projet.

Remplace « python3 -m py_compile fetch_three.py tools/*.py test/*.py » : les globs
ne sont pas expansées par cmd.exe sous Windows, ce qui faisait échouer npm run syntax.
"""
from __future__ import annotations

import py_compile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
targets = [
    ROOT / "fetch_three.py",
    *sorted((ROOT / "tools").glob("*.py")),
    *sorted((ROOT / "test").glob("*.py")),
]
for path in targets:
    py_compile.compile(str(path), doraise=True)
print(f"python syntax: OK ({len(targets)} fichiers)")
