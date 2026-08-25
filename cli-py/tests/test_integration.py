"""Integration tests against a live local API (skip if unavailable)."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path

import pytest
from typer.testing import CliRunner

from skillnav.cli import app

API = os.environ.get("SKILLNAV_TEST_REGISTRY", "http://127.0.0.1:3000")
REPO_ROOT = Path(__file__).resolve().parents[2]
DEMO_SKILL = REPO_ROOT / "examples" / "demo-skill"


def api_available() -> bool:
    try:
        with urllib.request.urlopen(f"{API}/health", timeout=2):
            return True
    except (urllib.error.URLError, TimeoutError):
        return False


pytestmark = pytest.mark.skipif(not api_available(), reason="API not running at SKILLNAV_TEST_REGISTRY")


@pytest.fixture()
def runner() -> CliRunner:
    return CliRunner(mix_stderr=True)


def _output(result) -> str:
    return getattr(result, "output", None) or (result.stdout or "") + (result.stderr or "")


@pytest.fixture()
def isolated_config(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "config.json"
    monkeypatch.setenv("SKILLNAV_CONFIG", str(path))
    return path


def test_version(runner: CliRunner) -> None:
    result = runner.invoke(app, ["--version"])
    assert result.exit_code == 0
    assert "skillnav" in result.stdout


def test_config_test(runner: CliRunner, isolated_config: Path) -> None:
    result = runner.invoke(app, ["--registry", API, "config", "test"])
    assert result.exit_code == 0, _output(result)
    assert "OK" in result.stdout


def test_login_and_whoami(runner: CliRunner, isolated_config: Path) -> None:
    result = runner.invoke(
        app,
        [
            "--registry",
            API,
            "login",
            "--username",
            "alice",
            "--password",
            "password123",
        ],
    )
    assert result.exit_code == 0, _output(result)
    assert "Logged in" in result.stdout

    whoami = runner.invoke(app, ["--registry", API, "whoami"])
    assert whoami.exit_code == 0, _output(whoami)
    assert "alice" in whoami.stdout


def test_search_and_info(runner: CliRunner) -> None:
    search = runner.invoke(app, ["--registry", API, "--json", "search", "demo"])
    assert search.exit_code == 0, _output(search)
    body = json.loads(search.stdout)
    assert body.get("items")

    info = runner.invoke(app, ["--registry", API, "--json", "info", "demo-skill"])
    assert info.exit_code == 0, _output(info)
    assert json.loads(info.stdout).get("slug") == "demo-skill"


def test_top(runner: CliRunner) -> None:
    result = runner.invoke(app, ["--registry", API, "top", "--limit", "5"])
    assert result.exit_code == 0, _output(result)


def test_review_demo_skill(runner: CliRunner) -> None:
    if not DEMO_SKILL.is_dir():
        pytest.skip("examples/demo-skill not found")
    result = runner.invoke(
        app,
        ["--registry", API, "--json", "review", str(DEMO_SKILL)],
    )
    assert result.exit_code == 0, _output(result)
    body = json.loads(result.stdout)
    assert body.get("review")


def test_publish_dry_run(runner: CliRunner, isolated_config: Path) -> None:
    if not DEMO_SKILL.is_dir():
        pytest.skip("examples/demo-skill not found")
    login = runner.invoke(
        app,
        ["--registry", API, "login", "--username", "alice", "--password", "password123"],
    )
    assert login.exit_code == 0, _output(login)

    result = runner.invoke(
        app,
        ["--registry", API, "--json", "publish", str(DEMO_SKILL), "--dry-run"],
    )
    assert result.exit_code == 0, _output(result)
    body = json.loads(result.stdout)
    assert body.get("entryPath") or body.get("frontmatter") is not None


def test_not_logged_in_exit_code(runner: CliRunner, isolated_config: Path) -> None:
    result = runner.invoke(
        app,
        ["--registry", API, "--no-input", "publish", str(DEMO_SKILL or ".")],
    )
    assert result.exit_code == 2
    assert "not logged in" in _output(result)
