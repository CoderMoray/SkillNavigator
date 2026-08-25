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
    findings = report.get("findings") or []
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


def print_report_version(body: dict[str, Any]) -> None:
    review = body.get("review")
    evaluation = body.get("evaluation")
    print(f"Report: {body.get('slug', '?')}@{body.get('version', '?')}")
    if review:
        print("\n=== Security (SkillSpector) ===")
        print_review(review)
    if evaluation:
        print("\n=== Quality (HaluCatch) ===")
        print_evaluation(evaluation)
    if not review and not evaluation:
        print("No review or evaluation data for this version.")
