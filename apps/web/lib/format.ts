import type { InspectionSeverity, InspectionVerdict, SkillInspectionFailureInfo, SkillInspectionStage, SkillInspectionStatus } from "./types";

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

export function verdictLabel(verdict: InspectionVerdict): string {
  const labels: Record<InspectionVerdict, string> = {
    published: "已发布",
    "needs-inspection": "需复核",
    rejected: "已拒绝"
  };
  return labels[verdict];
}

export function skillInspectionStatusLabel(status: SkillInspectionStatus): string {
  const labels: Record<SkillInspectionStatus, string> = {
    inspecting: "审查中",
    completed: "审查完成",
    interrupted: "审查中断",
    rejected: "审查拒绝"
  };
  return labels[status];
}

export function skillInspectionStageLabel(stage: SkillInspectionStage): string {
  const labels: Record<SkillInspectionStage, string> = {
    skillspector: "SkillSpector",
    virustotal: "VirusTotal",
    halucatch: "HaluCatch"
  };
  return labels[stage];
}

export function formatSkillInspectionFailureSummary(failure: SkillInspectionFailureInfo): string {
  if (failure.stages.length === 0) {
    return failure.message;
  }
  return `${failure.stages.map(skillInspectionStageLabel).join("、")}：${failure.message}`;
}

export function severityLabel(severity: InspectionSeverity): string {
  const labels: Record<InspectionSeverity, string> = {
    low: "低",
    medium: "中",
    high: "高",
    critical: "严重"
  };
  return labels[severity];
}
