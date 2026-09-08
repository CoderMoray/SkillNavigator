import type { SkillSpectorScanSummary } from "@skill-platform/inspection-engine";

export interface SkillSpectorReviewColumns {
  skillspectorProvider: string | null;
  skillspectorRiskScore: number | null;
  skillspectorRiskSeverity: string | null;
  skillspectorRecommendation: string | null;
  skillspectorScanMode: string | null;
}

export function skillSpectorInspectionColumns(
  summary: SkillSpectorScanSummary | undefined
): SkillSpectorReviewColumns {
  if (!summary) {
    return {
      skillspectorProvider: null,
      skillspectorRiskScore: null,
      skillspectorRiskSeverity: null,
      skillspectorRecommendation: null,
      skillspectorScanMode: null
    };
  }

  return {
    skillspectorProvider: summary.provider,
    skillspectorRiskScore: summary.riskScore,
    skillspectorRiskSeverity: summary.riskSeverity,
    skillspectorRecommendation: summary.recommendation,
    skillspectorScanMode: summary.scanMode
  };
}

export function parseSkillSpectorInspectionRow(row: {
  skillspectorProvider?: string | null;
  skillspectorRiskScore?: number | null;
  skillspectorRiskSeverity?: string | null;
  skillspectorRecommendation?: string | null;
  skillspectorScanMode?: string | null;
}): SkillSpectorScanSummary | undefined {
  if (
    row.skillspectorRiskScore == null ||
    !row.skillspectorRiskSeverity ||
    !row.skillspectorRecommendation
  ) {
    return undefined;
  }

  return {
    provider: (row.skillspectorProvider as SkillSpectorScanSummary["provider"]) ?? "skillspector-static",
    riskScore: Number(row.skillspectorRiskScore),
    riskSeverity: row.skillspectorRiskSeverity,
    recommendation: row.skillspectorRecommendation,
    scanMode: (row.skillspectorScanMode as SkillSpectorScanSummary["scanMode"]) ?? "static-only"
  };
}
