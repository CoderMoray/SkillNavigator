"""Unit tests for human-readable output helpers."""

from __future__ import annotations

from skillnav.output import print_skill_summary, unwrap_resource_id


def test_print_skill_summary_dict_versions(capsys) -> None:
    body = {
        "slug": "demo-skill",
        "name": "Demo Skill",
        "latestVersion": "0.1.0",
        "published": True,
        "versions": {
            "0.1.0": {
                "version": "0.1.0",
                "status": "approved",
                "review": {"verdict": "approved"},
            }
        },
    }
    print_skill_summary(body)
    out = capsys.readouterr().out
    assert "Demo Skill (demo-skill)" in out
    assert "Status: approved" in out
    assert "Latest: 0.1.0" in out
    assert "0.1.0 [approved] review=approved" in out


def test_print_skill_summary_list_versions(capsys) -> None:
    body = {
        "slug": "legacy",
        "name": "Legacy",
        "status": "published",
        "versions": [
            {
                "version": "1.0.0",
                "status": "approved",
                "review": {"verdict": "approved"},
            }
        ],
    }
    print_skill_summary(body)
    out = capsys.readouterr().out
    assert "Status: published" in out
    assert "1.0.0 [approved] review=approved" in out


def test_unwrap_resource_id_nested() -> None:
    payload = {"issue": {"id": "issue_123", "title": "Test"}}
    assert unwrap_resource_id(payload, "issue") == "issue_123"


def test_unwrap_resource_id_flat() -> None:
    payload = {"id": "issue_456"}
    assert unwrap_resource_id(payload, "issue") == "issue_456"


def test_unwrap_resource_id_missing() -> None:
    assert unwrap_resource_id({}, "issue") == "?"
