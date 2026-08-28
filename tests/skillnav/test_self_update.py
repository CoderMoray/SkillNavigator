"""Unit tests for skillnav self-update."""

from __future__ import annotations

import json
from unittest.mock import patch

import pytest
from typer.testing import CliRunner

from conftest import cli_output
from skillnav.cli import app
from skillnav.errors import SkillnavError
from skillnav.self_update import (
    UpdateStatus,
    check_for_update,
    compare_versions,
    format_update_message,
    perform_update,
)


def test_compare_versions() -> None:
    assert compare_versions("0.3.0", "0.3.0") == 0
    assert compare_versions("0.3.0", "0.4.0") == -1
    assert compare_versions("0.4.0", "0.3.0") == 1


@patch("skillnav.self_update.fetch_pypi_latest_version", return_value="0.3.0")
def test_check_for_update_up_to_date(_mock_fetch: object) -> None:
    status = check_for_update(current="0.3.0")
    assert status.up_to_date is True
    assert status.latest == "0.3.0"


@patch("skillnav.self_update.fetch_pypi_latest_version", return_value="0.4.0")
def test_check_for_update_available(_mock_fetch: object) -> None:
    status = check_for_update(current="0.3.0")
    assert status.up_to_date is False
    assert status.latest == "0.4.0"


@patch("skillnav.self_update.is_editable_install", return_value=False)
@patch("skillnav.self_update.run_upgrade_command")
@patch("skillnav.self_update.fetch_pypi_latest_version", return_value="0.4.0")
def test_perform_update_installs_when_newer(
    _mock_fetch: object,
    mock_upgrade: object,
    _mock_editable: object,
) -> None:
    status = perform_update(current="0.3.0")
    assert status.updated is True
    mock_upgrade.assert_called_once()


@patch("skillnav.self_update.fetch_pypi_latest_version", return_value="0.3.0")
def test_perform_update_skips_when_current(_mock_fetch: object) -> None:
    with patch("skillnav.self_update.run_upgrade_command") as mock_upgrade:
        status = perform_update(current="0.3.0")
    assert status.up_to_date is True
    assert status.updated is False
    mock_upgrade.assert_not_called()


def test_format_update_message_up_to_date() -> None:
    message = format_update_message(
        UpdateStatus(current="0.3.0", latest="0.3.0", up_to_date=True),
        check_only=False,
    )
    assert "up to date" in message


@patch("skillnav.self_update.perform_update")
def test_update_command_json(mock_perform: object, runner: CliRunner) -> None:
    mock_perform.return_value = UpdateStatus(
        current="0.3.0",
        latest="0.3.0",
        up_to_date=True,
    )
    result = runner.invoke(app, ["--json", "update"])
    assert result.exit_code == 0, cli_output(result)
    payload = json.loads(result.stdout)
    assert payload == {
        "current": "0.3.0",
        "latest": "0.3.0",
        "upToDate": True,
        "updated": False,
    }


@patch(
    "skillnav.self_update.perform_update",
    side_effect=SkillnavError("Upgrade failed"),
)
def test_update_command_error_json(_mock_perform: object, runner: CliRunner) -> None:
    result = runner.invoke(app, ["--json", "update"])
    assert result.exit_code == 1
    payload = json.loads(cli_output(result))
    assert payload["error"] == "Upgrade failed"
