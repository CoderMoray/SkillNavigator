"""Human-readable and JSON output helpers."""

from __future__ import annotations

import json
import sys
from typing import Any


def emit_json(data: Any) -> None:
    print(json.dumps(data, indent=2, ensure_ascii=False))


def emit_error(
    message: str,
    *,
    json_output: bool,
    detail: str | None = None,
    next_steps: tuple[str, ...] | list[str] | None = None,
) -> None:
    steps = list(next_steps or [])
    if json_output:
        payload: dict[str, Any] = {"error": message}
        if detail:
            payload["detail"] = detail
        if steps:
            payload["nextSteps"] = steps
        print(json.dumps(payload, ensure_ascii=False), file=sys.stderr)
        return

    print(f"✗ skillnav: {message}", file=sys.stderr)
    if detail:
        print(f"\nWhat happened:\n  {detail}", file=sys.stderr)
    if steps:
        print("\nNext steps:", file=sys.stderr)
        for index, step in enumerate(steps, start=1):
            print(f"  {index}. {step}", file=sys.stderr)


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


def _print_review_sections(review: dict[str, Any]) -> None:
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


def _print_failed_stages(failed_stages: Any) -> None:
    if not failed_stages:
        return
    print("\n=== Pipeline warnings ===")
    for failure in failed_stages:
        if isinstance(failure, dict):
            stage = failure.get("stage", "?")
            message = failure.get("message", "?")
            print(f"- {stage}: {message}")
        else:
            print(f"- {failure}")


def print_review(report: dict[str, Any]) -> None:
    name = report.get("skillName") or report.get("skill_name") or "?"
    version = report.get("version", "?")
    print(f"Review: {name}@{version}")
    _print_review_sections(report)


def print_review_result(payload: dict[str, Any]) -> None:
    """Print a /reviews/run (or publish) response with partitioned sections."""
    review = payload.get("review")
    evaluation = payload.get("evaluation")
    if review:
        name = review.get("skillName") or review.get("skill_name") or "?"
        version = review.get("version", "?")
        print(f"Review: {name}@{version}")
        _print_review_sections(review)
    elif not evaluation:
        print("No review or evaluation data.")
        return
    if evaluation:
        print("\n=== HaluCatch（Quality）===")
        print_evaluation(evaluation)
    _print_failed_stages(payload.get("failedStages"))


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


def _resolve_latest_verdict(body: dict[str, Any]) -> str:
    latest = body.get("latestVersion")
    versions = body.get("versions")
    if latest and isinstance(versions, dict):
        entry = versions.get(latest)
        if isinstance(entry, dict):
            review = entry.get("review") or {}
            if review.get("verdict"):
                return str(review["verdict"])
            if entry.get("status"):
                return str(entry["status"])
    if body.get("status"):
        return str(body["status"])
    return "?"


def _format_visibility(published: bool | None) -> str:
    if published is False:
        return "unpublished"
    return "public"


def _count_open_issues(issues: list[dict[str, Any]]) -> int:
    return sum(1 for issue in issues if issue.get("status") != "closed")


def _resolve_owner_name(contributors: list[dict[str, Any]]) -> str | None:
    for contributor in contributors:
        if contributor.get("role") == "owner":
            return str(contributor.get("username") or contributor.get("name") or "")
    if contributors:
        first = contributors[0]
        return str(first.get("username") or first.get("name") or "")
    return None


def _latest_version_entry(body: dict[str, Any]) -> dict[str, Any]:
    latest = body.get("latestVersion")
    versions = body.get("versions")
    if not latest or not isinstance(versions, dict):
        return {}
    entry = versions.get(latest)
    return entry if isinstance(entry, dict) else {}


def _resolve_categories(body: dict[str, Any]) -> list[str]:
    manifest = _latest_version_entry(body).get("manifest")
    if isinstance(manifest, dict):
        categories = manifest.get("categories")
        if isinstance(categories, list):
            return [str(category) for category in categories if category]
    return []


def _resolve_latest_downloads(body: dict[str, Any]) -> int | None:
    downloads = _latest_version_entry(body).get("downloads")
    return int(downloads) if downloads is not None else None


def _hash_prefix(value: Any) -> str:
    if not value:
        return "-"
    text = str(value)
    return f"{text[:12]}..." if len(text) > 12 else text


