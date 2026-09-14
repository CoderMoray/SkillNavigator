"""CLI entry-point tests (subprocess, not only CliRunner)."""

from __future__ import annotations

import subprocess
import sys

import pytest

from skillnav import __version__
from skillnav.cli import run


@pytest.mark.parametrize("args", [["--version"], ["-v"]])
def test_version_run(args: list[str]) -> None:
    assert run(args) == 0


@pytest.mark.parametrize("args", [["--version"], ["-v"]])
def test_version_subprocess(args: list[str]) -> None:
    completed = subprocess.run(
        [sys.executable, "-m", "skillnav", *args],
        capture_output=True,
        text=True,
        check=False,
    )
    assert completed.returncode == 0, completed.stdout + completed.stderr
    assert f"skillnav {__version__}" in completed.stdout


def test_version_subprocess_console_script() -> None:
    import shutil

    skillnav_bin = shutil.which("skillnav")
    if not skillnav_bin:
        pytest.skip("skillnav console script not on PATH")

    completed = subprocess.run(
        [skillnav_bin, "--version"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert completed.returncode == 0, completed.stdout + completed.stderr
    assert f"skillnav {__version__}" in completed.stdout
