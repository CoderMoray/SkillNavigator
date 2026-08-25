"""Unit tests for human-readable output helpers."""

from __future__ import annotations

from skillnav.output import (
    print_report_version,
    print_skill_summary,
    print_virustotal_summary,
    unwrap_resource_id,
)


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
