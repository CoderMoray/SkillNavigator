"""Tests for skillnav login error handling."""

from __future__ import annotations

from typing import Any

import pytest
from typer.testing import CliRunner

from conftest import cli_output

from skillnav.cli import app


def test_login_401_reports_invalid_api_key(
    runner: CliRunner, isolated_config, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fake_request_json(
        method: str,
        url: str,
        *,
        body: dict[str, Any] | None = None,
        token: str | None = None,
        timeout: float = 120,
    ) -> tuple[int, Any]:
        assert method == "GET"
        assert url.endswith("/auth/me")
        assert token == "sk_test"
        return 401, {"error": "Unauthorized"}

    monkeypatch.setattr("skillnav.cli.request_json", fake_request_json)
    result = runner.invoke(app, ["login", "--api-key", "sk_test"])
    assert result.exit_code == 2, cli_output(result)
    assert "Invalid or expired API key" in cli_output(result)


def test_login_503_not_reported_as_invalid_api_key(
    runner: CliRunner, isolated_config, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fake_request_json(
        method: str,
        url: str,
        *,
        body: dict[str, Any] | None = None,
        token: str | None = None,
        timeout: float = 120,
    ) -> tuple[int, Any]:
        return 503, {"error": "service_unavailable"}

    monkeypatch.setattr("skillnav.cli.request_json", fake_request_json)
    result = runner.invoke(app, ["login", "--api-key", "sk_test"])
    assert result.exit_code == 1, cli_output(result)
    output = cli_output(result)
    assert "Invalid or expired API key" not in output
    assert "503" in output or "Server error" in output


def test_login_strips_api_key_whitespace(
    runner: CliRunner, isolated_config, monkeypatch: pytest.MonkeyPatch
) -> None:
    captured: list[str | None] = []

    def fake_request_json(
        method: str,
        url: str,
        *,
        body: dict[str, Any] | None = None,
        token: str | None = None,
        timeout: float = 120,
    ) -> tuple[int, Any]:
        captured.append(token)
        return 200, {"user": {"username": "alice", "id": "u1"}}

    monkeypatch.setattr("skillnav.cli.request_json", fake_request_json)
    result = runner.invoke(app, ["login", "--api-key", "sk_test  "])
    assert result.exit_code == 0, cli_output(result)
    assert captured == ["sk_test"]
    assert "Logged in as alice" in cli_output(result)
