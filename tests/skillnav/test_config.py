"""Config file read/write."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from skillnav import config as config_mod


@pytest.fixture()
def config_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "config.json"
    monkeypatch.setenv("SKILLNAV_CONFIG", str(path))
    return path


def test_save_and_load_roundtrip(config_file: Path) -> None:
    data = {
        "defaultProfile": "prod",
        "profiles": {
            "prod": {"registry": "http://127.0.0.1:3000", "token": "abc"},
        },
    }
    config_mod.save_config(data)
    loaded = config_mod.load_config()
    assert loaded["defaultProfile"] == "prod"
    assert loaded["profiles"]["prod"]["token"] == "abc"
    assert config_file.exists()
    assert oct(config_file.stat().st_mode & 0o777) in {"0o600", "0o666"}  # Windows may ignore chmod


def test_default_config_when_missing(config_file: Path) -> None:
    loaded = config_mod.load_config()
    assert loaded["defaultProfile"] == config_mod.DEFAULT_PROFILE_NAME
    assert config_mod.DEFAULT_REGISTRY in loaded["profiles"]["default"]["registry"]
