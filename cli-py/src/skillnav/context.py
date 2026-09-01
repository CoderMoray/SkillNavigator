"""Runtime CLI context: registry, API key, output mode."""

from __future__ import annotations

import os
from dataclasses import dataclass

from skillnav.config import (
    ConfigFile,
    clear_profile_auth,
    get_profile,
    load_config,
    resolve_profile_api_key,
    save_config,
    set_profile_identity,
)
from skillnav.error_hints import not_logged_in
from skillnav.errors import AuthError


@dataclass
class CliContext:
    registry: str
    profile_name: str
    api_key: str | None
    json_output: bool
    no_input: bool
    config: ConfigFile

    @property
    def token(self) -> str | None:
        return self.api_key

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
        api_key = (
            os.environ.get("SKILLNAV_API_KEY")
            or os.environ.get("SKILLNAV_TOKEN")
            or resolve_profile_api_key(profile)
        )
        return cls(
            registry=registry.rstrip("/"),
            profile_name=profile_name,
            api_key=api_key,
            json_output=json_output,
            no_input=no_input,
            config=config,
        )

    def require_token(self) -> str:
        if not self.api_key:
            raise AuthError.from_hint(not_logged_in(profile=self.profile_name))
        return self.api_key

    def persist_api_key(self, api_key: str, me_body: dict) -> None:
        profile = get_profile(self.config, self.profile_name)
        profile["registry"] = self.registry
        profile["apiKey"] = api_key
        profile.pop("token", None)
        set_profile_identity(profile, me_body)
        save_config(self.config)
        self.api_key = api_key

    def persist_token(self, token: str, me_body: dict) -> None:
        self.persist_api_key(token, me_body)

    def clear_auth(self) -> None:
        profile = get_profile(self.config, self.profile_name)
        clear_profile_auth(profile)
        save_config(self.config)
        self.api_key = None
