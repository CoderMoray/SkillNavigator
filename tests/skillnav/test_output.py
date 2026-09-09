"""Unit tests for human-readable output helpers."""

from __future__ import annotations

import pytest

from skillnav.output import (
    _resolve_inspection_aggregate_status,
    filter_skill_body_version,
    find_version_entry,
    print_report_version,
    print_inspection,
    print_inspection_result,
    print_skill_info,
    print_skill_status,
    print_virustotal_summary,
    unwrap_resource_id,
)

SAMPLE_HALUCATCH_TASK_RESULTS = [
    {"name": "HaluCatch · 地基与数据管线 (B)", "score": 80, "findings": []},
    {"name": "HaluCatch · 代码风险 (C)", "score": 55, "findings": []},
    {"name": "HaluCatch · 规则与方法论 (C)", "score": 60, "findings": []},
    {"name": "HaluCatch · 解读护栏 (B)", "score": 70, "findings": []},
    {"name": "HaluCatch · 复杂度与可维护性 (B)", "score": 65, "findings": []},
]

SAMPLE_SKILL = {
    "slug": "demo-skill",
    "name": "Demo Skill",
    "description": "A demo skill for testing.",
    "latestVersion": "1.0.1",
    "inspectionStatus": "completed",
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
            "inspection": {
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
            "inspection": {
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
    assert out.startswith("demo-skill@1.0.1 (latest)")
    assert "Inspection progress:" in out
    assert "SkillSpector: passed" in out
    assert "VirusTotal: 0/1" in out
    assert "HaluCatch: done" in out
    assert "Inspection status: completed" in out
    assert "Published: yes" in out
    assert "Visibility: public" in out
    assert "Verdict:" not in out
    assert "Content hash:" not in out
    assert "Versions:" not in out
    assert "Description:" not in out


def test_print_skill_status_inspecting(capsys) -> None:
    skill = {
        **SAMPLE_SKILL,
        "inspectionStatus": "inspecting",
        "published": False,
        "inspectionCompletedStages": ["halucatch"],
        "inspectionStartedAt": "2026-09-08T00:00:00.000Z",
        "versions": {
            "1.0.1": {
                "version": "1.0.1",
                "status": "needs-inspection",
                "published": False,
                "contentHash": "fedcba9876543210",
                "inspectionStatus": "inspecting",
                "inspectionCompletedStages": ["halucatch"],
                "inspectionStartedAt": "2026-09-08T00:00:00.000Z",
            }
        },
    }
    print_skill_status(skill)
    out = capsys.readouterr().out
    assert out.startswith("demo-skill@1.0.1 (latest)")
    assert "Inspection status: inspecting" in out
    assert "Inspection progress:" in out
    assert "HaluCatch: done" in out
    assert "SkillSpector: processing" in out
    assert "Published: yes" in out
    assert "Visibility: private" in out
    assert "Versions:" not in out


def test_print_skill_status_inspecting_until_inspection_ended(capsys) -> None:
    skill = {
        **SAMPLE_SKILL,
        "inspectionStatus": "inspecting",
        "published": False,
        "inspectionStartedAt": "2026-09-08T00:00:00.000Z",
        "versions": {
            "1.0.2": {
                "version": "1.0.2",
                "published": False,
                "contentHash": "abc123",
                "inspectionStatus": "inspecting",
                "inspectionStartedAt": "2026-09-08T00:00:00.000Z",
                "inspectionCompletedStages": ["skillspector"],
                "inspection": {
                    "verdict": "needs-inspection",
                    "findings": [],
                    "virusTotal": {"status": "completed", "malicious": 0, "suspicious": 0},
                },
            }
        },
        "latestVersion": "1.0.2",
    }
    print_skill_status(skill)
    out = capsys.readouterr().out
    assert "Inspection status: inspecting" in out
    assert "SkillSpector: passed" in out
    assert "VirusTotal: processing" in out
    assert "Inspection status: completed" not in out


def test_print_skill_status_pipeline_incomplete(capsys) -> None:
    """Stage execution failure = inspection did not complete → interrupted."""
    skill = {
        **SAMPLE_SKILL,
        "inspectionStatus": "interrupted",
        "published": False,
        "inspectionCompletedStages": ["skillspector", "virustotal"],
        "inspectionFailure": {
            "stages": ["virustotal"],
            "message": "VirusTotal scan timed out",
        },
        "versions": {
            "1.0.2": {
                "version": "1.0.2",
                "status": "needs-inspection",
                "published": False,
                "contentHash": "abc123",
                "inspectionStatus": "interrupted",
                "inspectionCompletedStages": ["skillspector", "virustotal"],
                "inspectionFailure": {
                    "stages": ["virustotal"],
                    "message": "VirusTotal scan timed out",
                },
            }
        },
        "latestVersion": "1.0.2",
    }
    print_skill_status(skill)
    out = capsys.readouterr().out
    assert out.startswith("demo-skill@1.0.2 (latest)")
    assert "Inspection status: interrupted" in out
    assert "VirusTotal: interrupted" in out
    assert "SkillSpector: passed" in out
    assert "HaluCatch: interrupted" in out


def test_print_skill_status_rejected(capsys) -> None:
    """Completed inspection with failing verdict → rejected."""
    skill = {
        **SAMPLE_SKILL,
        "inspectionStatus": "completed",
        "published": False,
        "latestVersion": "1.0.2",
        "versions": {
            "1.0.2": {
                "version": "1.0.2",
                "status": "rejected",
                "published": False,
                "contentHash": "abc123",
                "inspectionStatus": "completed",
                "inspectionCompletedStages": ["skillspector", "virustotal", "halucatch"],
                "inspection": {
                    "verdict": "rejected",
                    "findings": [
                        {
                            "id": "skillspector-test",
                            "severity": "critical",
                            "title": "Critical issue",
                            "category": "security",
                            "message": "bad",
                            "recommendation": "fix",
                        }
                    ],
                    "virusTotal": {"status": "completed", "malicious": 0, "suspicious": 0},
                },
                "evaluation": {"status": "passed", "score": 90},
            }
        },
    }
    print_skill_status(skill)
    out = capsys.readouterr().out
    assert "Inspection status: rejected" in out
    assert "SkillSpector: rejected" in out
    assert "HaluCatch: done" in out


def test_print_skill_status_failed_legacy_db_rejected(capsys) -> None:
    """Legacy DB value rejected without a completed verdict → interrupted."""
    skill = {
        **SAMPLE_SKILL,
        "inspectionStatus": "rejected",
        "published": False,
        "inspectionFailure": {
            "stages": ["virustotal"],
            "message": "VirusTotal scan timed out",
        },
        "versions": {
            "1.0.2": {
                "version": "1.0.2",
                "status": "rejected",
                "published": False,
                "contentHash": "abc123",
                "inspectionStatus": "rejected",
                "inspectionFailure": {
                    "stages": ["virustotal"],
                    "message": "VirusTotal scan timed out",
                },
            }
        },
        "latestVersion": "1.0.2",
    }
    print_skill_status(skill)
    out = capsys.readouterr().out
    assert "Inspection status: interrupted" in out
    assert "VirusTotal: interrupted" in out


def test_print_skill_status_interrupted(capsys) -> None:
    skill = {
        "slug": "demo-skill30",
        "name": "Demo Skill 30",
        "latestVersion": "1.0.0",
        "inspectionStatus": "interrupted",
        "published": False,
        "inspectionFailure": {
            "stages": [],
            "message": "审查任务因服务重启中断，请重试未完成或失败的审查环节。",
        },
        "inspectionStartedAt": "2026-09-08T06:39:56.795Z",
        "inspectionEndedAt": "2026-09-08T06:40:03.421Z",
        "versions": {
            "1.0.0": {
                "version": "1.0.0",
                "published": False,
                "contentHash": "428da015dcaf1234",
                "inspectionStatus": "interrupted",
                "inspectionFailure": {
                    "stages": [],
                    "message": "审查任务因服务重启中断，请重试未完成或失败的审查环节。",
                },
                "inspectionStartedAt": "2026-09-08T06:39:56.795Z",
                "inspectionEndedAt": "2026-09-08T06:40:03.421Z",
            }
        },
    }
    print_skill_status(skill)
    out = capsys.readouterr().out
    assert out.startswith("demo-skill30@1.0.0 (latest)")
    assert "Inspection status: interrupted" in out
    assert "SkillSpector: interrupted" in out
    assert "VirusTotal: interrupted" in out
    assert "HaluCatch: interrupted" in out
    assert "Published: yes" in out
    assert "Visibility: private" in out
    assert "Inspection started: 2026-09-08T06:39:56.795Z" in out
    assert "Inspection ended: 2026-09-08T06:40:03.421Z" in out


    skill = {
        **SAMPLE_SKILL,
        "inspectionStatus": "inspecting",
        "published": False,
        "inspectionCompletedStages": ["halucatch"],
        "latestVersion": "1.0.2",
        "versions": {
            "1.0.0": SAMPLE_SKILL["versions"]["1.0.0"],
            "1.0.1": {
                "version": "1.0.1",
                "status": "rejected",
                "published": False,
                "contentHash": "aaa111",
                "inspectionEndedAt": "2026-08-15T00:00:00.000Z",
                "inspection": {"verdict": "rejected"},
            },
            "1.0.2": {
                "version": "1.0.2",
                "status": "needs-inspection",
                "published": False,
                "contentHash": "bbb222",
                "inspectionStatus": "inspecting",
            },
        },
    }
    print_skill_status(skill)
    out = capsys.readouterr().out
    assert out.startswith("demo-skill@1.0.2 (latest)")
    assert "Inspection status: inspecting" in out
    assert "1.0.0  inspection=" not in out
    assert "1.0.1  inspection=" not in out
    assert "Versions:" not in out


def test_print_skill_status_single_version(capsys) -> None:
    print_skill_status(SAMPLE_SKILL, version="1.0.0")
    out = capsys.readouterr().out
    assert out.startswith("demo-skill@1.0.0")
    assert "Inspection status: completed" in out
    assert "SkillSpector: passed" in out
    assert "VirusTotal: 0/0" in out
    assert "Published: yes" in out
    assert "Verdict:" not in out
    assert "Content hash:" not in out
    assert "Versions:" not in out


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


def test_print_inspection_result_includes_sections(capsys) -> None:
    payload = {
        "inspection": {
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
            "taskResults": SAMPLE_HALUCATCH_TASK_RESULTS,
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
    print_inspection_result(payload)
    out = capsys.readouterr().out
    assert "Inspection: Demo Skill@0.1.0" in out
    assert "=== SkillSpector ===" in out
    assert "Inspection Type: Security" in out
    assert "=== VirusTotal ===" in out
    assert "Detections: 0 malicious, 0 suspicious" in out
    assert "=== HaluCatch ===" in out
    assert "Inspection Type: Quality" in out
    assert "Weighted Total Score: 62/100" in out
    assert "Detailed Score:" in out
    assert "- 规则与方法论: 60/100" in out
    assert "Status: partial" not in out
    assert "Evaluation: halucatch-adapter" not in out
    assert "Missing structured steps" in out
    assert "=== Pipeline warnings ===" in out
    assert "halucatch: adapter timeout" in out


def test_print_inspection_partitions_skillspector_findings(capsys) -> None:
    print_inspection(
        {
            "skillName": "Demo Skill",
            "version": "0.1.0",
            "verdict": "needs_inspection",
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
    assert "Inspection: Demo Skill@0.1.0" in out
    assert "=== SkillSpector ===" in out
    assert "Inspection Type: Security" in out
    assert "SkillSpector note" in out
    assert "=== HaluCatch" not in out


def test_print_report_version_includes_virustotal(capsys) -> None:
    body = {
        "slug": "demo-skill",
        "version": "1.0.0",
        "inspection": {
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
                    "evidence": (
                        "SHA-256: deadbeef\n"
                        "Total engines: 76\n"
                        "Category: malicious\n"
                        "Result:\n"
                        "\tVendorA: Trojan.Test\n"
                        "\tVendorB: EICAR-Test-File\n"
                        "Report: https://www.virustotal.com/gui/file/deadbeef"
                    ),
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
                    },
                    {
                        "engine": "VendorB",
                        "category": "malicious",
                        "result": "EICAR-Test-File",
                        "method": "blacklist",
                    },
                ],
            },
        },
        "evaluation": {
            "provider": "halucatch-adapter",
            "status": "passed",
            "score": 85,
            "tasksPassed": 4,
            "tasksTotal": 5,
            "taskResults": SAMPLE_HALUCATCH_TASK_RESULTS,
            "findings": [],
        },
    }
    print_report_version(body, slug="demo-skill")
    out = capsys.readouterr().out
    assert "Report: demo-skill@1.0.0" in out
    assert out.index("Inspection status: rejected") < out.index("=== SkillSpector ===")
    assert "Verdict:" not in out
    assert "=== SkillSpector ===" in out
    assert "Inspection Type: Security" in out
    assert "SkillSpector note" in out
    assert "VirusTotal (malicious)" not in out.split("=== VirusTotal ===")[0]
    assert "=== VirusTotal ===" in out
    assert "Detections: 1 malicious, 0 suspicious" in out
    assert "Security Vendors Scanned: 76" in out
    assert out.index("Inspection Type: Security") < out.index("Security Vendors Scanned: 76")
    assert out.index("Security Vendors Scanned: 76") < out.index("Status: completed")
    assert "SHA256: deadbeef" in out
    assert "Report URL: https://www.virustotal.com/gui/file/deadbeef" in out
    assert "- VirusTotal (malicious)" in out
    assert "Result:" in out
    assert "\tVendorA: Trojan.Test" in out
    assert "\tVendorB: EICAR-Test-File" in out
    assert "Flagged engines:" not in out
    assert "=== HaluCatch ===" in out
    assert "Inspection Type: Quality" in out
    assert "Weighted Total Score: 85/100" in out
    assert "Detailed Score:" in out
    assert "- 地基与数据管线: 80/100" in out
    assert "=== Prompt ===" in out
    assert out.index("=== HaluCatch ===") < out.index("=== Prompt ===")
    assert "demo-skill@1.0.0" in out
    assert "SkillSpector（安全）" in out
    assert "VirusTotal（安全）" in out
    assert "HaluCatch（质量）" in out
    assert "先核实 finding 真实性" in out


def test_report_inspection_status_matches_status_command(capsys) -> None:
    skill = {
        **SAMPLE_SKILL,
        "inspectionStatus": "completed",
        "latestVersion": "1.0.1",
        "versions": {
            **SAMPLE_SKILL["versions"],
            "1.0.1": {
                **SAMPLE_SKILL["versions"]["1.0.1"],
                "inspectionStatus": "completed",
                "inspectionCompletedStages": ["skillspector", "virustotal", "halucatch"],
                "inspection": {
                    "verdict": "published",
                    "findings": [
                        {
                            "id": "virustotal-malicious",
                            "severity": "high",
                            "category": "security",
                            "title": "VirusTotal (malicious)",
                            "message": "Flagged",
                        }
                    ],
                    "virusTotal": {
                        "status": "completed",
                        "malicious": 1,
                        "suspicious": 0,
                    },
                },
                "evaluation": {
                    "provider": "halucatch-adapter",
                    "status": "passed",
                    "score": 90,
                    "taskResults": SAMPLE_HALUCATCH_TASK_RESULTS,
                    "findings": [],
                },
            },
        },
    }
    version_entry = skill["versions"]["1.0.1"]
    expected = _resolve_inspection_aggregate_status(version_entry, skill)

    print_skill_status(skill, version="1.0.1")
    status_out = capsys.readouterr().out
    assert f"Inspection status: {expected}" in status_out

    print_report_version({**version_entry, "slug": "demo-skill", "version": "1.0.1"}, slug="demo-skill")
    report_out = capsys.readouterr().out
    assert f"Inspection status: {expected}" in report_out


def test_print_inspection_result_omits_prompt(capsys) -> None:
    print_inspection_result(
        {
            "inspection": {
                "skillName": "Demo Skill",
                "version": "0.1.0",
                "verdict": "published",
                "findings": [],
            },
            "evaluation": {
                "provider": "halucatch-adapter",
                "score": 80,
                "taskResults": SAMPLE_HALUCATCH_TASK_RESULTS,
                "findings": [],
            },
        }
    )
    out = capsys.readouterr().out
    assert "=== Prompt ===" not in out


def test_print_virustotal_findings_shows_titles_and_results(capsys) -> None:
    from skillnav.output import _print_virustotal_findings

    _print_virustotal_findings(
        [
            {
                "id": "virustotal-malicious-deadbeef01234567",
                "title": "VirusTotal (malicious)",
                "evidence": "Result:\n\tKaspersky: EICAR-Test-File\n",
            },
            {
                "id": "virustotal-suspicious-deadbeef01234567",
                "title": "VirusTotal (suspicious)",
                "evidence": "Result:\n\tElastic: Malicious (score: 99)\n",
            },
        ],
        None,
    )
    out = capsys.readouterr().out
    assert "- VirusTotal (malicious)" in out
    assert "- VirusTotal (suspicious)" in out
    assert "\tKaspersky: EICAR-Test-File" in out
    assert "\tElastic: Malicious (score: 99)" in out


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
        "inspection": {
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
    vt_section = out.split("=== VirusTotal ===", 1)[1]
    assert "Findings: none" in vt_section
    assert "=== HaluCatch" not in vt_section or vt_section.index("Findings: none") < vt_section.find("=== HaluCatch")
