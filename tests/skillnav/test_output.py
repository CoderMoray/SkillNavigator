"""Unit tests for human-readable output helpers."""

from __future__ import annotations

import pytest

from skillnav.output import (
    filter_skill_body_version,
    find_version_entry,
    print_report_version,
    print_review,
    print_review_result,
    print_skill_info,
    print_skill_status,
    print_virustotal_summary,
    unwrap_resource_id,
)

SAMPLE_SKILL = {
    "slug": "demo-skill",
    "name": "Demo Skill",
    "description": "A demo skill for testing.",
    "latestVersion": "1.0.1",
    "reviewStatus": "completed",
    "published": True,
    "averageRating": 4.5,
    "ratingCount": 12,
    "createdAt": "2026-08-01T00:00:00.000Z",
    "updatedAt": "2026-08-20T00:00:00.000Z",
    "contributors": [
        {"name": "alice", "username": "alice", "role": "owner"},
        {"name": "bob", "username": "bob", "role": "contributor"},
    ],
    "issues": [
        {"id": "issue_1", "status": "open", "title": "Test"},
        {"id": "issue_2", "status": "closed", "title": "Done"},
    ],
    "versions": {
        "1.0.0": {
            "version": "1.0.0",
            "status": "published",
            "published": True,
            "contentHash": "abc123def4567890",
            "downloads": 10,
            "manifest": {"categories": ["demo", "tutorial"]},
            "review": {
                "verdict": "published",
                "virusTotal": {
                    "status": "completed",
                    "malicious": 0,
                    "suspicious": 0,
                },
            },
        },
        "1.0.1": {
            "version": "1.0.1",
            "status": "published",
            "published": True,
            "contentHash": "fedcba9876543210",
            "downloads": 42,
            "manifest": {"categories": ["demo", "tutorial"]},
            "review": {
                "verdict": "published",
                "virusTotal": {
                    "status": "completed",
                    "malicious": 0,
                    "suspicious": 1,
                },
            },
        },
    },
}


def test_print_skill_info(capsys) -> None:
    print_skill_info(SAMPLE_SKILL)
    out = capsys.readouterr().out
    assert "Demo Skill (demo-skill)" in out
    assert "Description: A demo skill for testing." in out
    assert "Categories: demo, tutorial" in out
    assert "Latest: 1.0.1" in out
    assert "Owner: alice" in out
    assert "Contributors: alice, bob (2)" in out
    assert "Rating: 4.5 (12)" in out
    assert "Open issues: 1" in out
    assert "Downloads (latest): 42" in out
    assert "Visibility: public" in out
    assert "Verdict:" not in out
    assert "Versions:" not in out


def test_print_skill_status(capsys) -> None:
    print_skill_status(SAMPLE_SKILL)
    out = capsys.readouterr().out
    assert out.startswith("demo-skill@1.0.1")
    assert "Review status: review completed" in out
    assert "Verdict: published" in out
    assert "Visibility: public" in out
    assert "Versions:" in out
    assert "1.0.0  review=review completed  verdict=published" in out
    assert "VT=0/0" in out
    assert "1.0.1 (latest)  review=review completed  verdict=published" in out
    assert "VT=0/1" in out
    assert "Tip: skillnav report demo-skill --version 1.0.1" in out
    assert "Description:" not in out


def test_print_skill_status_reviewing(capsys) -> None:
    skill = {
        **SAMPLE_SKILL,
        "reviewStatus": "reviewing",
        "published": False,
        "reviewCompletedStages": ["halucatch"],
        "versions": {
            "1.0.1": {
                "version": "1.0.1",
                "status": "needs-review",
                "published": False,
                "contentHash": "fedcba9876543210",
            }
        },
    }
    print_skill_status(skill)
    out = capsys.readouterr().out
    assert "Review status: in review" in out
    assert "HaluCatch: done" in out
    assert "SkillSpector: pending" in out
    assert "Verdict: pending" in out
    assert "Visibility: unpublished" in out
    assert "1.0.1 (latest)  review=in review  verdict=pending" in out
    assert "progress: HaluCatch: done" in out


def test_print_skill_status_failed(capsys) -> None:
    skill = {
        **SAMPLE_SKILL,
        "reviewStatus": "failed",
        "published": False,
        "reviewCompletedStages": ["halucatch"],
        "reviewFailure": {
            "stages": ["virustotal"],
            "message": "VirusTotal scan timed out",
        },
        "versions": {
            "1.0.2": {
                "version": "1.0.2",
                "status": "rejected",
                "published": False,
                "contentHash": "abc123",
            }
        },
        "latestVersion": "1.0.2",
    }
    print_skill_status(skill)
    out = capsys.readouterr().out
    assert "Review status: review failed" in out
    assert "VirusTotal: failed" in out
    assert "Review failure: VirusTotal: VirusTotal scan timed out" in out
    assert "Verdict: pending" in out
    assert "1.0.2 (latest)  review=review failed  verdict=pending" in out
    assert "failure: VirusTotal: VirusTotal scan timed out" in out
    assert "Tip: skillnav retry-publish demo-skill" in out


