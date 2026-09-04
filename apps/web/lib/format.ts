import type { ReviewSeverity, ReviewVerdict, SkillReviewFailureInfo, SkillReviewStage, SkillReviewStatus } from "./types";

export function formatDateTime(input: string | undefined): string {
  if (!input) {
    return "-";
  }

  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false
  }).format(date);
}

export function formatNumber(value: number | undefined): string {
  return new Intl.NumberFormat("zh-CN").format(value ?? 0);
}

export function formatFileSize(size: number): string {
  if (!Number.isFinite(size) || size < 0) {
    return "0 B";
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function verdictLabel(verdict: ReviewVerdict): string {
  const labels: Record<ReviewVerdict, string> = {
    published: "已发布",
    "needs-review": "需复核",
    rejected: "已拒绝"
  };
  return labels[verdict];
}

export function skillReviewStatusLabel(status: SkillReviewStatus): string {
  const labels: Record<SkillReviewStatus, string> = {
    reviewing: "审查中",
    completed: "审查完成",
    failed: "审查失败"
  };
  return labels[status];
}

export function skillReviewStageLabel(stage: SkillReviewStage): string {
  const labels: Record<SkillReviewStage, string> = {
    skillspector: "SkillSpector",
    virustotal: "VirusTotal",
    halucatch: "HaluCatch"
  };
  return labels[stage];
}

export function formatSkillReviewFailureSummary(failure: SkillReviewFailureInfo): string {
  if (failure.stages.length === 0) {
    return failure.message;
  }
  return `${failure.stages.map(skillReviewStageLabel).join("、")}：${failure.message}`;
}

export function severityLabel(severity: ReviewSeverity): string {
  const labels: Record<ReviewSeverity, string> = {
    low: "低",
    medium: "中",
    high: "高",
    critical: "严重"
  };
  return labels[severity];
}
