"""Contributor lookup helpers."""

from __future__ import annotations

from typing import Any

from skillnav.errors import SkillnavError


def resolve_contributor_id(skill_body: dict[str, Any], username: str) -> str:
    """Resolve a contributor id by username or display name (case-insensitive)."""
    needle = username.strip().casefold()
    if not needle:
        raise SkillnavError("username must not be empty")

    matches: list[dict[str, Any]] = []
    for contributor in skill_body.get("contributors") or []:
        if not isinstance(contributor, dict):
            continue
        if contributor.get("role") == "owner":
            continue
        username_value = str(contributor.get("username") or "").casefold()
        name_value = str(contributor.get("name") or "").casefold()
        if needle in {username_value, name_value}:
            matches.append(contributor)

    if not matches:
        raise SkillnavError(f"contributor not found: {username}")
    if len(matches) > 1:
        raise SkillnavError(f"ambiguous contributor: {username}")
    contributor_id = matches[0].get("id")
    if not contributor_id:
        raise SkillnavError(f"contributor not found: {username}")
    return str(contributor_id)
