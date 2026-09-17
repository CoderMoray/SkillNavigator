"""`publish --wait` must outlive the server-side inspection pipeline.

A synchronous publish holds a single connection until SkillSpector, VirusTotal
and HaluCatch are finished. VirusTotal queues a newly uploaded file for
minutes, so the generic 120s request timeout used to fire first and replaced
the authoritative, retryable 503 (`inspection_pipeline_incomplete`) with a bare
connection timeout that tells an agent nothing about what to do next.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from typer.testing import CliRunner

from skillnav import cli
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


def test_upload_without_wait_keeps_the_short_timeout() -> None:
    assert cli._publish_timeout(wait=False) == cli.PUBLISH_UPLOAD_TIMEOUT_SECONDS


def test_wait_budget_exceeds_the_upload_budget() -> None:
    assert cli._publish_timeout(wait=True) == cli.PUBLISH_WAIT_TIMEOUT_SECONDS
    assert cli.PUBLISH_WAIT_TIMEOUT_SECONDS > cli.PUBLISH_UPLOAD_TIMEOUT_SECONDS


def test_wait_budget_can_be_overridden(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SKILLNAV_PUBLISH_WAIT_TIMEOUT", "900")
    assert cli._publish_timeout(wait=True) == 900.0


@pytest.mark.parametrize("value", ["", "  ", "soon", "0", "-5"])
def test_invalid_wait_budget_falls_back(
    monkeypatch: pytest.MonkeyPatch, value: str
) -> None:
    monkeypatch.setenv("SKILLNAV_PUBLISH_WAIT_TIMEOUT", value)
    assert cli._publish_timeout(wait=True) == cli.PUBLISH_WAIT_TIMEOUT_SECONDS


def _stub_network_and_package(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> dict[str, Any]:
    """Stub the HTTP layer and package plumbing; capture the request kwargs."""
    captured: dict[str, Any] = {}
    package = tmp_path / "demo-skill"
    package.mkdir(parents=True, exist_ok=True)

    def fake_request_json(
        method: str,
        url: str,
        *,
        body: dict[str, Any] | None = None,
        token: str | None = None,
        timeout: float = 120,
    ) -> tuple[int, dict[str, Any]]:
        captured.update(method=method, url=url, body=body, timeout=timeout)
        return 202, {
            "slug": "demo-skill",
            "name": "Demo",
            "version": "1.0.0",
            "inspectionStatus": "inspecting",
        }

    monkeypatch.setattr(cli, "request_json", fake_request_json)
    monkeypatch.setattr(cli, "resolve_package_path", lambda value: package)
    monkeypatch.setattr(cli, "read_frontmatter_hints", lambda path: {})
    monkeypatch.setattr(cli, "package_to_base64", lambda path: "UEsDBAoAAAAAAA==")
    monkeypatch.setattr(
        cli,
        "build_publish_metadata",
        lambda hints, **kwargs: {
            "slug": "demo-skill",
            "version": "1.0.0",
            "displayName": "Demo",
            "categories": ["Other"],
            "releaseTags": ["latest"],
        },
    )
    return captured


def test_publish_wait_uses_the_long_budget(
    runner: CliRunner,
    isolated_config: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _login(isolated_config)
    captured = _stub_network_and_package(monkeypatch, tmp_path)

    result = runner.invoke(
        app, ["--json", "publish", str(tmp_path / "demo-skill"), "--wait"]
    )

    assert result.exit_code == 0
    assert captured["timeout"] == cli.PUBLISH_WAIT_TIMEOUT_SECONDS
    # The client waits for the pipeline, so it must also ask the server to be
    # synchronous — otherwise the longer budget would be pointless.
    assert captured["body"]["async"] is False


def test_background_publish_keeps_the_short_budget(
    runner: CliRunner,
    isolated_config: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _login(isolated_config)
    captured = _stub_network_and_package(monkeypatch, tmp_path)

    result = runner.invoke(app, ["--json", "publish", str(tmp_path / "demo-skill")])

    assert result.exit_code == 0
    assert captured["timeout"] == cli.PUBLISH_UPLOAD_TIMEOUT_SECONDS
    assert captured["body"]["async"] is True


def test_dry_run_never_needs_the_pipeline_budget(
    runner: CliRunner,
    isolated_config: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _login(isolated_config)
    captured = _stub_network_and_package(monkeypatch, tmp_path)

    result = runner.invoke(
        app,
        ["--json", "publish", str(tmp_path / "demo-skill"), "--wait", "--dry-run"],
    )

    assert result.exit_code == 0
    assert captured["url"].endswith("/skills/publish/preview")
    assert captured["timeout"] == cli.PUBLISH_UPLOAD_TIMEOUT_SECONDS


def test_retry_inspection_wait_uses_the_long_budget(
    runner: CliRunner,
    isolated_config: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _login(isolated_config)
    captured = _stub_network_and_package(monkeypatch, tmp_path)

    result = runner.invoke(app, ["--json", "retry-inspection", "demo-skill", "--wait"])

    assert result.exit_code == 0
    assert captured["url"].endswith("/skills/demo-skill/retry-publish")
    assert captured["timeout"] == cli.PUBLISH_WAIT_TIMEOUT_SECONDS
