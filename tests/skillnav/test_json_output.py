"""Verify --json output for local-only CLI commands."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from typer.testing import CliRunner

from conftest import cli_output
from skillnav.cli import app


def test_config_add_json(runner: CliRunner, isolated_config: Path) -> None:
    result = runner.invoke(
        app,
        ["--json", "config", "add", "staging", "--registry", "http://127.0.0.1:3000/"],
    )
    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    assert payload == {"profile": "staging", "registry": "http://127.0.0.1:3000"}


def test_config_use_json(runner: CliRunner, isolated_config: Path) -> None:
    runner.invoke(
        app,
        ["config", "add", "staging", "--registry", "http://127.0.0.1:3000"],
    )
    result = runner.invoke(app, ["--json", "config", "use", "staging"])
    assert result.exit_code == 0, result.output
    assert json.loads(result.stdout) == {"defaultProfile": "staging"}


def test_config_use_unknown_profile_json_error(runner: CliRunner, isolated_config: Path) -> None:
    result = runner.invoke(app, ["--json", "config", "use", "missing"])
    assert result.exit_code == 1
    payload = json.loads(cli_output(result))
    assert payload["error"] == "Unknown profile: missing"