def test_print_skill_status_multi_version_mixed_review(capsys) -> None:
    skill = {
        **SAMPLE_SKILL,
        "reviewStatus": "reviewing",
        "published": False,
        "reviewCompletedStages": ["halucatch"],
        "latestVersion": "1.0.2",
        "versions": {
            "1.0.0": SAMPLE_SKILL["versions"]["1.0.0"],
            "1.0.1": {
                "version": "1.0.1",
                "status": "rejected",
                "published": False,
                "contentHash": "aaa111",
                "reviewEndedAt": "2026-08-15T00:00:00.000Z",
                "review": {"verdict": "rejected"},
            },
            "1.0.2": {
                "version": "1.0.2",
                "status": "needs-review",
                "published": False,
                "contentHash": "bbb222",
            },
        },
    }
    print_skill_status(skill)
    out = capsys.readouterr().out
    assert "1.0.0  review=review completed  verdict=published" in out
    assert "1.0.1  review=review completed  verdict=rejected" in out
    assert "1.0.2 (latest)  review=in review  verdict=pending" in out


def test_print_skill_status_single_version(capsys) -> None:
    print_skill_status(SAMPLE_SKILL, version="1.0.0")
    out = capsys.readouterr().out
    assert out.startswith("demo-skill@1.0.0")
    assert "Review status: review completed" in out
    assert "Verdict: published" in out
    assert "Published: yes" in out
    assert "Content hash:" in out
    assert "VirusTotal: 0/0" in out
    assert "Versions:" not in out
    assert "Tip: skillnav report demo-skill --version 1.0.0" in out


def test_print_skill_status_single_version_latest(capsys) -> None:
    print_skill_status(SAMPLE_SKILL, version="1.0.1")
    out = capsys.readouterr().out
    assert out.startswith("demo-skill@1.0.1 (latest)")
    assert "VirusTotal: 0/1" in out


def test_find_version_entry_by_key_and_semver() -> None:
    version_id, entry = find_version_entry(SAMPLE_SKILL, "1.0.0")
    assert version_id == "1.0.0"
    assert entry["published"] is True


def test_filter_skill_body_version() -> None:
    filtered = filter_skill_body_version(SAMPLE_SKILL, "1.0.1")
    assert list(filtered["versions"].keys()) == ["1.0.1"]
    assert filtered["versions"]["1.0.1"]["version"] == "1.0.1"


def test_find_version_entry_missing_raises() -> None:
    with pytest.raises(ValueError, match="9.9.9"):
        find_version_entry(SAMPLE_SKILL, "9.9.9")


def test_unwrap_resource_id_nested() -> None:
    payload = {"issue": {"id": "issue_123", "title": "Test"}}
    assert unwrap_resource_id(payload, "issue") == "issue_123"


def test_unwrap_resource_id_flat() -> None:
    payload = {"id": "issue_456"}
    assert unwrap_resource_id(payload, "issue") == "issue_456"


def test_unwrap_resource_id_missing() -> None:
    assert unwrap_resource_id({}, "issue") == "?"


def test_print_review_result_includes_sections(capsys) -> None:
    payload = {
        "review": {
            "skillName": "Demo Skill",
            "version": "0.1.0",
            "verdict": "published",
            "scores": {
                "qualityScore": 100,
                "securityScore": 100,
                "reliabilityScore": 100,
            },
            "findings": [],
            "virusTotal": {
                "status": "completed",
                "malicious": 0,
                "suspicious": 0,
                "totalEngines": 76,
                "sha256": "abc123",
            },
        },
        "evaluation": {
            "provider": "halucatch-adapter",
            "status": "partial",
            "score": 62,
            "tasksPassed": 2,
            "tasksTotal": 5,
            "findings": [
                {
                    "severity": "medium",
                    "message": "Missing structured steps",
                    "task": "规则与方法论",
                    "recommendation": "Add workflow steps.",
                }
            ],
        },
        "failedStages": [{"stage": "halucatch", "message": "adapter timeout"}],
    }
    print_review_result(payload)
    out = capsys.readouterr().out
    assert "Review: Demo Skill@0.1.0" in out
    assert "=== SkillSpector（Security）===" in out
    assert "=== VirusTotal（Security）===" in out
    assert "Detections: 0 malicious, 0 suspicious" in out
    assert "=== HaluCatch（Quality）===" in out
    assert "Missing structured steps" in out
    assert "=== Pipeline warnings ===" in out
    assert "halucatch: adapter timeout" in out


