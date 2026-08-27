"""Publish metadata builder/validation tests."""

from __future__ import annotations

import pytest

from skillnav.errors import UsageError
from skillnav.publish_metadata import build_publish_metadata, validate_publish_metadata


def test_build_publish_metadata_from_hints() -> None:
    metadata = build_publish_metadata(
        {
            "name": "Demo Skill",
            "slug": "demo-skill",
            "description": "A useful demo skill.",
            "version": "1.0.0",
            "categories": ["Developer Tools"],
            "release-tags": ["latest"],
        }
    )
    assert metadata["displayName"] == "Demo Skill"
    assert metadata["slug"] == "demo-skill"
    assert metadata["summary"] == "A useful demo skill."
    assert metadata["categories"] == ["Developer Tools"]
    assert metadata["releaseTags"] == ["latest"]


def test_build_publish_metadata_flags_override_hints() -> None:
    metadata = build_publish_metadata(
        {"name": "Old", "slug": "old", "description": "old", "version": "0.1.0"},
        display_name="New Skill",
        slug="new-skill",
        description="New summary.",
        categories=["Automation"],
        version="2.0.0",
        release_tags=["beta"],
    )
    assert metadata["displayName"] == "New Skill"
    assert metadata["slug"] == "new-skill"
    assert metadata["categories"] == ["Automation"]
    assert metadata["releaseTags"] == ["beta"]


def test_validate_publish_metadata_requires_category() -> None:
    with pytest.raises(UsageError, match="category"):
        validate_publish_metadata(
            {
                "displayName": "Demo",
                "slug": "demo-skill",
                "summary": "Summary text",
                "categories": [],
                "topics": [],
                "version": "1.0.0",
                "releaseTags": ["latest"],
            }
        )


def test_validate_publish_metadata_requires_semver() -> None:
    with pytest.raises(UsageError, match="SemVer"):
        validate_publish_metadata(
            {
                "displayName": "Demo",
                "slug": "demo-skill",
                "summary": "Summary text",
                "categories": ["Developer Tools"],
                "topics": [],
                "version": "not-semver",
                "releaseTags": ["latest"],
            }
        )


def test_build_publish_metadata_normalizes_category_case() -> None:
    metadata = build_publish_metadata(
        {
            "name": "Demo Skill",
            "slug": "demo-skill",
            "description": "Summary",
            "version": "1.0.0",
            "categories": ["developer tools"],
            "release-tags": ["latest"],
        }
    )
    assert metadata["categories"] == ["Developer Tools"]


def test_build_publish_metadata_rejects_invalid_category() -> None:
    with pytest.raises(UsageError, match="Invalid category: 'Not Real'"):
        build_publish_metadata(
            {
                "name": "Demo Skill",
                "slug": "demo-skill",
                "description": "Summary",
                "version": "1.0.0",
                "categories": ["Not Real"],
                "release-tags": ["latest"],
            }
        )
