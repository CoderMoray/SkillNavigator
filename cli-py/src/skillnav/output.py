"""Human-readable and JSON output helpers."""

from __future__ import annotations

import json
import sys
from typing import Any


def emit_json(data: Any) -> None:
    print(json.dumps(data, indent=2, ensure_ascii=False))


def emit_error(message: str, *, json_output: bool) -> None:
    if json_output:
        print(json.dumps({"error": message}, ensure_ascii=False), file=sys.stderr)
    else:
        print(f"skillnav: {message}", file=sys.stderr)


def _print_findings_list(findings: list[dict[str, Any]]) -> None:
    if not findings:
        print("Findings: none")
        return
    print("Findings:")
    for finding in findings:
        path = finding.get("path")
        location = f" ({path})" if path else ""
        severity = finding.get("severity", "?")
        category = finding.get("category", "?")
        title = finding.get("title", "?")
        print(f"- [{severity}/{category}] {title}{location}")
        if finding.get("message"):
            print(f"  {finding['message']}")
        if finding.get("recommendation"):
            print(f"  Recommendation: {finding['recommendation']}")


def _is_virustotal_finding(finding: dict[str, Any]) -> bool:
    finding_id = str(finding.get("id") or "")
    if finding_id.startswith("virustotal-"):
        return True
    title = str(finding.get("title") or "")
    return title.startswith("VirusTotal")


