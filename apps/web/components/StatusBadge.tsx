import type { EvaluationStatus, InspectionSeverity, InspectionVerdict, SkillInspectionStatus } from "../lib/types";
import { severityLabel, skillInspectionStatusLabel, verdictLabel } from "../lib/format";

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

  if (status === "failed") {
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
