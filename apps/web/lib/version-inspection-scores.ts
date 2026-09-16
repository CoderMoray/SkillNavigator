import { toSkillSpectorSafetyScore } from "./skillspector-summary";
import type { FunctionalEvaluationReport, InspectionReport } from "./types";
import { resolveVirusTotalEngineTotal } from "./virustotal-summary";

export interface VersionInspectionScoreParts {
  skillSpector: string;
  virusTotal: string;
  haluCatch: string;
}

export function formatSkillSpectorInspectionScore(
  inspection: InspectionReport | undefined
): string {
  const riskScore = inspection?.skillSpector?.riskScore;
  if (riskScore === undefined || riskScore === null) {
    return "?/100";
  }
  return `${toSkillSpectorSafetyScore(riskScore)}/100`;
}

export function formatVirusTotalInspectionScore(
  inspection: InspectionReport | undefined
): string {
  const summary = inspection?.virusTotal;
  if (!summary) {
    return "?/?";
  }

  const status = summary.status;
  if (status === "failed" || status === "not_found" || (status as string) === "pending") {
    return "?/?";
  }

  const totalEngines = resolveVirusTotalEngineTotal(summary);
  if (totalEngines <= 0) {
    return "?/?";
  }

  const passedEngines = Math.max(0, totalEngines - summary.malicious - summary.suspicious);
  return `${passedEngines}/${totalEngines}`;
}

export function formatHaluCatchInspectionScore(
  evaluation: FunctionalEvaluationReport | undefined
): string {
  if (evaluation?.score === undefined || evaluation.score === null) {
    return "?/100";
  }
  return `${Math.round(evaluation.score)}/100`;
}

export function resolveVersionInspectionScoreParts(
  inspection: InspectionReport | undefined,
  evaluation: FunctionalEvaluationReport | undefined
): VersionInspectionScoreParts {
  return {
    skillSpector: formatSkillSpectorInspectionScore(inspection),
    virusTotal: formatVirusTotalInspectionScore(inspection),
    haluCatch: formatHaluCatchInspectionScore(evaluation)
  };
}

export function displayInspectionScore(score: string): string {
  return score.startsWith("?") ? "—" : score;
}

export function formatVersionInspectionScoresSummary(
  inspection: InspectionReport | undefined,
  evaluation: FunctionalEvaluationReport | undefined
): string {
  const parts = resolveVersionInspectionScoreParts(inspection, evaluation);
  return `SkillSpector: ${parts.skillSpector} · VirusTotal: ${parts.virusTotal} · HaluCatch: ${parts.haluCatch}`;
}
