"""`skillnav republish` puts an unpublished skill (or version) back in public search.

It is the counterpart of `unpublish` and only flips visibility — it must not
become a way around review, so the server-side refusals matter as much as the
happy path.
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


def test_republish_requires_login(runner: CliRunner, isolated_config: Path) -> None:
    result = runner.invoke(app, ["republish", "my-skill"])
    assert result.exit_code != 0
    assert "not logged in" in cli_output(result).casefold()


def test_republish_lists_the_skill_again(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    calls = _stub(monkeypatch, (200, {"skill": {"slug": "my-skill", "published": True}}))

    result = runner.invoke(app, ["republish", "my-skill"])

    assert result.exit_code == 0, cli_output(result)
    assert len(calls) == 1
    assert calls[0]["method"] == "POST"
    assert calls[0]["url"].endswith("/skills/my-skill/republish")
    assert "public search again" in cli_output(result)


def test_republish_version_hits_the_version_endpoint(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    calls = _stub(monkeypatch, (200, {"skill": {"published": True}}))

    result = runner.invoke(app, ["republish", "my-skill", "--version", "1.0.0"])

    assert result.exit_code == 0, cli_output(result)
    assert calls[0]["url"].endswith("/skills/my-skill/versions/1.0.0/republish")
    assert "my-skill@1.0.0" in cli_output(result)


def test_republish_json_reports_action_and_visibility(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    _stub(monkeypatch, (200, {"skill": {"slug": "my-skill", "published": True}}))

    result = runner.invoke(app, ["--json", "republish", "my-skill"])

    assert result.exit_code == 0, cli_output(result)
    payload = json.loads(cli_output(result))
    assert payload["slug"] == "my-skill"
    assert payload["version"] is None
    assert payload["action"] == "republished"
    assert payload["visibility"] == "public"


def test_republish_forbidden_points_at_ownership(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    _stub(monkeypatch, (403, {"error": "Forbidden"}))

    result = runner.invoke(app, ["republish", "not-my-skill"])

    assert result.exit_code != 0
    assert "owner or contributor" in cli_output(result).casefold()


def test_republish_missing_skill_surfaces_the_error(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    _stub(monkeypatch, (404, {"error": "skill_not_found"}))

    result = runner.invoke(app, ["republish", "ghost-skill"])

    assert result.exit_code != 0
    assert "not found" in cli_output(result).casefold()


def test_republish_blocked_while_inspection_runs(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    _stub(monkeypatch, (409, {"error": "skill_republish_blocked_inspection_in_progress"}))

    result = runner.invoke(app, ["republish", "my-skill"])

    assert result.exit_code != 0
    output = cli_output(result)
    assert "inspection is running" in output
    assert "skillnav republish <slug>" in output


def test_republish_blocked_for_a_rejected_skill(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    _stub(monkeypatch, (409, {"error": "skill_republish_blocked_inspection_rejected"}))

    result = runner.invoke(app, ["republish", "my-skill"])

    assert result.exit_code != 0
    output = cli_output(result)
    assert "rejected" in output.casefold()
    # The way out is a new version, not a second republish attempt.
    assert "skillnav publish <package>" in output
