"""Pytest fixtures for skillnav CLI tests (package under cli-py/src)."""

from __future__ import annotations

from pathlib import Path

import pytest
from typer.testing import CliRunner

REPO_ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture()
def runner() -> CliRunner:
    return CliRunner(mix_stderr=True)


@pytest.fixture()
def isolated_config(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "config.json"
    monkeypatch.setenv("SKILLNAV_CONFIG", str(path))
    return path


def cli_output(result) -> str:
    return getattr(result, "output", None) or (result.stdout or "") + (result.stderr or "")
