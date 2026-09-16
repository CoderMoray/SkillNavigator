"""Every third-party import must be declared in cli-py/pyproject.toml.

A fresh install once died with "No module named 'click'": cli.py imports click
directly, but only typer was declared — and Typer 0.24+ vendors its own click
fork instead of depending on the top-level package. The imports of a package
must therefore be self-sufficient: this test keeps the declaration and the
actual imports in sync so the next such gap fails in CI instead of at a user's
terminal.
"""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
PACKAGE_ROOT = REPO_ROOT / "cli-py" / "src" / "skillnav"
PYPROJECT = REPO_ROOT / "cli-py" / "pyproject.toml"

# sys.stdlib_module_names exists from Python 3.10; below that the stdlib can
# not be told apart reliably, so the check is skipped rather than guessed.
_NEEDS_STDLIB_NAMES = pytest.mark.skipif(
    not hasattr(sys, "stdlib_module_names"),
    reason="stdlib_module_names requires Python 3.10+",
)


def _third_party_imports() -> dict[str, set[str]]:
    """Top-level third-party modules imported anywhere in the package.

    Walks the AST, so imports inside functions (lazy/feature imports) count too.
    """
    found: dict[str, set[str]] = {}
    for path in sorted(PACKAGE_ROOT.rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            names: list[str] = []
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                names = [node.module]
            for name in names:
                top = name.split(".")[0]
                if top == "skillnav" or top in sys.stdlib_module_names:
                    continue
                found.setdefault(top, set()).add(path.name)
    return found


def _declared_dependencies() -> set[str]:
    """Runtime dependencies from [project] dependencies (dev extras excluded)."""
    match = re.search(
        r"^dependencies\s*=\s*\[(.*?)\]", PYPROJECT.read_text(encoding="utf-8"), re.S | re.M
    )
    assert match, "cli-py/pyproject.toml has no [project] dependencies array"

    declared: set[str] = set()
    for line in match.group(1).splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        for requirement in re.findall(r'"([^"]+)"', line):
            distribution = re.split(r"[\[<>=!~; ]", requirement)[0]
            declared.add(distribution.strip().lower().replace("-", "_"))
    return declared


@_NEEDS_STDLIB_NAMES
def test_third_party_imports_are_declared() -> None:
    imported = _third_party_imports()
    undeclared = sorted(set(imported) - _declared_dependencies())

    assert not undeclared, (
        "undeclared third-party imports in cli-py/src/skillnav "
        f"(a fresh install would fail on them): {undeclared}. "
        f"Imported by: { {name: sorted(imported[name]) for name in undeclared} }. "
        "Add them to [project] dependencies in cli-py/pyproject.toml."
    )
