"""`skillnav unpublish` removes a skill (or one version) from public search.

Unpublishing is not a delete: the package and its inspection data stay, and the
skill can be republished. Because the effect is user-visible, the command
confirms interactively by default and lets automation skip it with --no-input.
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


def test_unpublish_requires_login(runner: CliRunner, isolated_config: Path) -> None:
    result = runner.invoke(app, ["--no-input", "unpublish", "my-skill"])
    assert result.exit_code != 0
    assert "not logged in" in cli_output(result).casefold()


def test_unpublish_prompts_then_unpublishes(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    calls = _stub(monkeypatch, (200, {"skill": {"slug": "my-skill", "published": False}}))

    result = runner.invoke(app, ["unpublish", "my-skill"], input="y\n")

    assert result.exit_code == 0, cli_output(result)
    assert "remove from public search" in cli_output(result)
    assert len(calls) == 1
    assert calls[0]["method"] == "POST"
    assert calls[0]["url"].endswith("/skills/my-skill/unpublish")


def test_unpublish_declined_prompt_makes_no_request(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    calls = _stub(monkeypatch, (200, {"skill": {"published": False}}))

    result = runner.invoke(app, ["unpublish", "my-skill"], input="n\n")

    assert result.exit_code == 1
    assert calls == []


def test_unpublish_no_input_skips_the_prompt(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    calls = _stub(monkeypatch, (200, {"skill": {"slug": "my-skill", "published": False}}))

    result = runner.invoke(app, ["--no-input", "unpublish", "my-skill"])

    assert result.exit_code == 0, cli_output(result)
    assert len(calls) == 1


def test_unpublish_json_reports_action_and_visibility(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    _stub(monkeypatch, (200, {"skill": {"slug": "my-skill", "published": False}}))

    result = runner.invoke(app, ["--json", "--no-input", "unpublish", "my-skill"])

    assert result.exit_code == 0, cli_output(result)
    payload = json.loads(cli_output(result))
    assert payload["slug"] == "my-skill"
    assert payload["version"] is None
    assert payload["action"] == "unpublished"
    assert payload["visibility"] == "private"


def test_unpublish_forbidden_points_at_ownership(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    _stub(monkeypatch, (403, {"error": "Forbidden"}))

    result = runner.invoke(app, ["--no-input", "unpublish", "not-my-skill"])

    assert result.exit_code != 0
    output = cli_output(result).casefold()
    assert "owner or contributor" in output


def test_unpublish_version_hits_the_version_endpoint(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    calls = _stub(monkeypatch, (200, {"skill": {"published": True}}))

    result = runner.invoke(app, ["--no-input", "unpublish", "my-skill", "--version", "1.0.0"])

    assert result.exit_code == 0, cli_output(result)
    assert calls[0]["url"].endswith("/skills/my-skill/versions/1.0.0/unpublish")
    assert "my-skill@1.0.0" in cli_output(result)


def test_unpublish_latest_version_error_explains_the_way_out(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    _stub(monkeypatch, (400, {"error": "cannot_unpublish_latest_version"}))

    result = runner.invoke(app, ["--no-input", "unpublish", "my-skill", "--version", "1.0.0"])

    assert result.exit_code != 0
    output = cli_output(result)
    assert "latest" in output.casefold()
    assert "skillnav unpublish <slug>" in output


def test_unpublish_purge_uses_delete_and_confirms_the_effect(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    calls = _stub(
        monkeypatch,
        (200, {"ok": True, "recycleBin": True, "purgeAt": "2026-10-15T00:00:00.000Z"}),
    )

    result = runner.invoke(app, ["--no-input", "unpublish", "my-skill", "--purge"])

    assert result.exit_code == 0, cli_output(result)
    assert calls[0]["method"] == "DELETE"
    assert calls[0]["url"].endswith("/skills/my-skill")
    assert "recycle bin" in cli_output(result)


def test_unpublish_purge_rejects_a_single_version(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    calls = _stub(monkeypatch, (200, {}))

    result = runner.invoke(
        app, ["--no-input", "unpublish", "my-skill", "--purge", "--version", "1.0.0"]
    )

    assert result.exit_code == 3, cli_output(result)
    assert "--purge" in cli_output(result)
    assert calls == []


def test_unpublish_missing_skill_surfaces_the_error(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _login(isolated_config)
    _stub(monkeypatch, (404, {"error": "skill_not_found"}))

    result = runner.invoke(app, ["--no-input", "unpublish", "ghost-skill"])

    assert result.exit_code != 0
    assert "not found" in cli_output(result).casefold()