def _partition_review_findings(
    findings: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    skillspector: list[dict[str, Any]] = []
    virustotal: list[dict[str, Any]] = []
    for finding in findings:
        if _is_virustotal_finding(finding):
            virustotal.append(finding)
        else:
            skillspector.append(finding)
    return skillspector, virustotal


def _resolve_virustotal_engine_total(summary: dict[str, Any]) -> int:
    total = int(summary.get("totalEngines") or 0)
    if total > 0:
        return total
    return sum(int(summary.get(key) or 0) for key in ("malicious", "suspicious", "harmless", "undetected"))


def print_virustotal_summary(summary: dict[str, Any]) -> None:
    status = summary.get("status", "?")
    print(f"Status: {status}")

    if status == "failed":
        if summary.get("error"):
            print(f"Error: {summary['error']}")
        return

    if status == "not_found":
        print("No historical VirusTotal report for this archive hash.")
        return

    malicious = int(summary.get("malicious") or 0)
    suspicious = int(summary.get("suspicious") or 0)
    total_engines = _resolve_virustotal_engine_total(summary)
    print(f"Detections: {malicious} malicious, {suspicious} suspicious")
    if total_engines:
        print(f"Engines scanned: {total_engines}")

    threat_verdict = summary.get("threatVerdict")
    if threat_verdict:
        print(f"Threat verdict: {threat_verdict}")

    sha256 = summary.get("sha256")
    if sha256:
        print(f"SHA256: {sha256}")

    analysis_url = summary.get("analysisUrl")
    if analysis_url:
        print(f"Report URL: {analysis_url}")

    engine_results = summary.get("engineResults") or []
    flagged = [
        engine
        for engine in engine_results
        if engine.get("category") in {"malicious", "suspicious"}
    ]
    if flagged:
        print("Flagged engines:")
        for engine in flagged[:20]:
            name = engine.get("engine", "?")
            category = engine.get("category", "?")
            result = engine.get("result", "?")
            method = engine.get("method")
            suffix = f", method={method}" if method else ""
            print(f"  - {name}: {category} ({result}{suffix})")
        if len(flagged) > 20:
            print(f"  ... and {len(flagged) - 20} more")


def print_review(report: dict[str, Any]) -> None:
    name = report.get("skillName") or report.get("skill_name") or "?"
    version = report.get("version", "?")
    print(f"Review: {name}@{version}")
    print(f"Verdict: {report.get('verdict', '?')}")
    scores = report.get("scores") or {}
    print(
        "Scores: "
        f"quality={scores.get('qualityScore', '?')}, "
        f"security={scores.get('securityScore', '?')}, "
        f"reliability={scores.get('reliabilityScore', '?')}"
    )
    _print_findings_list(report.get("findings") or [])


def print_evaluation(report: dict[str, Any]) -> None:
    print(f"Evaluation: {report.get('provider', '?')}")
    print(
        f"Status: {report.get('status', '?')}, "
        f"score={report.get('score', '?')}, "
        f"tasks={report.get('tasksPassed', '?')}/{report.get('tasksTotal', '?')}"
    )
    findings = report.get("findings") or []
    if not findings:
        print("Evaluation findings: none")
        return
    print("Evaluation findings:")
    for finding in findings:
        task = finding.get("task")
        task_suffix = f" ({task})" if task else ""
        severity = finding.get("severity", "?")
        message = finding.get("message", "?")
        print(f"- [{severity}] {message}{task_suffix}")
        if finding.get("recommendation"):
            print(f"  Recommendation: {finding['recommendation']}")


def _resolve_skill_status(body: dict[str, Any]) -> str:
    if body.get("status"):
        return str(body["status"])
    latest = body.get("latestVersion")
    versions = body.get("versions")
    if latest and isinstance(versions, dict):
        latest_entry = versions.get(latest)
        if isinstance(latest_entry, dict) and latest_entry.get("status"):
            return str(latest_entry["status"])
    return "?"


def _iter_version_rows(body: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    versions = body.get("versions")
    if isinstance(versions, dict):
        rows: list[tuple[str, dict[str, Any]]] = []
        for vid, entry in versions.items():
            if isinstance(entry, dict):
                rows.append((str(entry.get("version", vid)), entry))
            else:
                rows.append((str(vid), {}))
        rows.sort(key=lambda row: row[0])
        return rows
    if isinstance(versions, list):
        rows = []
        for entry in versions:
            if isinstance(entry, dict):
                rows.append((str(entry.get("version", "?")), entry))
        return rows
    return []


def unwrap_resource_id(payload: dict[str, Any], resource_key: str) -> str:
    """Read id from {resource: {id}} API wrappers or a flat {id} body."""
    nested = payload.get(resource_key)
    if isinstance(nested, dict) and nested.get("id"):
        return str(nested["id"])
    if payload.get("id"):
        return str(payload["id"])
    return "?"


def print_skill_summary(body: dict[str, Any]) -> None:
    print(f"{body.get('name', '?')} ({body.get('slug', '?')})")
    print(f"Status: {_resolve_skill_status(body)}")
    if body.get("latestVersion"):
        print(f"Latest: {body['latestVersion']}")
    version_rows = _iter_version_rows(body)
    if version_rows:
        print("Versions:")
        for vid, entry in version_rows:
            vstatus = entry.get("status", "?")
            verdict = (entry.get("review") or {}).get("verdict", "?")
            print(f"  - {vid} [{vstatus}] review={verdict}")


def print_search_results(body: dict[str, Any]) -> None:
    items = body.get("items") or []
    if not items:
        print("No skills found.")
        return
    for item in items:
        slug = item.get("slug", "?")
        name = item.get("name", "?")
        status = item.get("status", "?")
        print(f"- {slug}: {name} [{status}]")


def print_leaderboard(body: dict[str, Any]) -> None:
    items = body.get("items") or []
    if not items:
        print("Leaderboard is empty.")
        return
    for index, item in enumerate(items, start=1):
        slug = item.get("slug", "?")
        name = item.get("name", "?")
        score = item.get("score", item.get("downloads", "?"))
        print(f"{index}. {slug}: {name} ({score})")


def _resolve_report_slug(body: dict[str, Any], slug: str | None = None) -> str:
    if slug:
        return slug
    if body.get("slug"):
        return str(body["slug"])
    manifest = body.get("manifest")
    if isinstance(manifest, dict):
        if manifest.get("slug"):
            return str(manifest["slug"])
        if manifest.get("name"):
            return str(manifest["name"])
    return "?"


def print_report_version(body: dict[str, Any], *, slug: str | None = None) -> None:
    review = body.get("review")
    evaluation = body.get("evaluation")
    resolved_slug = _resolve_report_slug(body, slug)
    version = body.get("version", "?")
    print(f"Report: {resolved_slug}@{version}")
    if review:
        print(f"Verdict: {review.get('verdict', '?')}")
        skillspector_findings, virustotal_findings = _partition_review_findings(
            review.get("findings") or []
        )
        print("\n=== SkillSpector（Security）===")
        scores = review.get("scores") or {}
        print(
            "Scores: "
            f"quality={scores.get('qualityScore', '?')}, "
            f"security={scores.get('securityScore', '?')}, "
            f"reliability={scores.get('reliabilityScore', '?')}"
        )
        _print_findings_list(skillspector_findings)

        virustotal_summary = review.get("virusTotal")
        if virustotal_summary or virustotal_findings:
            print("\n=== VirusTotal（Security）===")
            if isinstance(virustotal_summary, dict):
                print_virustotal_summary(virustotal_summary)
            _print_findings_list(virustotal_findings)
    if evaluation:
        print("\n=== HaluCatch（Quality）===")
        print_evaluation(evaluation)
    if not review and not evaluation:
        print("No review or evaluation data for this version.")
