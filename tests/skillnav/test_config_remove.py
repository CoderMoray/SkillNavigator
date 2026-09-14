"""Tests for skillnav config remove."""

from __future__ import annotations

import json
from pathlib import Path

from typer.testing import CliRunner

from conftest import cli_output
from skillnav.cli import app
from skillnav.config import load_config


def _add_profile(runner: CliRunner, name: str, registry: str = "http://127.0.0.1:3000") -> None:
    result = runner.invoke(app, ["config", "add", name, "--registry", registry])
    assert result.exit_code == 0, cli_output(result)


def test_config_remove_non_default_profile(runner: CliRunner, isolated_config: Path) -> None:
    _add_profile(runner, "default")
    _add_profile(runner, "staging", "http://127.0.0.1:4000")
    runner.invoke(app, ["config", "use", "staging"])

    result = runner.invoke(app, ["config", "remove", "default"])
    assert result.exit_code == 0, cli_output(result)
    assert "Removed profile 'default'" in cli_output(result)

    config = load_config()
    assert "default" not in config["profiles"]
    assert config["defaultProfile"] == "staging"


def test_config_remove_default_switches_default(runner: CliRunner, isolated_config: Path) -> None:
    _add_profile(runner, "alpha", "http://127.0.0.1:3001")
    _add_profile(runner, "beta", "http://127.0.0.1:3002")
    runner.invoke(app, ["config", "use", "beta"])

    result = runner.invoke(app, ["config", "remove", "beta"])
    assert result.exit_code == 0, cli_output(result)
    output = cli_output(result)
    assert "Removed profile 'beta'" in output
    assert "Default profile: alpha" in output

    config = load_config()
    assert "beta" not in config["profiles"]
    assert config["defaultProfile"] == "alpha"


def test_config_remove_unknown_profile(runner: CliRunner, isolated_config: Path) -> None:
    result = runner.invoke(app, ["config", "remove", "missing"])
    assert result.exit_code == 3, cli_output(result)
    assert "Unknown profile: missing" in cli_output(result)


def test_config_remove_only_profile(runner: CliRunner, isolated_config: Path) -> None:
    result = runner.invoke(app, ["config", "remove", "default"])
    assert result.exit_code == 3, cli_output(result)
    assert "Cannot remove the only profile" in cli_output(result)


def test_config_remove_json(runner: CliRunner, isolated_config: Path) -> None:
    _add_profile(runner, "keep")
    _add_profile(runner, "drop", "http://127.0.0.1:4000")
    runner.invoke(app, ["config", "remove", "default"])
    runner.invoke(app, ["config", "use", "drop"])

    result = runner.invoke(app, ["--json", "config", "remove", "drop"])
    assert result.exit_code == 0, cli_output(result)
    assert json.loads(result.stdout) == {"removed": "drop", "defaultProfile": "keep"}
