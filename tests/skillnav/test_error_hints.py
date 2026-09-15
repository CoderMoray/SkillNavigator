"""Tests for AI-friendly CLI error hints and formatting."""

from __future__ import annotations

import json

from typer.testing import CliRunner

from conftest import cli_output
from skillnav.cli import app
from skillnav.error_hints import enrich_api_error, enrich_usage_error, not_logged_in
from skillnav.errors import AuthError, SkillnavError
from skillnav.output import emit_error


def test_profile_already_exists_suggests_reusing_it_first() -> None:
    """Onboarding usually hits an existing profile that already points here."""
    hint = enrich_usage_error("Profile already exists: skillnav")

    joined = " ".join(hint.next_steps)
    assert "skillnav config use skillnav" in joined
    # Reuse comes before the destructive option.
    assert "config use" in hint.next_steps[0]
    assert "config remove" in joined


def test_config_add_existing_profile_suggests_reuse(
    runner, isolated_config
) -> None:
    """End to end: what the CLI actually prints when the profile exists."""
    isolated_config.parent.mkdir(parents=True, exist_ok=True)
    isolated_config.write_text(
        json.dumps(
            {
                "defaultProfile": "default",
                "profiles": {"default": {"registry": "http://127.0.0.1:3000"}},
            }
        ),
        encoding="utf-8",
    )

    result = runner.invoke(
        app, ["config", "add", "default", "--registry", "http://127.0.0.1:3000"]
    )

    assert result.exit_code != 0
    assert "config use default" in cli_output(result)


def test_not_logged_in_hint_has_next_steps() -> None:
    hint = not_logged_in(profile="default")
    assert "API key" in hint.summary
    assert hint.detail
    assert len(hint.next_steps) >= 3
    assert any("skillnav login" in step for step in hint.next_steps)


def test_enrich_api_error_publish_recycle_bin() -> None:
    hint = enrich_api_error("skill_in_recycle_bin", status=409)
    assert "recycle bin" in hint.summary.casefold()
    assert hint.next_steps
    assert any("restore" in step.casefold() for step in hint.next_steps)


def test_enrich_api_error_version_bump() -> None:
    hint = enrich_api_error(
        "Version must be greater than latest: demo-skill@1.0.0, got 1.0.0",
        status=400,
    )
    assert "1.0.0" in hint.summary
    assert any("skillnav status" in step for step in hint.next_steps)


def test_enrich_usage_error_unknown_profile() -> None:
    hint = enrich_usage_error("Unknown profile: staging")
    assert "staging" in hint.summary
    assert any("config list" in step for step in hint.next_steps)


def test_emit_error_human_format(capsys) -> None:
    emit_error(
        "Not logged in",
        json_output=False,
        detail="Missing API key.",
        next_steps=("Run skillnav login",),
    )
    err = capsys.readouterr().err
    assert "✗ skillnav: Not logged in" in err
    assert "What happened:" in err
    assert "Next steps:" in err
    assert "Run skillnav login" in err


def test_emit_error_json_includes_next_steps(capsys) -> None:
    emit_error(
        "Skill not found",
        json_output=True,
        detail="No slug match.",
        next_steps=("skillnav search demo",),
    )
    payload = json.loads(capsys.readouterr().err.strip())
    assert payload["error"] == "Skill not found"
    assert payload["detail"] == "No slug match."
    assert payload["nextSteps"] == ["skillnav search demo"]


def test_auth_error_from_hint() -> None:
    exc = AuthError.from_hint(not_logged_in(profile="dev"))
    assert exc.exit_code == 2
    assert exc.detail
    assert exc.next_steps


def test_enrich_api_error_pending_publish_use_retry() -> None:
    hint = enrich_api_error("pending_publish_use_retry", status=409)
    assert "retry-publish" in " ".join(hint.next_steps).casefold()


def test_skillnav_error_from_hint() -> None:
    hint = enrich_api_error("inspection_pipeline_incomplete", status=503)
    exc = SkillnavError.from_hint(hint)
    assert exc.message == hint.summary
    assert exc.next_steps == hint.next_steps


def test_config_use_unknown_profile_shows_steps(runner: CliRunner, isolated_config) -> None:
    result = runner.invoke(app, ["config", "use", "missing"])
    assert result.exit_code == 3
    assert "Unknown profile: missing" in result.output
    assert "Next steps:" in result.output
    assert "config list" in result.output


def test_publish_without_login_json(runner: CliRunner, isolated_config) -> None:
    result = runner.invoke(
        app,
        ["--json", "--no-input", "publish", "examples/demo-skill", "--dry-run"],
    )
    assert result.exit_code == 2
    payload = json.loads(result.output)
    assert "error" in payload
    assert "nextSteps" in payload
    assert any("login" in step for step in payload["nextSteps"])
