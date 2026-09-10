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


def _partition_inspection_findings(
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


def _virustotal_finding_category(finding: dict[str, Any]) -> str | None:
    finding_id = str(finding.get("id") or "").lower()
    if "malicious" in finding_id:
        return "malicious"
    if "suspicious" in finding_id:
        return "suspicious"
    title = str(finding.get("title") or "").lower()
    if "malicious" in title:
        return "malicious"
    if "suspicious" in title:
        return "suspicious"
    return None


def _format_virustotal_result_lines(
    engine_results: list[dict[str, Any]],
    category: str | None = None,
) -> list[str]:
    flagged = [
        engine
        for engine in engine_results
        if engine.get("category") in {"malicious", "suspicious"}
        and (category is None or engine.get("category") == category)
    ]
    flagged.sort(
        key=lambda engine: (
            0 if engine.get("category") == "malicious" else 1,
            str(engine.get("engine") or ""),
        )
    )
    return [f"\t{engine.get('engine', '?')}: {engine.get('result', '?')}" for engine in flagged]


def _extract_virustotal_result_from_evidence(evidence: str) -> str | None:
    marker = "Result:\n"
    if marker not in evidence:
        return None
    block = evidence.split(marker, 1)[1]
    lines: list[str] = []
    for line in block.splitlines():
        if line.startswith(("Method:", "Engine update:", "Report:", "SHA-256:", "Total engines:", "Category:", "Threat verdict:")):
            break
        if line.strip():
            lines.append(line)
    return "\n".join(lines).rstrip() if lines else None


def _print_virustotal_findings(
    findings: list[dict[str, Any]],
    summary: dict[str, Any] | None,
) -> None:
    engine_results = summary.get("engineResults") or [] if isinstance(summary, dict) else []

    if not findings:
        result_lines = _format_virustotal_result_lines(engine_results)
        if not result_lines:
            print("Findings: none")
            return
        print("Findings:")
        print("Result:")
        for line in result_lines:
            print(line)
        return

    print("Findings:")
    for finding in findings:
        title = finding.get("title", "?")
        print(f"- {title}")

        evidence = finding.get("evidence")
        result_block = (
            _extract_virustotal_result_from_evidence(str(evidence))
            if isinstance(evidence, str) and evidence.strip()
            else None
        )
        if not result_block:
            category = _virustotal_finding_category(finding)
            result_lines = _format_virustotal_result_lines(engine_results, category)
            result_block = "\n".join(result_lines) if result_lines else None

        if result_block:
            print("Result:")
            print(result_block)
        elif finding.get("message"):
            print(f"  {finding['message']}")

        if finding.get("recommendation"):
            print(f"  Recommendation: {finding['recommendation']}")


def print_virustotal_summary(summary: dict[str, Any]) -> None:
    status = summary.get("status", "?")
    total_engines = _resolve_virustotal_engine_total(summary)
    if status not in {"failed", "not_found", "?"} and total_engines:
        print(f"Security Vendors Scanned: {total_engines}")

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
    print(f"Detections: {malicious} malicious, {suspicious} suspicious")

    threat_verdict = summary.get("threatVerdict")
    if threat_verdict:
        print(f"Threat verdict: {threat_verdict}")

    sha256 = summary.get("sha256")
    if sha256:
        print(f"SHA256: {sha256}")

    analysis_url = summary.get("analysisUrl")
    if analysis_url:
        print(f"Report URL: {analysis_url}")


def _print_inspection_section_header(name: str, inspection_type: str) -> None:
    print(f"\n=== {name} ===")
    print(f"Inspection Type: {inspection_type}")


def _print_inspection_sections(
    review: dict[str, Any],
    *,
    status_label: str = "Verdict",
    status_value: str | None = None,
) -> None:
    print(f"{status_label}: {status_value if status_value is not None else review.get('verdict', '?')}")
    skillspector_findings, virustotal_findings = _partition_inspection_findings(
        review.get("findings") or []
    )
    _print_inspection_section_header("SkillSpector", "Security")
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
        _print_inspection_section_header("VirusTotal", "Security")
        if isinstance(virustotal_summary, dict):
            print_virustotal_summary(virustotal_summary)
        _print_virustotal_findings(virustotal_findings, virustotal_summary)


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


def print_inspection(report: dict[str, Any]) -> None:
    name = report.get("skillName") or report.get("skill_name") or "?"
    version = report.get("version", "?")
    print(f"Inspection: {name}@{version}")
    _print_inspection_sections(report)


def _get_inspection_record(payload: dict[str, Any]) -> dict[str, Any]:
    record = payload.get("inspection")
    if isinstance(record, dict):
        return record
    legacy = payload.get("review")
    return legacy if isinstance(legacy, dict) else {}


def print_inspection_result(payload: dict[str, Any]) -> None:
    """Print a /inspections/run (or publish) response with partitioned sections."""
    inspection = _get_inspection_record(payload)
    evaluation = payload.get("evaluation")
    if inspection:
        name = inspection.get("skillName") or inspection.get("skill_name") or "?"
        version = inspection.get("version", "?")
        print(f"Inspection: {name}@{version}")
        _print_inspection_sections(inspection)
    elif not evaluation:
        print("No inspection or evaluation data.")
        return
    if evaluation:
        _print_inspection_section_header("HaluCatch", "Quality")
        print_evaluation(evaluation)
    _print_failed_stages(payload.get("failedStages"))


_HALUCATCH_DIMENSION_LABELS = (
    "地基与数据管线",
    "代码风险",
    "规则与方法论",
    "解读护栏",
    "复杂度与可维护性",
)


def _extract_halucatch_task_label(task_name: str) -> str | None:
    prefix = "HaluCatch · "
    if not task_name.startswith(prefix):
        return None
    label = task_name[len(prefix) :]
    if " (" in label:
        label = label.split(" (", 1)[0]
    return label


def _format_score_out_of_100(score: Any) -> str:
    if score is None or score == "?":
        return "?"
    try:
        return f"{int(score)}/100"
    except (TypeError, ValueError):
        return "?"


def _halucatch_dimension_scores(report: dict[str, Any]) -> list[tuple[str, int]]:
    scores_by_label: dict[str, int] = {}
    for task in report.get("taskResults") or []:
        if not isinstance(task, dict):
            continue
        label = _extract_halucatch_task_label(str(task.get("name") or ""))
        if label:
            scores_by_label[label] = int(task.get("score") or 0)
    return [(label, scores_by_label.get(label, 0)) for label in _HALUCATCH_DIMENSION_LABELS]


def print_evaluation(report: dict[str, Any]) -> None:
    print(f"Weighted Total Score: {_format_score_out_of_100(report.get('score'))}")
    print("Detailed Score:")
    for label, score in _halucatch_dimension_scores(report):
        print(f"- {label}: {_format_score_out_of_100(score)}")
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
            inspection = _get_inspection_record(entry)
            if inspection.get("verdict"):
                return str(inspection["verdict"])
            if entry.get("status"):
                return str(entry["status"])
    if body.get("status"):
        return str(body["status"])
    return "?"


def _format_visibility(published: bool | None) -> str:
    if published is False:
        return "private"
    return "public"


def _format_published_uploaded(entry: dict[str, Any]) -> str:
    if entry.get("contentHash") or entry.get("uploadedAt"):
        return "yes"
    return "no"


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


_INSPECTION_STAGE_ORDER = ("skillspector", "virustotal", "halucatch")

_INSPECTION_STAGE_LABELS = {
    "halucatch": "HaluCatch",
    "skillspector": "SkillSpector",
    "virustotal": "VirusTotal",
}


def _normalize_inspection_status(status: str | None) -> str:
    raw = str(status or "").strip()
    if raw == "failed":
        return "interrupted"
    if raw in {"inspecting", "completed", "interrupted", "rejected"}:
        return raw
    return "completed"


def _finding_rejects(finding: dict[str, Any]) -> bool:
    return str(finding.get("severity") or "") in {"critical", "high"}


def _stage_rejected_from_inspection(stage: str, inspection: dict[str, Any]) -> bool:
    skillspector_findings, virustotal_findings = _partition_inspection_findings(
        inspection.get("findings") or []
    )
    if stage == "skillspector":
        return any(_finding_rejects(finding) for finding in skillspector_findings)
    if stage == "virustotal":
        return any(_finding_rejects(finding) for finding in virustotal_findings)
    return False


def _halucatch_rejected(evaluation: dict[str, Any] | None) -> bool:
    if not evaluation:
        return False
    return str(evaluation.get("status") or "") == "failed"


def _success_stage_status(
    stage: str,
    inspection: dict[str, Any],
    evaluation: dict[str, Any] | None,
) -> str:
    if stage in {"skillspector", "virustotal"}:
        return "passed"
    return "done"


def _is_inspection_in_flight(version_status: str, entry: dict[str, Any]) -> bool:
    if version_status == "inspecting":
        return True
    started = entry.get("inspectionStartedAt")
    ended = entry.get("inspectionEndedAt")
    return bool(started and not ended)


def _effective_version_status(
    version_status: str,
    entry: dict[str, Any],
    inspection: dict[str, Any],
    failure: dict[str, Any] | None,
) -> str:
    verdict = str(inspection.get("verdict") or entry.get("status") or "").strip()
    if version_status == "rejected":
        if verdict == "rejected":
            return "completed"
        if failure or not verdict:
            return "interrupted"
    return version_status


def _read_persisted_stage_statuses(
    skill: dict[str, Any],
    entry: dict[str, Any],
    *,
    is_latest: bool,
) -> dict[str, str]:
    raw = entry.get("inspectionStageStatuses")
    if not isinstance(raw, dict) and is_latest:
        raw = skill.get("inspectionStageStatuses")
    if not isinstance(raw, dict):
        return {}

    statuses: dict[str, str] = {}
    for stage in _INSPECTION_STAGE_ORDER:
        value = str(raw.get(stage) or "").strip()
        if value:
            statuses[stage] = value
    return statuses


def _resolve_stage_statuses(
    *,
    version_status: str,
    skill: dict[str, Any],
    entry: dict[str, Any],
    is_latest: bool,
) -> dict[str, str]:
    persisted = _read_persisted_stage_statuses(skill, entry, is_latest=is_latest)
    in_flight = _is_inspection_in_flight(version_status, entry)
    statuses: dict[str, str] = {}

    for stage in _INSPECTION_STAGE_ORDER:
        if stage in persisted:
            statuses[stage] = persisted[stage]
        elif in_flight:
            statuses[stage] = "processing"

    if not statuses and version_status in {"interrupted", "failed"}:
        return {stage: "interrupted" for stage in _INSPECTION_STAGE_ORDER}

    return statuses


def _resolve_aggregate_inspection_status(
    stage_statuses: dict[str, str],
    version_status: str,
    entry: dict[str, Any],
    inspection: dict[str, Any],
) -> str:
    if _is_inspection_in_flight(version_status, entry):
        return "inspecting"

    values = list(stage_statuses.values())
    verdict = str(inspection.get("verdict") or entry.get("status") or "").strip()

    if version_status in {"interrupted", "failed"} or any(value == "interrupted" for value in values):
        return "interrupted"
    if verdict == "rejected" or any(value == "rejected" for value in values):
        return "rejected"
    return "completed"


def _format_inspection_progress(stage_statuses: dict[str, str]) -> str:
    parts = [
        f"{_INSPECTION_STAGE_LABELS[stage]}: {stage_statuses[stage]}"
        for stage in _INSPECTION_STAGE_ORDER
        if stage in stage_statuses
    ]
    return " · ".join(parts)


def _collect_version_inspection_context(
    skill: dict[str, Any],
    version_id: str,
    entry: dict[str, Any],
) -> dict[str, Any]:
    latest = skill.get("latestVersion")
    is_latest = version_id == latest
    raw_status = _normalize_inspection_status(
        str(entry.get("inspectionStatus") or "").strip()
        or (str(skill.get("inspectionStatus") or "completed") if is_latest else "completed")
    )
    failure = entry.get("inspectionFailure")
    if not failure and is_latest and raw_status in {"interrupted", "rejected", "failed"}:
        failure = skill.get("inspectionFailure")
    failure_dict = failure if isinstance(failure, dict) else None
    inspection = _get_inspection_record(entry)
    version_status = _effective_version_status(
        raw_status,
        entry,
        inspection,
        failure_dict,
    )

    stage_statuses = _resolve_stage_statuses(
        version_status=version_status,
        skill=skill,
        entry=entry,
        is_latest=is_latest,
    )
    aggregate_status = _resolve_aggregate_inspection_status(
        stage_statuses,
        version_status,
        entry,
        inspection,
    )

    return {
        "version_status": version_status,
        "stage_statuses": stage_statuses,
        "aggregate_status": aggregate_status,
        "progress": _format_inspection_progress(stage_statuses),
        "failure": failure_dict,
        "inspection_started_at": entry.get("inspectionStartedAt")
        or (skill.get("inspectionStartedAt") if is_latest else None),
        "inspection_ended_at": entry.get("inspectionEndedAt")
        or (skill.get("inspectionEndedAt") if is_latest else None),
    }


def _resolve_inspection_aggregate_status(
    entry: dict[str, Any],
    skill: dict[str, Any] | None = None,
) -> str:
    skill_context = skill if skill is not None else entry
    version_id = str(entry.get("version") or "?")
    return _collect_version_inspection_context(skill_context, version_id, entry)["aggregate_status"]


def _print_version_status_row(
    skill: dict[str, Any],
    version_id: str,
    entry: dict[str, Any],
) -> None:
    context = _collect_version_inspection_context(skill, version_id, entry)
    latest_marker = " (latest)" if version_id == skill.get("latestVersion") else ""
    print(
        f"  {version_id}{latest_marker}  status={context['aggregate_status']}  "
        f"published={_format_published_uploaded(entry)}  "
        f"visibility={_format_visibility(skill.get('published'))}"
    )
    print(f"    progress: {context['progress']}")


def _print_single_version_status(body: dict[str, Any], version: str) -> None:
    slug = body.get("slug", "?")
    version_id, entry = find_version_entry(body, version)
    latest = body.get("latestVersion")
    is_latest = version_id == latest
    context = _collect_version_inspection_context(body, version_id, entry)

    print(f"{slug}@{version_id}" + (" (latest)" if is_latest else ""))
    print(f"Inspection progress: {context['progress']}")
    print(f"Inspection status: {context['aggregate_status']}")
    print(f"Published: {_format_published_uploaded(entry)}")
    print(f"Visibility: {_format_visibility(body.get('published'))}")
    if context["inspection_started_at"]:
        print(f"Inspection started: {context['inspection_started_at']}")
    if context["inspection_ended_at"]:
        print(f"Inspection ended: {context['inspection_ended_at']}")


def find_version_entry(body: dict[str, Any], version: str) -> tuple[str, dict[str, Any]]:
    """Resolve a semver (or version map key) to (version_id, entry). Raises ValueError if missing."""
    versions = body.get("versions")
    if isinstance(versions, dict):
        direct = versions.get(version)
        if isinstance(direct, dict):
            return str(direct.get("version", version)), direct
        for key, entry in versions.items():
            if isinstance(entry, dict):
                version_id = str(entry.get("version", key))
                if version_id == version or str(key) == version:
                    return version_id, entry
    slug = body.get("slug", "?")
    raise ValueError(f"Version '{version}' not found for skill '{slug}'")


def filter_skill_body_version(body: dict[str, Any], version: str) -> dict[str, Any]:
    """Return a copy of the skill body with only the requested version in versions."""
    version_id, entry = find_version_entry(body, version)
    versions = body.get("versions")
    if isinstance(versions, dict):
        for key, candidate in versions.items():
            if candidate is entry:
                return {**body, "versions": {key: entry}}
    return {**body, "versions": {version_id: entry}}


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


def print_skill_status(body: dict[str, Any], *, version: str | None = None) -> None:
    """Human-readable publish and inspection status for a single version."""
    target = version or body.get("latestVersion")
    slug = body.get("slug", "?")
    if not target:
        print(f"{slug}@?")
        print("Inspection progress: -")
        print("Inspection status: unknown")
        return
    _print_single_version_status(body, str(target))


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


def _build_skill_improvement_prompt(slug: str, version: str) -> str:
    skill_ref = f"{slug}@{version}"
    return f"""请根据上方审查报告，修改 Skill 包 `{skill_ref}`。以上方报告为唯一依据，不要臆造未列出的问题。

## 目标
修复阻塞项与高影响问题，补齐报告中明确指出的质量缺口，使包可再次发布。保持 `slug` 不变；实质性修改后按 SemVer 提升 `version`。

## SkillSpector（安全）——精准定位，再修改
- 逐条处理上方列出的 SkillSpector finding，不要遗漏或合并敷衍。
- 对每一条：打开报告指向或暗示的文件/路径，在当前包内确认问题真实存在，再做最小且正确的修复（frontmatter、边界说明、措辞、脚本规范、权限声明等）。
- 不要忽略、拖延或用泛泛的安全加固替代具体修复；不要添加 finding 未要求的无关联改动。

## VirusTotal（安全）——精准定位，再修改
- 结合上方 VirusTotal 摘要与被标记引擎结果，将每条检出映射到包内具体对象（文件内容、嵌入字符串、压缩包成员、构建产物等）。
- 移除或替换触发检出的内容，优先采用透明、可解释的修复，避免混淆或重打包规避。
- 若判断为误报，仍须在包内核实对应对象；在成本低时优先无害重命名/结构调整，并在变更说明中写明理由。

## HaluCatch（质量）——先核实 finding 真实性，再修改
- 对每条 HaluCatch finding：修改前先在 Skill（`SKILL.md`、`examples/`、`scripts/`、`tests/` 及随包代码）中查找，确认所述缺口或风险是否确实影响当前包。
- 若 finding 不成立（已修复、误读或不适用于本 Skill 类型），说明原因并跳过，不要为了凑分而堆砌内容。
- 若成立，按 finding 所属维度做针对性修改（流程/规则、解读护栏、地基与数据管线、代码风险、复杂度与可维护性）。
- 参考上方加权总分与各维度分数，优先处理得分最低的维度。

## 交付要求
- 输出简洁变更清单：文件 → 对应的 finding/消息 → 具体改动。
- 保留必填 frontmatter 字段；除非 finding 明确要求合并，不要删除 examples/tests。
- 编辑过程中不要对网络或用户文件系统执行包内脚本。"""


def _print_skill_improvement_prompt(slug: str, version: str) -> None:
    print("\n=== Prompt ===")
    print(_build_skill_improvement_prompt(slug, version))


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
    inspection = _get_inspection_record(body)
    evaluation = body.get("evaluation")
    resolved_slug = _resolve_report_slug(body, slug)
    version = body.get("version", "?")
    print(f"Report: {resolved_slug}@{version}")
    if inspection:
        _print_inspection_sections(
            inspection,
            status_label="Inspection status",
            status_value=_resolve_inspection_aggregate_status(body),
        )
    if evaluation:
        _print_inspection_section_header("HaluCatch", "Quality")
        print_evaluation(evaluation)
    if not inspection and not evaluation:
        print("No inspection or evaluation data for this version.")
        return
    _print_skill_improvement_prompt(resolved_slug, str(version))
