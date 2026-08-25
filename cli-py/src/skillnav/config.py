"""Persistent multi-profile configuration (~/.config/skillnav/config.json)."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, TypedDict


class Identity(TypedDict, total=False):
    username: str
    userId: int | str


class Profile(TypedDict, total=False):
    registry: str
    token: str
    identity: Identity


class ConfigFile(TypedDict, total=False):
    defaultProfile: str
    profiles: dict[str, Profile]


DEFAULT_REGISTRY = "http://127.0.0.1:3000"
DEFAULT_PROFILE_NAME = "default"


def config_path() -> Path:
    override = os.environ.get("SKILLNAV_CONFIG")
    if override:
        return Path(override).expanduser()
    return Path.home() / ".config" / "skillnav" / "config.json"


def load_config() -> ConfigFile:
    path = config_path()
    if not path.is_file():
        return {
            "defaultProfile": DEFAULT_PROFILE_NAME,
            "profiles": {
                DEFAULT_PROFILE_NAME: {"registry": DEFAULT_REGISTRY},
            },
        }
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid config file: {path}") from exc
    if not isinstance(data, dict):
        raise ValueError(f"Invalid config file: {path}")
    profiles = data.get("profiles")
    if not isinstance(profiles, dict):
        profiles = {}
    default_profile = data.get("defaultProfile") or DEFAULT_PROFILE_NAME
    if default_profile not in profiles:
        profiles[default_profile] = {"registry": DEFAULT_REGISTRY}
    return {"defaultProfile": default_profile, "profiles": profiles}


def save_config(config: ConfigFile) -> None:
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
    try:
        path.chmod(0o600)
    except OSError:
        pass


def get_profile(config: ConfigFile, name: str) -> Profile:
    profiles = config.setdefault("profiles", {})
    if name not in profiles:
        profiles[name] = {"registry": DEFAULT_REGISTRY}
    return profiles[name]


def set_profile_identity(profile: Profile, identity: dict[str, Any]) -> None:
    user = identity.get("user") if "user" in identity else identity
    if not isinstance(user, dict):
        return
    user_id = user.get("id", user.get("userId"))
    profile["identity"] = {
        "username": str(user.get("username", "")),
        "userId": user_id if user_id is not None else "",
    }


def clear_profile_auth(profile: Profile) -> None:
    profile.pop("token", None)
    profile.pop("identity", None)
