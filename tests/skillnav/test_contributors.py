"""Contributor helper tests."""

from __future__ import annotations

import pytest

from skillnav.contributors import resolve_contributor_id
from skillnav.errors import SkillnavError


def test_resolve_contributor_id_by_username() -> None:
    skill = {
        "contributors": [
            {"id": "owner_1", "username": "alice", "name": "Alice", "role": "owner"},
            {"id": "contrib_1", "username": "bob", "name": "Bob", "role": "contributor"},
        ]
    }
    assert resolve_contributor_id(skill, "bob") == "contrib_1"


def test_resolve_contributor_id_by_display_name() -> None:
    skill = {
        "contributors": [
            {"id": "contrib_2", "username": "carol", "name": "Carol Chen", "role": "contributor"},
        ]
    }
    assert resolve_contributor_id(skill, "Carol Chen") == "contrib_2"


def test_resolve_contributor_id_not_found() -> None:
    with pytest.raises(SkillnavError, match="contributor not found"):
        resolve_contributor_id({"contributors": []}, "missing")


def test_resolve_contributor_id_skips_owner() -> None:
    skill = {
        "contributors": [
            {"id": "owner_1", "username": "alice", "name": "Alice", "role": "owner"},
        ]
    }
    with pytest.raises(SkillnavError, match="contributor not found"):
        resolve_contributor_id(skill, "alice")
