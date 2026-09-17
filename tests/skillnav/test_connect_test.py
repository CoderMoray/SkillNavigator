"""`skillnav config connect-test` checks Registry connectivity for one profile.

The check only ever proved "this profile's Registry answers /health" — it never
validated the config file — so it is now named after what it actually does, and
it reports the profile and Registry it really used. `config test` stays as a
hidden alias for scripts and older prompts.
"""

from __future__ import annotations

import json
from pathlib import Path

from typer.testing import CliRunner

from conftest import cli_output
from skillnav.cli import app


def _configure(
    path: Path,
    *,
    profile: str = "default",
    registry: str = "http://127.0.0.1:3000",
    extra: dict | None = None,
) -> None:
    profiles = {profile: {"registry": registry}}
    if extra:
        profiles.update(extra)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"defaultProfile": profile, "profiles": profiles}),
        encoding="utf-8",
    )


def _stub(monkeypatch, response):
    """Record outgoing requests and answer with one canned (status, body)."""
    calls: list[dict] = []

    def fake_request_json(method, url, *args, **kwargs):  # noqa: ANN001
        calls.append({"method": method, "url": url, **kwargs})
        return response

    from skillnav import cli

    monkeypatch.setattr(cli, "request_json", fake_request_json)
    return calls


def test_connect_test_reports_the_profile_and_registry_it_used(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _configure(isolated_config, registry="https://platform.example/api")
    calls = _stub(monkeypatch, (200, {"status": "ok"}))

    result = runner.invoke(app, ["config", "connect-test"])

    assert result.exit_code == 0, cli_output(result)
    output = cli_output(result)
    assert "OK" in output
    assert "default" in output
    assert "https://platform.example/api" in output
    assert calls[0]["method"] == "GET"
    assert calls[0]["url"].endswith("/health")


def test_connect_test_can_target_a_named_profile(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _configure(
        isolated_config,
        profile="default",
        registry="https://platform.example/api",
        extra={"prod": {"registry": "https://prod.example/api"}},
    )
    calls = _stub(monkeypatch, (200, {"status": "ok"}))

    result = runner.invoke(app, ["config", "connect-test", "prod"])

    assert result.exit_code == 0, cli_output(result)
    output = cli_output(result)
    assert "prod" in output
    assert "https://prod.example/api" in output
    assert calls[0]["url"].startswith("https://prod.example/api")


def test_legacy_config_test_alias_still_works(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _configure(isolated_config, registry="https://platform.example/api")
    calls = _stub(monkeypatch, (200, {"status": "ok"}))

    result = runner.invoke(app, ["config", "test"])

    assert result.exit_code == 0, cli_output(result)
    assert len(calls) == 1
    assert calls[0]["url"].endswith("/health")


def test_connect_test_json_output_is_unchanged(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    """--json keeps emitting the raw /health body for existing consumers."""
    _configure(isolated_config)
    _stub(monkeypatch, (200, {"status": "ok", "version": "1.2.3"}))

    result = runner.invoke(app, ["--json", "config", "connect-test"])

    assert result.exit_code == 0, cli_output(result)
    assert json.loads(cli_output(result)) == {"status": "ok", "version": "1.2.3"}
