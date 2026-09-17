"""`skillnav bookmark` saves skills for later.

The Web UI has had bookmarks for a while but the CLI had no way to reach them,
so a user who bookmarked skills in the browser could not list or manage them from
the terminal. The three subcommands map onto GET /users/me/bookmarks and
PUT/DELETE /skills/:slug/bookmark.
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


def test_bookmark_add_requires_login(runner: CliRunner, isolated_config: Path) -> None:
    result = runner.invoke(app, ["--no-input", "bookmark", "add", "my-skill"])
    assert result.exit_code != 0
    assert "not logged in" in cli_output(result).casefold()


def test_bookmark_add_puts_to_the_bookmark_endpoint(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    calls = _stub(monkeypatch, (200, {"ok": True, "bookmarked": True}))

    result = runner.invoke(app, ["bookmark", "add", "my-skill"])

    assert result.exit_code == 0, cli_output(result)
    assert calls[0]["method"] == "PUT"
    assert calls[0]["url"].endswith("/skills/my-skill/bookmark")
    assert "my-skill" in cli_output(result)


def test_bookmark_remove_deletes_the_bookmark(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    calls = _stub(monkeypatch, (200, {"ok": True, "bookmarked": False}))

    result = runner.invoke(app, ["bookmark", "remove", "my-skill"])

    assert result.exit_code == 0, cli_output(result)
    assert calls[0]["method"] == "DELETE"
    assert calls[0]["url"].endswith("/skills/my-skill/bookmark")


def test_bookmark_list_reports_an_empty_set(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    calls = _stub(monkeypatch, (200, {"items": []}))

    result = runner.invoke(app, ["bookmark", "list"])

    assert result.exit_code == 0, cli_output(result)
    assert "No bookmarks yet." in cli_output(result)
    assert calls[0]["method"] == "GET"
    assert calls[0]["url"].endswith("/users/me/bookmarks")


def test_bookmark_list_shows_saved_skills(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    _stub(
        monkeypatch,
        (
            200,
            {
                "items": [
                    {"slug": "my-skill", "name": "My Skill"},
                    {"slug": "other-skill", "name": "Other"},
                ]
            },
        ),
    )

    result = runner.invoke(app, ["bookmark", "list"])

    assert result.exit_code == 0, cli_output(result)
    output = cli_output(result)
    assert "my-skill" in output
    assert "My Skill" in output
    assert "other-skill" in output


def test_bookmark_list_json_passes_items_through(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    _stub(monkeypatch, (200, {"items": [{"slug": "my-skill", "name": "My Skill"}]}))

    result = runner.invoke(app, ["--json", "bookmark", "list"])

    assert result.exit_code == 0, cli_output(result)
    payload = json.loads(cli_output(result))
    assert payload["items"][0]["slug"] == "my-skill"


def test_bookmark_add_missing_skill_surfaces_the_error(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    _stub(monkeypatch, (404, {"error": "skill_not_found"}))

    result = runner.invoke(app, ["bookmark", "add", "ghost-skill"])

    assert result.exit_code != 0
    assert "not found" in cli_output(result).casefold()


def test_legacy_issue_names_still_work(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    """`issue` / `issues` are hidden aliases now; the old spellings must keep working."""
    _login(isolated_config)
    calls = _stub(monkeypatch, (200, {"id": "issue_1"}))
    result = runner.invoke(
        app, ["issue", "my-skill", "--title", "Bug", "--type", "bug"]
    )
    assert result.exit_code == 0, cli_output(result)
    assert calls[0]["method"] == "POST"
    assert calls[0]["url"].endswith("/skills/my-skill/issues")

    calls = _stub(monkeypatch, (200, {"items": []}))
    result = runner.invoke(app, ["issues", "my-skill"])
    assert result.exit_code == 0, cli_output(result)
    assert calls[0]["method"] == "GET"
    assert calls[0]["url"].endswith("/skills/my-skill/issues")


def test_new_issue_names_are_the_ones_that_read_clearly(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    calls = _stub(monkeypatch, (200, {"id": "issue_1"}))

    result = runner.invoke(
        app, ["create-issue", "my-skill", "--title", "Bug", "--type", "bug"]
    )

    assert result.exit_code == 0, cli_output(result)
    assert calls[0]["method"] == "POST"

    calls = _stub(monkeypatch, (200, {"items": []}))
    result = runner.invoke(app, ["list-issues", "my-skill"])
    assert result.exit_code == 0, cli_output(result)
    assert calls[0]["method"] == "GET"
