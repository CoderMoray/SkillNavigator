"""Tests for skillnav config add."""

from __future__ import annotations

import json
from pathlib import Path

from typer.testing import CliRunner

from conftest import cli_output
from skillnav.cli import app


def test_config_add_first_time_default_profile(runner: CliRunner, isolated_config: Path) -> None:
    result = runner.invoke(
        app,
        ["config", "add", "default", "--registry", "http://127.0.0.1:3000"],
    )
    assert result.exit_code == 0, cli_output(result)
    assert isolated_config.is_file()


def test_config_add_rejects_duplicate_profile(runner: CliRunner, isolated_config: Path) -> None:
    runner.invoke(app, ["config", "add", "staging", "--registry", "http://127.0.0.1:3000"])
    result = runner.invoke(
        app,
        ["config", "add", "staging", "--registry", "http://127.0.0.1:4000"],
    )
    assert result.exit_code == 3, cli_output(result)
    output = cli_output(result)
    assert "Profile already exists: staging" in output
    assert "config remove staging" in output


def test_config_add_rejects_duplicate_default_after_save(runner: CliRunner, isolated_config: Path) -> None:
    runner.invoke(app, ["config", "add", "default", "--registry", "http://127.0.0.1:3000"])
    result = runner.invoke(
        app,
        ["config", "add", "default", "--registry", "http://127.0.0.1:4000"],
    )
    assert result.exit_code == 3, cli_output(result)
    assert "Profile already exists: default" in cli_output(result)


def test_config_add_duplicate_json_error(runner: CliRunner, isolated_config: Path) -> None:
    runner.invoke(app, ["config", "add", "staging", "--registry", "http://127.0.0.1:3000"])
    result = runner.invoke(
        app,
        ["--json", "config", "add", "staging", "--registry", "http://127.0.0.1:4000"],
    )
    assert result.exit_code == 3, cli_output(result)
    payload = json.loads(cli_output(result))
    assert payload["error"] == "Profile already exists: staging"
    assert "nextSteps" in payload
