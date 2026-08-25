"""Runtime CLI context: registry, token, output mode."""

from __future__ import annotations

import os
from dataclasses import dataclass

from skillnav.config import (
    ConfigFile,
    clear_profile_auth,
    get_profile,
    load_config,
    save_config,
    set_profile_identity,
)
from skillnav.errors import AuthError


@dataclass
class CliContext:
    registry: str
    profile_name: str
    token: str | None
    json_output: bool
    no_input: bool
    config: ConfigFile

    @classmethod
    def resolve(
        cls,
        *,
        registry_flag: str | None = None,
        profile_flag: str | None = None,
        json_output: bool = False,
        no_input: bool = False,
    ) -> CliContext:
        config = load_config()
        profile_name = (
            profile_flag
            or os.environ.get("SKILLNAV_PROFILE")
            or config.get("defaultProfile", "default")
        )
        profile = get_profile(config, profile_name)
        registry = (
            registry_flag
            or os.environ.get("SKILLNAV_REGISTRY")
            or profile.get("registry")
            or "http://127.0.0.1:3000"
        )
        token = os.environ.get("SKILLNAV_TOKEN") or profile.get("token")
        return cls(
            registry=registry.rstrip("/"),
            profile_name=profile_name,
            token=token,
            json_output=json_output,
            no_input=no_input,
            config=config,
        )

    def require_token(self) -> str:
        if not self.token:
            raise AuthError("not logged in (run: skillnav login)")
        return self.token

    def persist_token(self, token: str, me_body: dict) -> None:
        profile = get_profile(self.config, self.profile_name)
        profile["registry"] = self.registry
        profile["token"] = token
        set_profile_identity(profile, me_body)
        save_config(self.config)
        self.token = token

    def clear_auth(self) -> None:
        profile = get_profile(self.config, self.profile_name)
        clear_profile_auth(profile)
        save_config(self.config)
        self.token = None
