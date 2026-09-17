"""`skillnav trash` inspects and manages the recycle bin.

The bin is the other half of `unpublish --delete`: entries stay restorable until
their purge time, then the server deletes them permanently. Without a way to list
them, `restore` had to be called blind and users had to open the Web UI to find
out what was in there.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from typer.testing import CliRunner

from conftest import cli_output
from skillnav.cli import _days_remaining, app


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


def _purge_at(days: float) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat().replace("+00:00", "Z")


def test_days_remaining_rounds_up_and_handles_unknown_values() -> None:
    assert _days_remaining(_purge_at(3)) == 3
    # Six hours left is still "1 day" as far as urgency goes.
    assert _days_remaining(_purge_at(0.25)) == 1
    # Already past the deadline: never negative.
    assert _days_remaining(_purge_at(-2)) == 0
    # Naive timestamps and junk are tolerated rather than crashing the listing.
    assert _days_remaining(datetime.now(timezone.utc).isoformat()) == 0
    assert _days_remaining("not-a-date") is None
    assert _days_remaining(None) is None
    assert _days_remaining("") is None


def test_trash_list_requires_login(runner: CliRunner, isolated_config: Path) -> None:
    result = runner.invoke(app, ["--no-input", "trash", "list"])
    assert result.exit_code != 0
    assert "not logged in" in cli_output(result).casefold()


def test_trash_list_reports_an_empty_bin(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    calls = _stub(monkeypatch, (200, {"items": []}))

    result = runner.invoke(app, ["trash", "list"])

    assert result.exit_code == 0, cli_output(result)
    assert "Recycle bin is empty." in cli_output(result)
    assert calls[0]["method"] == "GET"
    assert calls[0]["url"].endswith("/users/me/recycle-bin")


def test_trash_list_shows_slug_name_and_urgency(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    _stub(
        monkeypatch,
        (
            200,
            {
                "items": [
                    {
                        "slug": "my-skill",
                        "name": "My Skill",
                        "description": "demo",
                        "latestVersion": "1.0.0",
                        "deletedAt": "2026-09-16T00:00:00.000Z",
                        "purgeAt": _purge_at(2),
                    }
                ]
            },
        ),
    )

    result = runner.invoke(app, ["trash", "list"])

    assert result.exit_code == 0, cli_output(result)
    output = cli_output(result)
    assert "my-skill" in output
    assert "My Skill" in output
    assert "2 day(s) left" in output
    # The listing must point at the follow-up action.
    assert "skillnav restore <slug>" in output


def test_trash_list_json_includes_days_remaining(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    _stub(
        monkeypatch,
        (
            200,
            {
                "items": [
                    {"slug": "my-skill", "name": "My Skill", "purgeAt": _purge_at(5)},
                    {"slug": "broken", "name": "Broken"},
                ]
            },
        ),
    )

    result = runner.invoke(app, ["--json", "trash", "list"])

    assert result.exit_code == 0, cli_output(result)
    payload = json.loads(cli_output(result))
    assert payload["items"][0]["slug"] == "my-skill"
    assert payload["items"][0]["daysRemaining"] == 5
    # An entry without a usable purge time stays null rather than guessing.
    assert payload["items"][1]["daysRemaining"] is None


def test_trash_restore_is_the_same_action_as_top_level_restore(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    calls = _stub(monkeypatch, (200, {"skill": {"slug": "my-skill", "published": True}}))

    result = runner.invoke(app, ["trash", "restore", "my-skill"])

    assert result.exit_code == 0, cli_output(result)
    assert calls[0]["method"] == "POST"
    assert calls[0]["url"].endswith("/skills/my-skill/restore")


def test_trash_purge_prompts_then_deletes(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    calls = _stub(monkeypatch, (200, {"ok": True, "purged": True, "slug": "my-skill"}))

    result = runner.invoke(app, ["trash", "purge", "my-skill"], input="y\n")

    assert result.exit_code == 0, cli_output(result)
    assert "cannot be restored" in cli_output(result)
    assert calls[0]["method"] == "DELETE"
    assert calls[0]["url"].endswith("/skills/my-skill/purge")


def test_trash_purge_declined_prompt_makes_no_request(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    calls = _stub(monkeypatch, (200, {"ok": True}))

    result = runner.invoke(app, ["trash", "purge", "my-skill"], input="n\n")

    assert result.exit_code == 1
    assert calls == []


def test_trash_purge_no_input_skips_the_prompt(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    calls = _stub(monkeypatch, (200, {"ok": True, "purged": True}))

    result = runner.invoke(app, ["--no-input", "trash", "purge", "my-skill"])

    assert result.exit_code == 0, cli_output(result)
    assert len(calls) == 1


def test_trash_purge_json_reports_the_action(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    _stub(monkeypatch, (200, {"ok": True, "purged": True}))

    result = runner.invoke(app, ["--json", "--no-input", "trash", "purge", "my-skill"])

    assert result.exit_code == 0, cli_output(result)
    assert json.loads(cli_output(result)) == {"slug": "my-skill", "action": "purged"}


def test_trash_purge_not_in_bin_surfaces_the_error(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    _stub(monkeypatch, (404, {"error": "skill_not_in_recycle_bin"}))

    result = runner.invoke(app, ["--no-input", "trash", "purge", "ghost-skill"])

    assert result.exit_code != 0
    output = cli_output(result)
    assert "recycle bin" in output.casefold()
    assert "skillnav republish" in output


def test_trash_purge_forbidden_points_at_ownership(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    _stub(monkeypatch, (403, {"error": "Forbidden"}))

    result = runner.invoke(app, ["--no-input", "trash", "purge", "not-my-skill"])

    assert result.exit_code != 0
    assert "owner or contributor" in cli_output(result).casefold()
