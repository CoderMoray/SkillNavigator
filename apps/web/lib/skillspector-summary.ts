import type { SkillSpectorScanSummary } from "./types";

const RISK_SEVERITY_LABELS: Record<string, string> = {
  LOW: "低",
  MEDIUM: "中",
  HIGH: "高",
  CRITICAL: "严重"
};

const RECOMMENDATION_LABELS: Record<string, string> = {
  SAFE: "可安装（SAFE）",
  CAUTION: "谨慎（CAUTION）",
  DO_NOT_INSTALL: "不建议安装（DO_NOT_INSTALL）"
};

/** Badge tone classes aligned with existing `.badge.passed` / `.partial` / `.rejected`. */
const RECOMMENDATION_BADGE_CLASSES: Record<keyof typeof RECOMMENDATION_LABELS, string> = {
  SAFE: "passed",
  CAUTION: "partial",
  DO_NOT_INSTALL: "rejected"
};

export function skillSpectorRecommendationBadgeClass(recommendation: string | undefined): string | null {
  if (!recommendation) {
    return null;
  }
  const key = recommendation.trim().toUpperCase();
  if (!(key in RECOMMENDATION_BADGE_CLASSES)) {
    return null;
  }
  return RECOMMENDATION_BADGE_CLASSES[key as keyof typeof RECOMMENDATION_LABELS] ?? null;
}

export function formatSkillSpectorRiskSeverity(severity: string | undefined): string {
  if (!severity) {
    return "-";
  }
  const key = severity.trim().toUpperCase();
  return RISK_SEVERITY_LABELS[key] ?? severity;
}

export function formatSkillSpectorRecommendation(recommendation: string | undefined): string {
  if (!recommendation) {
    return "-";
  }
  const key = recommendation.trim().toUpperCase();
  return RECOMMENDATION_LABELS[key] ?? recommendation;
}

export function formatSkillSpectorScanMode(scanMode: string | undefined): string {
  if (!scanMode) {
    return "-";
  }
  if (scanMode === "static-only") {
    return "仅静态扫描";
  }
  return scanMode;
}

/** Package-level SkillSpector risk (0–100) inverted to a safety score. */
export function toSkillSpectorSafetyScore(riskScore: number): number {
  const clamped = Math.min(100, Math.max(0, riskScore));
  return 100 - clamped;
}

export function formatSkillSpectorSummaryLine(summary: SkillSpectorScanSummary): string {
  const safetyScore = toSkillSpectorSafetyScore(summary.riskScore);
  return `当前安全分 ${safetyScore}/100（${formatSkillSpectorRiskSeverity(summary.riskSeverity)}）。`;
}