_REVIEW_STAGE_ORDER = ("halucatch", "skillspector", "virustotal")

_REVIEW_STAGE_LABELS = {
    "halucatch": "HaluCatch",
    "skillspector": "SkillSpector",
    "virustotal": "VirusTotal",
}

_SKILL_REVIEW_STATUS_LABELS = {
    "reviewing": "in review",
    "completed": "review completed",
    "failed": "review failed",
}


def _skill_review_status_label(status: str | None) -> str:
    if not status:
        return _SKILL_REVIEW_STATUS_LABELS["completed"]
    return _SKILL_REVIEW_STATUS_LABELS.get(status, status)


def _format_review_stage_progress(
    completed_stages: list[str] | None,
    failed_stages: list[str] | None,
) -> str:
    completed = set(completed_stages or [])
    failed = set(failed_stages or [])
    parts: list[str] = []
    for stage in _REVIEW_STAGE_ORDER:
        label = _REVIEW_STAGE_LABELS.get(stage, stage)
        if stage in failed:
            parts.append(f"{label}: failed")
        elif stage in completed:
            parts.append(f"{label}: done")
        else:
            parts.append(f"{label}: pending")
    return " · ".join(parts)


def _review_failure_summary(failure: dict[str, Any] | None) -> str:
    if not failure:
        return ""
    stages = failure.get("stages") or []
    message = str(failure.get("message") or "").strip()
    if stages:
        labels = [_REVIEW_STAGE_LABELS.get(str(stage), str(stage)) for stage in stages]
        stage_text = ", ".join(labels)
        return f"{stage_text}: {message}" if message else stage_text
    return message


def _resolve_version_review_info(
    skill: dict[str, Any],
    version_id: str,
    entry: dict[str, Any],
) -> dict[str, Any]:
    """Derive per-version review status, verdict, and optional stage progress."""
    latest = skill.get("latestVersion")
    skill_review_status = str(skill.get("reviewStatus") or "completed")
    is_latest = version_id == latest

    if is_latest and skill_review_status in {"reviewing", "failed"}:
        failure = skill.get("reviewFailure") if skill_review_status == "failed" else None
        failed_stages = (failure or {}).get("stages") or []
        return {
            "review_status": _skill_review_status_label(skill_review_status),
            "verdict": "pending",
            "completed_stages": skill.get("reviewCompletedStages") or entry.get("reviewCompletedStages") or [],
            "failed_stages": failed_stages,
            "failure_summary": _review_failure_summary(failure) if isinstance(failure, dict) else "",
            "show_progress": True,
        }

    review = entry.get("review") or {}
    verdict = str(review.get("verdict") or entry.get("status") or "?")
    has_review_record = bool(review.get("verdict") or review.get("findings") is not None)
    review_finished = bool(
        entry.get("reviewEndedAt")
        or has_review_record
        or entry.get("status") in {"published", "rejected", "needs-review"}
    )

    if review_finished:
        completed = entry.get("reviewCompletedStages") or []
        if not completed and has_review_record:
            completed = list(_REVIEW_STAGE_ORDER)
        return {
            "review_status": _skill_review_status_label("completed"),
            "verdict": verdict,
            "completed_stages": completed,
            "failed_stages": [],
            "failure_summary": "",
            "show_progress": False,
        }

    completed = entry.get("reviewCompletedStages") or []
    if completed:
        return {
            "review_status": _skill_review_status_label("reviewing"),
            "verdict": "pending",
            "completed_stages": completed,
            "failed_stages": [],
            "failure_summary": "",
            "show_progress": True,
        }

    return {
        "review_status": "review pending",
        "verdict": "pending",
        "completed_stages": [],
        "failed_stages": [],
        "failure_summary": "",
        "show_progress": False,
    }


