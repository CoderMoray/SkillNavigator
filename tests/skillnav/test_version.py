"""Version single-source guard.

The version lives in exactly one place — ``skillnav/__init__.py
__version__`` — and ``pyproject.toml`` reads it through setuptools' dynamic
attr. These tests fail if a hardcoded version is reintroduced or the dynamic
attr is repointed, so the wheel can never disagree with the package again.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

import skillnav

REPO_ROOT = Path(__file__).resolve().parents[2]
PYPROJECT = REPO_ROOT / "cli-py" / "pyproject.toml"

_RELEASE_RE = re.compile(r"^\d+\.\d+\.\d+(?:[abc]\d+|rc\d+)?$")


def _load_pyproject() -> dict:
    try:
        import tomllib  # Python 3.11+
    except ModuleNotFoundError:  # pragma: no cover - runners without tomllib
        pytest.skip("tomllib requires Python 3.11+")
    return tomllib.loads(PYPROJECT.read_text(encoding="utf-8"))


def test_version_is_a_pep440_release() -> None:
    assert _RELEASE_RE.match(skillnav.__version__), skillnav.__version__


def test_pyproject_has_no_hardcoded_version() -> None:
    project = _load_pyproject()["project"]
    assert "version" not in project, "version must come from skillnav.__version__ (dynamic)"
    assert project.get("dynamic") == ["version"]


def test_dynamic_version_attr_targets_the_package() -> None:
    data = _load_pyproject()
    attr = data["tool"]["setuptools"]["dynamic"]["version"]["attr"]
    assert attr == "skillnav.__version__"
