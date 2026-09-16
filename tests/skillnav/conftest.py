"""Pytest fixtures for skillnav CLI tests (package under cli-py/src)."""

from __future__ import annotations

import os
import re
from pathlib import Path

import pytest
from typer.testing import CliRunner

REPO_ROOT = Path(__file__).resolve().parents[2]

_ANSI_ESCAPE = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")

# rich 检测到 CI 环境（CI / GITHUB_ACTIONS）时会用一个极窄的宽度渲染 help 与
# 错误框，把测试要断言的文案折行/省略掉——同一提交本地绿、CI 红，且报出的
# 错误框内容为空。宽度是在 rich Console 首次创建时确定的，也就是 `skillnav`
# 被 import 的那一刻，所以必须在 conftest 加载阶段（早于任何 skillnav import）
# 设好 COLUMNS；放进 fixture 里已经太晚。
os.environ.setdefault("COLUMNS", "120")
os.environ.setdefault("LINES", "40")

# rich 检测到 CI 环境（CI / GITHUB_ACTIONS）时会强制着色，ANSI 序列会把断言里的
# 选项名从中间切开（'--registry' 实际渲染成 '-<esc>[0m-registry'）——同一提交
# 本地无颜色所以通过，CI 上 7 个断言失败。NO_COLOR 是 rich 与 click 都遵守的
# 跨工具标准开关，设上它让文本与颜色无关。
os.environ.setdefault("NO_COLOR", "1")


@pytest.fixture()
def runner() -> CliRunner:
    # click>=8.3 已移除 mix_stderr（stdout/stderr 默认混合），cli_output 兼容两种形态。
    return CliRunner()


@pytest.fixture()
def isolated_config(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "config.json"
    monkeypatch.setenv("SKILLNAV_CONFIG", str(path))
    return path


@pytest.fixture(autouse=True)
def _no_release_check(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep CLI tests offline: the root callback normally runs the daily
    release check (tests for that live in test_version_check.py)."""
    monkeypatch.setattr("skillnav.cli.maybe_notify_update", lambda *a, **k: None)


def cli_output(result) -> str:
    """Everything the CLI printed, as plain text.

    Two environment traps this smooths over:
    - click >= 8.3 dropped ``mix_stderr``, and the rich-rendered help/error box
      may go to stderr while Usage/Try stay on stdout — merge both streams.
    - typer forces terminal mode when it sees ``GITHUB_ACTIONS`` (i.e. in CI),
      so styling escape codes split the tokens we assert on: ``--registry``
      renders as ``-<esc>[0m<esc>[1;36m-registry``. The same commit passed
      locally and failed in CI on seven assertions. Strip styling here —
      assertions are about the message, not the colour.
    """
    stdout = getattr(result, "stdout", "") or ""
    stderr = getattr(result, "stderr", "") or ""
    text = stdout + stderr if (stdout or stderr) else (getattr(result, "output", None) or "")
    return _ANSI_ESCAPE.sub("", text)
