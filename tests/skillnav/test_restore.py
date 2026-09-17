"""`skillnav restore` brings a skill back out of the recycle bin.

Restoring is the counterpart of `unpublish --delete`: a slug in the bin is still
on the server but off the registry, and it is purged automatically once the
retention window ends. Only the skill owner may restore it.
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


def test_restore_requires_login(runner: CliRunner, isolated_config: Path) -> None:
    result = runner.invoke(app, ["--no-input", "restore", "my-skill"])
    assert result.exit_code != 0
    assert "not logged in" in cli_output(result).casefold()


def test_restore_posts_to_the_restore_endpoint(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    calls = _stub(monkeypatch, (200, {"skill": {"slug": "my-skill", "published": True}}))

    result = runner.invoke(app, ["restore", "my-skill"])

    assert result.exit_code == 0, cli_output(result)
    assert calls[0]["method"] == "POST"
    assert calls[0]["url"].endswith("/skills/my-skill/restore")
    assert "public search" in cli_output(result)


def test_restore_points_at_republish_when_still_private(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    """A restored skill keeps whatever visibility it had — say so, and say how to list it."""
    _login(isolated_config)
    _stub(monkeypatch, (200, {"skill": {"slug": "my-skill", "published": False}}))

    result = runner.invoke(app, ["restore", "my-skill"])

    assert result.exit_code == 0, cli_output(result)
    output = cli_output(result)
    assert "recycle bin" in output
    assert "skillnav republish my-skill" in output


def test_restore_json_reports_action(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    _stub(monkeypatch, (200, {"skill": {"slug": "my-skill", "published": True}}))

    result = runner.invoke(app, ["--json", "restore", "my-skill"])

    assert result.exit_code == 0, cli_output(result)
    payload = json.loads(cli_output(result))
    assert payload == {"slug": "my-skill", "action": "restored", "published": True}


def test_restore_not_in_bin_explains_the_way_out(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    _stub(monkeypatch, (404, {"error": "skill_not_in_recycle_bin"}))

    result = runner.invoke(app, ["restore", "my-skill"])

    assert result.exit_code != 0
    output = cli_output(result)
    assert "recycle bin" in output.casefold()
    assert "skillnav republish" in output


def test_restore_forbidden_points_at_ownership(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    _stub(monkeypatch, (403, {"error": "Forbidden"}))

    result = runner.invoke(app, ["restore", "not-my-skill"])

    assert result.exit_code != 0
    assert "owner or contributor" in cli_output(result).casefold()
