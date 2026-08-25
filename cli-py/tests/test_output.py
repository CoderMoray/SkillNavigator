"""Unit tests for human-readable output helpers."""

from __future__ import annotations

from skillnav.output import (
    print_report_version,
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
    assert "Verdict: published" in out
    assert "Visibility: public" in out
    assert "Versions:" in out
    assert "1.0.0  published=yes  verdict=published" in out
    assert "VT=0/0" in out
    assert "VT=0/1 (latest)" in out
    assert "Tip: skillnav report demo-skill --version 1.0.1" in out
    assert "Description:" not in out


def test_unwrap_resource_id_nested() -> None:
    payload = {"issue": {"id": "issue_123", "title": "Test"}}
    assert unwrap_resource_id(payload, "issue") == "issue_123"


def test_unwrap_resource_id_flat() -> None:
    payload = {"id": "issue_456"}
    assert unwrap_resource_id(payload, "issue") == "issue_456"


def test_unwrap_resource_id_missing() -> None:
    assert unwrap_resource_id({}, "issue") == "?"


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
