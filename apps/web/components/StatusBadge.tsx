import type { EvaluationStatus, ReviewSeverity, ReviewVerdict, SkillReviewStatus } from "../lib/types";
import { severityLabel, skillReviewStatusLabel, verdictLabel } from "../lib/format";

export function VerdictBadge({ verdict, title }: { verdict: ReviewVerdict; title?: string }) {
  return (
    <span className={`badge ${verdict}`} title={title}>
      {verdictLabel(verdict)}
    </span>
  );
}

export function SkillReviewStatusBadge({
  status,
  title
}: {
  status: SkillReviewStatus;
  title?: string;
}) {
  if (status === "completed") {
    return null;
  }

  if (status === "failed") {
    return <VerdictBadge verdict="rejected" title={title} />;
  }

  return (
    <span className={`badge review-${status}`} title={title}>
      {skillReviewStatusLabel(status)}
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

export function SeverityBadge({ severity }: { severity: ReviewSeverity }) {
  return <span className={`badge ${severity}`}>{severityLabel(severity)}</span>;
}
