"""`skillnav install` requires --dir and prints agent-facing load guidance.

Agent clients often run in temporary or sandboxed working directories, so a
default `./<slug>/` install looks successful but the skill is never loaded.
"""

from __future__ import annotations

import io
import json
import zipfile
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


def _zip_bytes() -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("SKILL.md", "# demo\n")
    return buffer.getvalue()


def test_install_without_dir_fails_with_explanation(
    runner: CliRunner, isolated_config
) -> None:
    result = runner.invoke(app, ["install", "demo-skill"])

    assert result.exit_code == 2
    output = cli_output(result)
    assert "--dir" in output
    assert "required" in output
    assert "sandboxed" in output
    assert "--dir ~/.claude/skills" in output


def test_install_help_marks_dir_required(runner: CliRunner) -> None:
    result = runner.invoke(app, ["install", "--help"])

    assert result.exit_code == 0
    output = cli_output(result)
    assert "--dir" in output
    assert "Required" in output


def test_install_extracts_and_prints_next_steps(
    runner: CliRunner, isolated_config, tmp_path: Path, monkeypatch
) -> None:
    from skillnav import cli

    _login(isolated_config)
    monkeypatch.setattr(cli, "request_bytes", lambda *args, **kwargs: (200, _zip_bytes(), {}))

    dest = tmp_path / "skills" / "demo-skill"
    result = runner.invoke(app, ["install", "demo-skill", "--dir", str(dest)])

    assert result.exit_code == 0, result.output
    output = cli_output(result)
    assert f"Installed demo-skill@latest to {dest.resolve()}" in output
    assert "Next:" in output
    assert "~/.claude/skills" in output
    assert (dest / "SKILL.md").read_text(encoding="utf-8") == "# demo\n"


def test_install_json_includes_next_steps(
    runner: CliRunner, isolated_config, tmp_path: Path, monkeypatch
) -> None:
    from skillnav import cli

    _login(isolated_config)
    monkeypatch.setattr(cli, "request_bytes", lambda *args, **kwargs: (200, _zip_bytes(), {}))

    dest = tmp_path / "sj" / "demo-skill"
    result = runner.invoke(app, ["--json", "install", "demo-skill", "--dir", str(dest)])

    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    assert payload["path"] == str(dest.resolve())
    assert payload["slug"] == "demo-skill"
    assert payload["nextSteps"]
    assert "agent" in payload["nextSteps"][0]


def test_install_dir_expands_user_home(
    runner: CliRunner, isolated_config, tmp_path: Path, monkeypatch
) -> None:
    from skillnav import cli

    _login(isolated_config)
    monkeypatch.setattr(cli, "request_bytes", lambda *args, **kwargs: (200, _zip_bytes(), {}))
    monkeypatch.setenv("HOME", str(tmp_path))

    result = runner.invoke(app, ["install", "demo-skill", "--dir", "~/skills/demo-skill"])

    assert result.exit_code == 0, result.output
    assert (tmp_path / "skills" / "demo-skill" / "SKILL.md").exists()
