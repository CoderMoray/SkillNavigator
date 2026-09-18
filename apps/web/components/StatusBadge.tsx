import type { EvaluationStatus, InspectionSeverity, InspectionVerdict, SkillInspectionStatus } from "../lib/types";
import { severityLabel, skillInspectionStatusLabel, verdictLabel } from "../lib/format";
import {
  formatSkillSpectorRecommendation,
  skillSpectorRecommendationBadgeClass
} from "../lib/skillspector-summary";
import {
  formatVirusTotalDetectionSummary,
  virusTotalDetectionBadgeClass
} from "../lib/virustotal-summary";
import type { VirusTotalScanSummary } from "../lib/types";

export function VerdictBadge({ verdict, title }: { verdict: InspectionVerdict; title?: string }) {
  return (
    <span className={`badge ${verdict}`} title={title}>
      {verdictLabel(verdict)}
    </span>
  );
}

export function SkillInspectionStatusBadge({
  status,
  title
}: {
  status: SkillInspectionStatus;
  title?: string;
}) {
  if (status === "completed") {
    return null;
  }

  if (status === "interrupted" || status === "rejected") {
    return <VerdictBadge verdict="rejected" title={title} />;
  }

  return (
    <span className={`badge inspection-${status}`} title={title}>
      {skillInspectionStatusLabel(status)}
    </span>
  );
}

export function EvaluationBadge({ status }: { status: EvaluationStatus }) {
  const labels: Record<EvaluationStatus, string> = {
    passed: "可靠性通过",
    partial: "部分通过",
    failed: "可靠性失败",
    "not-configured": "未配置可靠性评估"
  };

  return <span className={`badge ${status}`}>{labels[status]}</span>;
}

export function SeverityBadge({ severity }: { severity: InspectionSeverity }) {
  return <span className={`badge ${severity}`}>{severityLabel(severity)}</span>;
}

export function SkillSpectorRecommendationBadge({ recommendation }: { recommendation: string | undefined }) {
  const label = formatSkillSpectorRecommendation(recommendation);
  const toneClass = skillSpectorRecommendationBadgeClass(recommendation);

  if (label === "-" || !toneClass) {
    return <strong>{label}</strong>;
  }

  return (
    <span className={`badge ${toneClass}`} title={label}>
      {label}
    </span>
  );
}

export function VirusTotalDetectionBadge({
  scan
}: {
  scan: Pick<VirusTotalScanSummary, "status" | "malicious" | "suspicious"> | undefined;
}) {
  const label = formatVirusTotalDetectionSummary(scan);
  const toneClass = virusTotalDetectionBadgeClass(scan);

  if (label === "-") {
    return <strong>{label}</strong>;
  }

  if (!toneClass) {
    return (
      <span className="badge" title={label}>
        {label}
      </span>
    );
  }

  return (
    <span className={`badge ${toneClass}`} title={label}>
      {label}
    </span>
  );
}