def _print_version_status_row(
    skill: dict[str, Any],
    version_id: str,
    entry: dict[str, Any],
) -> None:
    review_info = _resolve_version_review_info(skill, version_id, entry)
    review = entry.get("review") or {}
    published = "yes" if entry.get("published") is not False else "no"
    hash_prefix = _hash_prefix(entry.get("contentHash"))
    vt = _virustotal_one_liner(review)
    latest_marker = " (latest)" if version_id == skill.get("latestVersion") else ""
    print(
        f"  {version_id}{latest_marker}  review={review_info['review_status']}  "
        f"verdict={review_info['verdict']}  published={published}  "
        f"hash={hash_prefix}  VT={vt}"
    )
    if review_info["show_progress"]:
        print(
            "    progress: "
            f"{_format_review_stage_progress(review_info['completed_stages'], review_info['failed_stages'])}"
        )
    failure_summary = review_info.get("failure_summary") or ""
    if failure_summary:
        print(f"    failure: {failure_summary}")


def _virustotal_one_liner(review: dict[str, Any]) -> str:
    summary = review.get("virusTotal")
    if not isinstance(summary, dict):
        return "-"
    status = summary.get("status")
    if status == "failed":
        return "failed"
    if status == "not_found":
        return "not_found"
    malicious = int(summary.get("malicious") or 0)
    suspicious = int(summary.get("suspicious") or 0)
    return f"{malicious}/{suspicious}"


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


def print_skill_info(body: dict[str, Any]) -> None:
    """Human-readable skill metadata (catalog card)."""
    print(f"{body.get('name', '?')} ({body.get('slug', '?')})")
    description = body.get("description")
    if description:
        print(f"Description: {description}")
    categories = _resolve_categories(body)
    if categories:
        print(f"Categories: {', '.join(categories)}")
    if body.get("latestVersion"):
        print(f"Latest: {body['latestVersion']}")
    owner = _resolve_owner_name(body.get("contributors") or [])
    if owner:
        print(f"Owner: {owner}")
    contributors = body.get("contributors") or []
    if contributors:
        names = [
            str(contributor.get("name") or contributor.get("username") or "?")
            for contributor in contributors
        ]
        print(f"Contributors: {', '.join(names)} ({len(contributors)})")
    rating_count = int(body.get("ratingCount") or 0)
    average_rating = body.get("averageRating")
    if rating_count:
        rating_text = f"{float(average_rating):.1f}" if average_rating is not None else "?"
        print(f"Rating: {rating_text} ({rating_count})")
    else:
        print("Rating: none")
    print(f"Open issues: {_count_open_issues(body.get('issues') or [])}")
    downloads = _resolve_latest_downloads(body)
    if downloads is not None:
        print(f"Downloads (latest): {downloads}")
    print(f"Visibility: {_format_visibility(body.get('published'))}")
    if body.get("createdAt"):
        print(f"Created: {body['createdAt']}")
    if body.get("updatedAt"):
        print(f"Updated: {body['updatedAt']}")
    if body.get("bookmarkedByViewer") is True:
        print("Bookmarked: yes")


def print_skill_status(body: dict[str, Any]) -> None:
    """Human-readable publish and review status summary."""
    slug = body.get("slug", "?")
    latest = body.get("latestVersion", "?")
    review_status = str(body.get("reviewStatus") or "completed")
    print(f"{slug}@{latest}")
    print(f"Review status: {_skill_review_status_label(review_status)}")

    completed_stages = body.get("reviewCompletedStages") or []
    failed_stage_ids = (body.get("reviewFailure") or {}).get("stages") or []
    if review_status in {"reviewing", "failed"}:
        print(f"Review progress: {_format_review_stage_progress(completed_stages, failed_stage_ids)}")

    failure = body.get("reviewFailure")
    if review_status == "failed" and isinstance(failure, dict):
        summary = _review_failure_summary(failure)
        if summary:
            print(f"Review failure: {summary}")

    if review_status == "completed":
        print(f"Verdict: {_resolve_latest_verdict(body)}")
    else:
        print("Verdict: pending")

    print(f"Visibility: {_format_visibility(body.get('published'))}")
    version_rows = _iter_version_rows(body)
    if version_rows:
        print("Versions:")
        for vid, entry in version_rows:
            _print_version_status_row(body, vid, entry)
    if review_status == "failed":
        print(f"\nTip: skillnav retry-publish {slug} to re-run review on the stored package")
    elif latest and latest != "?":
        print(f"\nTip: skillnav report {slug} --version {latest} for full review")


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
        _print_review_sections(review)
    if evaluation:
        print("\n=== HaluCatch（Quality）===")
        print_evaluation(evaluation)
    if not review and not evaluation:
        print("No review or evaluation data for this version.")
