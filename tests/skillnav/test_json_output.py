"""Verify --json output for local-only CLI commands."""

from __future__ import annotations

import json
from pathlib import Path

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
    assert result.exit_code == 3
    payload = json.loads(cli_output(result))
    assert payload["error"] == "Unknown profile: missing"
    assert "nextSteps" in payload


def test_status_json_exposes_top_level_verdict(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    from skillnav import cli

    body = {
        "slug": "demo-skill",
        "latestVersion": "1.0.0",
        "published": True,
        "versions": {
            "1.0.0": {
                "version": "1.0.0",
                "status": "published",
                "inspection": {"verdict": "published"},
            }
        },
    }
    monkeypatch.setattr(cli, "request_json", lambda *args, **kwargs: (200, body))

    result = runner.invoke(app, ["--json", "status", "demo-skill"])
    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    # Verdict is the field agents read first; expose it at the top level while
    # keeping the nested per-version data intact.
    assert payload["verdict"] == "published"
    assert list(payload["versions"]) == ["1.0.0"]
    assert payload["versions"]["1.0.0"]["inspection"]["verdict"] == "published"
