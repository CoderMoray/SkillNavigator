"""Pytest fixtures for skillnav CLI tests (package under cli-py/src)."""

from __future__ import annotations

from pathlib import Path

import pytest
from typer.testing import CliRunner

REPO_ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture()
def runner() -> CliRunner:
    # click>=8.3 已移除 mix_stderr（stdout/stderr 默认混合），cli_output 兼容两种形态。
    return CliRunner()


@pytest.fixture()
def isolated_config(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "config.json"
    monkeypatch.setenv("SKILLNAV_CONFIG", str(path))
    return path


@pytest.fixture(autouse=True)
def _no_release_check(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep CLI tests offline: the root callback normally runs the daily
    release check (tests for that live in test_version_check.py)."""
    monkeypatch.setattr("skillnav.cli.maybe_notify_update", lambda *a, **k: None)


def cli_output(result) -> str:
    return getattr(result, "output", None) or (result.stdout or "") + (result.stderr or "")
