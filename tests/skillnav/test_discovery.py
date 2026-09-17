"""`skillnav search-users` and `skillnav creators` cover the two read-only
discovery endpoints the CLI had no way to reach: finding a username (needed by
`add-contributor`) and browsing creators.
"""

from __future__ import annotations

import json
from pathlib import Path

from typer.testing import CliRunner

from conftest import cli_output
from skillnav.cli import app


def _login(isolated_config: Path) -> None:
    isolated_config.parent.mkdir(parents=True, exist_ok=True)
    isolated_config.write_text(
        json.dumps(
            {
                "defaultProfile": "default",
                "profiles": {
                    "default": {
                        "registry": "http://127.0.0.1:3000",
                        "apiKey": "sk_test",
                    }
                },
            }
        ),
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


def test_search_users_requires_login(runner: CliRunner, isolated_config: Path) -> None:
    result = runner.invoke(app, ["--no-input", "search-users", "donnia"])
    assert result.exit_code != 0
    assert "not logged in" in cli_output(result).casefold()


def test_search_users_lists_matches(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    calls = _stub(
        monkeypatch,
        (
            200,
            {
                "items": [
                    {"username": "Donnia_Dong", "displayName": "Donnia Dong"},
                    {"username": "donnia_test", "displayName": None},
                ]
            },
        ),
    )

    result = runner.invoke(app, ["search-users", "donnia"])

    assert result.exit_code == 0, cli_output(result)
    output = cli_output(result)
    assert "Donnia_Dong" in output
    assert "Donnia Dong" in output
    assert "donnia_test" in output
    assert calls[0]["method"] == "GET"
    assert "query=donnia" in calls[0]["url"]


def test_search_users_reports_no_matches(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    _stub(monkeypatch, (200, {"items": []}))

    result = runner.invoke(app, ["search-users", "nobody"])

    assert result.exit_code == 0, cli_output(result)
    assert "No users matching" in cli_output(result)


def test_search_users_json_passes_items_through(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    _stub(monkeypatch, (200, {"items": [{"username": "alice", "displayName": "Alice"}]}))

    result = runner.invoke(app, ["--json", "search-users", "alice"])

    assert result.exit_code == 0, cli_output(result)
    assert json.loads(cli_output(result))["items"][0]["username"] == "alice"


def test_creators_works_without_login(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    calls = _stub(
        monkeypatch,
        (200, {"items": [{"name": "Moray Liang", "handle": "Moray_Liang", "skillCount": 3}]}),
    )

    result = runner.invoke(app, ["creators"])

    assert result.exit_code == 0, cli_output(result)
    output = cli_output(result)
    assert "Moray Liang" in output
    assert "@Moray_Liang" in output
    assert "3 skill(s)" in output
    assert calls[0].get("token") is None


def test_creators_passes_the_filter_through(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    calls = _stub(monkeypatch, (200, {"items": []}))

    result = runner.invoke(app, ["creators", "moray"])

    assert result.exit_code == 0, cli_output(result)
    assert "query=moray" in calls[0]["url"]
    assert "No creators matching" in cli_output(result)


def test_creators_json_passes_items_through(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _stub(monkeypatch, (200, {"items": [{"name": "Alice", "handle": "alice"}]}))

    result = runner.invoke(app, ["--json", "creators"])

    assert result.exit_code == 0, cli_output(result)
    assert json.loads(cli_output(result))["items"][0]["handle"] == "alice"