def test_print_review_partitions_skillspector_findings(capsys) -> None:
    print_review(
        {
            "skillName": "Demo Skill",
            "version": "0.1.0",
            "verdict": "needs_review",
            "scores": {"qualityScore": 80, "securityScore": 90, "reliabilityScore": 85},
            "findings": [
                {
                    "id": "rule-1",
                    "severity": "low",
                    "category": "quality",
                    "title": "SkillSpector note",
                    "message": "Minor issue",
                }
            ],
        }
    )
    out = capsys.readouterr().out
    assert "Review: Demo Skill@0.1.0" in out
    assert "=== SkillSpector（Security）===" in out
    assert "SkillSpector note" in out
    assert "=== HaluCatch" not in out


def test_print_report_version_includes_virustotal(capsys) -> None:
    body = {
        "slug": "demo-skill",
        "version": "1.0.0",
        "review": {
            "verdict": "approved",
            "scores": {
                "qualityScore": 90,
                "securityScore": 95,
                "reliabilityScore": 88,
            },
            "findings": [
                {
                    "id": "rule-1",
                    "severity": "low",
                    "category": "quality",
                    "title": "SkillSpector note",
                    "message": "Minor issue",
                },
                {
                    "id": "virustotal-malicious-deadbeef01234567",
                    "severity": "high",
                    "category": "security",
                    "title": "VirusTotal (malicious)",
                    "message": "VendorA classified this package as malicious.",
                },
            ],
            "virusTotal": {
                "provider": "virustotal",
                "status": "completed",
                "sha256": "deadbeef",
                "malicious": 1,
                "suspicious": 0,
                "harmless": 70,
                "undetected": 5,
                "totalEngines": 76,
                "analysisUrl": "https://www.virustotal.com/gui/file/deadbeef",
                "threatVerdict": "VERDICT_MALICIOUS",
                "engineResults": [
                    {
                        "engine": "VendorA",
                        "category": "malicious",
                        "result": "Trojan.Test",
                        "method": "blacklist",
                    }
                ],
            },
        },
        "evaluation": {
            "provider": "halucatch",
            "status": "passed",
            "score": 85,
            "tasksPassed": 4,
            "tasksTotal": 4,
            "findings": [],
        },
    }
    print_report_version(body, slug="demo-skill")
    out = capsys.readouterr().out
    assert "Report: demo-skill@1.0.0" in out
    assert out.index("Verdict: approved") < out.index("=== SkillSpector（Security）===")
    assert "=== SkillSpector（Security）===" in out
    assert "SkillSpector note" in out
    assert "VirusTotal (malicious)" not in out.split("=== VirusTotal（Security）===")[0]
    assert "=== VirusTotal（Security）===" in out
    assert "Detections: 1 malicious, 0 suspicious" in out
    assert "Engines scanned: 76" in out
    assert "SHA256: deadbeef" in out
    assert "Report URL: https://www.virustotal.com/gui/file/deadbeef" in out
    assert "VendorA: malicious" in out
    assert "VirusTotal (malicious)" in out
    assert "=== HaluCatch（Quality）===" in out


def test_print_virustotal_summary_failed(capsys) -> None:
    print_virustotal_summary({"status": "failed", "error": "timed out"})
    out = capsys.readouterr().out
    assert "Status: failed" in out
    assert "timed out" in out


def test_resolve_report_slug_from_cli_argument() -> None:
    from skillnav.output import _resolve_report_slug

    body = {"version": "1.0.1", "manifest": {"name": "Demo Skill"}}
    assert _resolve_report_slug(body, "demo-skill") == "demo-skill"


def test_print_report_version_virustotal_findings_none(capsys) -> None:
    body = {
        "version": "1.0.0",
        "review": {
            "verdict": "published",
            "scores": {},
            "findings": [],
            "virusTotal": {
                "provider": "virustotal",
                "status": "completed",
                "sha256": "abc123",
                "malicious": 0,
                "suspicious": 0,
                "harmless": 70,
                "undetected": 6,
                "totalEngines": 76,
            },
        },
    }
    print_report_version(body, slug="demo-skill")
    out = capsys.readouterr().out
    vt_section = out.split("=== VirusTotal（Security）===", 1)[1]
    assert "Findings: none" in vt_section
    assert "=== HaluCatch" not in vt_section or vt_section.index("Findings: none") < vt_section.find("=== HaluCatch")
