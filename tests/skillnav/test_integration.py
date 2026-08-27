"""Integration tests against a live local API (skip if unavailable)."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path

import pytest
from typer.testing import CliRunner

from conftest import REPO_ROOT, cli_output
from skillnav.cli import app

API = os.environ.get("SKILLNAV_TEST_REGISTRY", "http://127.0.0.1:3000")
DEMO_SKILL = REPO_ROOT / "examples" / "demo-skill"


def api_available() -> bool:
    try:
        with urllib.request.urlopen(f"{API}/health", timeout=2):
            return True
    except (urllib.error.URLError, TimeoutError):
        return False


pytestmark = pytest.mark.skipif(not api_available(), reason="API not running at SKILLNAV_TEST_REGISTRY")


def test_version(runner: CliRunner) -> None:
    result = runner.invoke(app, ["--version"])
    assert result.exit_code == 0
    assert "skillnav" in result.stdout


def test_config_test(runner: CliRunner, isolated_config: Path) -> None:
    result = runner.invoke(app, ["--registry", API, "config", "test"])
    assert result.exit_code == 0, cli_output(result)
    assert "OK" in result.stdout


def _login_session(username: str = "alice", password: str = "password123") -> str:
    payload = json.dumps({"username": username, "password": password}).encode()
    req = urllib.request.Request(
        f"{API}/auth/login",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        body = json.loads(resp.read().decode())
    token = body.get("token")
    assert token
    return str(token)


def _create_api_key(session_token: str, name: str = "pytest-cli") -> str:
    payload = json.dumps({"name": name}).encode()
    req = urllib.request.Request(
        f"{API}/auth/api-keys",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {session_token}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        body = json.loads(resp.read().decode())
    secret = body.get("secret")
    assert secret
    return str(secret)


def test_login_and_whoami(runner: CliRunner, isolated_config: Path) -> None:
    session = _login_session()
    api_key = _create_api_key(session)
    result = runner.invoke(
        app,
        ["--registry", API, "login", "--api-key", api_key],
    )
    assert result.exit_code == 0, cli_output(result)
    assert "Logged in" in result.stdout

    whoami = runner.invoke(app, ["--registry", API, "whoami"])
    assert whoami.exit_code == 0, cli_output(whoami)
    assert "alice" in whoami.stdout


def test_search_and_info(runner: CliRunner) -> None:
    search = runner.invoke(app, ["--registry", API, "--json", "search", "demo"])
    assert search.exit_code == 0, cli_output(search)
    body = json.loads(search.stdout)
    assert body.get("items")

    info = runner.invoke(app, ["--registry", API, "--json", "info", "demo-skill"])
    assert info.exit_code == 0, cli_output(info)
    assert json.loads(info.stdout).get("slug") == "demo-skill"


def test_top(runner: CliRunner) -> None:
    result = runner.invoke(app, ["--registry", API, "top", "--limit", "5"])
    assert result.exit_code == 0, cli_output(result)


def test_review_demo_skill(runner: CliRunner, isolated_config: Path) -> None:
    if not DEMO_SKILL.is_dir():
        pytest.skip("examples/demo-skill not found")
    session = _login_session()
    api_key = _create_api_key(session)
    login = runner.invoke(app, ["--registry", API, "login", "--api-key", api_key])
    assert login.exit_code == 0, cli_output(login)

    result = runner.invoke(
        app,
        ["--registry", API, "--json", "review", str(DEMO_SKILL)],
    )
    assert result.exit_code == 0, cli_output(result)
    body = json.loads(result.stdout)
    assert body.get("review")


def test_review_requires_login(runner: CliRunner, isolated_config: Path) -> None:
    if not DEMO_SKILL.is_dir():
        pytest.skip("examples/demo-skill not found")
    result = runner.invoke(
        app,
        ["--registry", API, "--no-input", "review", str(DEMO_SKILL)],
    )
    assert result.exit_code == 2
    assert "not logged in" in cli_output(result)


def test_publish_dry_run(runner: CliRunner, isolated_config: Path) -> None:
    if not DEMO_SKILL.is_dir():
        pytest.skip("examples/demo-skill not found")
    session = _login_session()
    api_key = _create_api_key(session)
    login = runner.invoke(app, ["--registry", API, "login", "--api-key", api_key])
    assert login.exit_code == 0, cli_output(login)

    dry_run_version = "99.99.99-dryrun"
    result = runner.invoke(
        app,
        [
            "--registry",
            API,
            "--json",
            "publish",
            str(DEMO_SKILL),
            "--dry-run",
            "--version",
            dry_run_version,
        ],
    )
    assert result.exit_code == 0, cli_output(result)
    body = json.loads(result.stdout)
    assert body.get("entryPath") or body.get("frontmatter") is not None
    assert body.get("metadata", {}).get("version") == dry_run_version


def test_not_logged_in_exit_code(runner: CliRunner, isolated_config: Path) -> None:
    result = runner.invoke(
        app,
        ["--registry", API, "--no-input", "publish", str(DEMO_SKILL or ".")],
    )
    assert result.exit_code == 2
    assert "not logged in" in cli_output(result)


def _ensure_user(username: str, password: str, email: str) -> None:
    payload = json.dumps({"username": username, "password": password, "email": email}).encode()
    req = urllib.request.Request(
        f"{API}/auth/register",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=5)
    except urllib.error.HTTPError as exc:
        if exc.code not in (400, 409):
            raise


def _login_token(username: str, password: str) -> str:
    payload = json.dumps({"username": username, "password": password}).encode()
    req = urllib.request.Request(
        f"{API}/auth/login",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        body = json.loads(resp.read().decode())
    token = body.get("token")
    assert token
    return str(token)


def _remove_contributor_if_present(slug: str, username: str, token: str) -> None:
    req = urllib.request.Request(
        f"{API}/skills/{slug}",
        headers={"Authorization": f"Bearer {token}"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        skill = json.loads(resp.read().decode())
    for contributor in skill.get("contributors") or []:
        if contributor.get("username") == username:
            delete_req = urllib.request.Request(
                f"{API}/skills/{slug}/contributors/{contributor['id']}",
                headers={"Authorization": f"Bearer {token}"},
                method="DELETE",
            )
            try:
                urllib.request.urlopen(delete_req, timeout=5)
            except urllib.error.HTTPError:
                pass


def test_add_and_remove_contributor(runner: CliRunner, isolated_config: Path) -> None:
    _ensure_user("testuser", "test123456", "testuser@example.com")
    session = _login_session("alice", "password123")
    api_key = _create_api_key(session)
    alice_token = session
    _remove_contributor_if_present("demo-skill", "testuser", alice_token)

    login = runner.invoke(app, ["--registry", API, "login", "--api-key", api_key])
    assert login.exit_code == 0, cli_output(login)

    add = runner.invoke(
        app,
        [
            "--registry",
            API,
            "--json",
            "add-contributor",
            "demo-skill",
            "--username",
            "testuser",
        ],
    )
    assert add.exit_code == 0, cli_output(add)
    added = json.loads(add.stdout)
    assert added.get("contributor", {}).get("username") == "testuser"

    remove = runner.invoke(
        app,
        [
            "--registry",
            API,
            "remove-contributor",
            "demo-skill",
            "--username",
            "testuser",
        ],
    )
    assert remove.exit_code == 0, cli_output(remove)
    assert "Contributor removed: testuser" in remove.stdout

    info = runner.invoke(app, ["--registry", API, "--json", "info", "demo-skill"])
    assert info.exit_code == 0, cli_output(info)
    contributors = json.loads(info.stdout).get("contributors") or []
    assert not any(item.get("username") == "testuser" for item in contributors)


def test_add_contributor_requires_owner(runner: CliRunner, isolated_config: Path) -> None:
    _ensure_user("testuser", "test123456", "testuser@example.com")
    session = _login_session("testuser", "test123456")
    api_key = _create_api_key(session)
    login = runner.invoke(app, ["--registry", API, "login", "--api-key", api_key])
    assert login.exit_code == 0, cli_output(login)

    result = runner.invoke(
        app,
        [
            "--registry",
            API,
            "add-contributor",
            "demo-skill",
            "--username",
            "alice",
        ],
    )
    assert result.exit_code == 2, cli_output(result)
    assert "only_owner_can_add_contributors" in cli_output(result)
