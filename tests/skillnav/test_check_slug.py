"""`skillnav check-slug` answers "can I publish under this slug" up front.

Publishing to a taken slug otherwise fails only at the very end, after the
package has been uploaded. The server also distinguishes three states, and the
recycle-bin one is actionable: the slug is only held because a soft-deleted skill
still owns it.
"""

from __future__ import annotations

import json
from pathlib import Path

from typer.testing import CliRunner

from conftest import cli_output
from skillnav.cli import app


def _stub(monkeypatch, response):
    """Record outgoing requests and answer with one canned (status, body)."""
    calls: list[dict] = []

    def fake_request_json(method, url, *args, **kwargs):  # noqa: ANN001
        calls.append({"method": method, "url": url, **kwargs})
        return response

    from skillnav import cli

    monkeypatch.setattr(cli, "request_json", fake_request_json)
    return calls


def test_check_slug_reports_an_available_slug(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    calls = _stub(monkeypatch, (200, {"status": "available"}))

    result = runner.invoke(app, ["check-slug", "brand-new"])

    assert result.exit_code == 0, cli_output(result)
    output = cli_output(result)
    assert "Available" in output
    assert "brand-new" in output
    assert calls[0]["method"] == "GET"
    assert calls[0]["url"].endswith("/skills/brand-new/availability")


def test_check_slug_reports_an_active_skill(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _stub(
        monkeypatch,
        (
            200,
            {
                "status": "active",
                "slug": "my-skill",
                "name": "My Skill",
                "latestVersion": "1.2.0",
                "published": True,
            },
        ),
    )

    result = runner.invoke(app, ["check-slug", "my-skill"])

    assert result.exit_code == 0, cli_output(result)
    output = cli_output(result)
    assert "Taken" in output
    assert "1.2.0" in output
    assert "listed publicly" in output
    assert "skillnav info my-skill" in output


def test_check_slug_says_when_an_active_skill_is_not_listed(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _stub(
        monkeypatch,
        (200, {"status": "active", "slug": "my-skill", "latestVersion": "1.0.0", "published": False}),
    )

    result = runner.invoke(app, ["check-slug", "my-skill"])

    assert result.exit_code == 0, cli_output(result)
    assert "not listed publicly" in cli_output(result)


def test_check_slug_points_at_the_bin_when_the_slug_is_held_there(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _stub(
        monkeypatch,
        (
            200,
            {
                "status": "recycle_bin",
                "slug": "my-skill",
                "name": "My Skill",
                "deletedAt": "2026-09-16T00:00:00.000Z",
                "purgeAt": "2026-09-23T00:00:00.000Z",
            },
        ),
    )

    result = runner.invoke(app, ["check-slug", "my-skill"])

    assert result.exit_code == 0, cli_output(result)
    output = cli_output(result)
    assert "recycle bin" in output
    assert "2026-09-23" in output
    # The slug is only held by a soft-deleted skill, so say how to release it.
    assert "skillnav trash purge my-skill" in output


def test_check_slug_json_passes_the_server_payload_through(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    _stub(monkeypatch, (200, {"status": "available"}))

    result = runner.invoke(app, ["--json", "check-slug", "brand-new"])

    assert result.exit_code == 0, cli_output(result)
    assert json.loads(cli_output(result)) == {"status": "available"}


def test_check_slug_works_without_login(
    runner: CliRunner, isolated_config: Path, monkeypatch
) -> None:
    """Knowing whether a slug is free is useful before you have credentials."""
    calls = _stub(monkeypatch, (200, {"status": "available"}))

    result = runner.invoke(app, ["check-slug", "brand-new"])

    assert result.exit_code == 0, cli_output(result)
    assert calls[0].get("token") is None
