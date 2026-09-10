import {
  getConfiguredInspectionStages,
  inspectAndEvaluateSkillSnapshot,
  isPipelineIncomplete,
  type InspectionFinding,
  type InspectionReport
} from "@skill-platform/inspection-engine";
import { buildInspectionFailureFromStageStatuses } from "@skill-platform/storage";
import type { FunctionalEvaluationReport } from "@skill-platform/evaluator";
import { createRegistryStoreFromEnv, loadDotEnvIfPresent } from "@skill-platform/storage";

loadDotEnvIfPresent();

console.log("Registry worker: batch re-review of all skill versions (persists reviews and evaluations to the registry).");

const store = createRegistryStoreFromEnv();

const reviewed = await store.inspectAll(async (snapshot, version) => {
  const result = await inspectAndEvaluateSkillSnapshot(snapshot, version);
  if (isPipelineIncomplete(result.stageStatuses, getConfiguredInspectionStages())) {
    // Do not persist half-complete reviews in a batch re-review: abort so the
    // operator fixes the environment first.
    const failure = buildInspectionFailureFromStageStatuses(
      result.stageStatuses,
      undefined,
      result.stageFailureMessages
    );
    throw new Error(`inspection_pipeline_incomplete: ${failure?.message ?? "审查流程未完成"}`);
  }
  return result;
});

console.log(`Done. Re-reviewed ${reviewed.length} version(s).\n`);
for (const item of reviewed) {
  console.log(formatVersionLogLine(item.inspection.skillSlug, item.manifest.name, item.version, item.status, item.inspection, item.evaluation));
}

function formatVersionLogLine(
  slug: string,
  displayName: string,
  version: string,
  verdict: string,
  inspection: InspectionReport,
  evaluation?: FunctionalEvaluationReport
): string {
  const parts = [
    `${slug} (${displayName})@${version}`,
    `verdict=${verdict}`,
    summarizeInspectionFindings(inspection.findings),
    summarizeSkillSpector(inspection),
    summarizeEvaluation(evaluation)
  ];
  return parts.join(" | ");
}

function summarizeInspectionFindings(findings: InspectionFinding[]): string {
  if (findings.length === 0) {
    return "findings=0";
  }

  const bySeverity: Record<InspectionFinding["severity"], number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0
  };
  for (const finding of findings) {
    bySeverity[finding.severity] += 1;
  }

  const detail = (["critical", "high", "medium", "low"] as const)
    .filter((severity) => bySeverity[severity] > 0)
    .map((severity) => `${bySeverity[severity]} ${severity}`)
    .join(", ");

  return `findings=${findings.length} (${detail})`;
}

function summarizeSkillSpector(review: InspectionReport): string {
  if (review.skillSpector) {
    const { riskScore, riskSeverity } = review.skillSpector;
    const safetyScore = 100 - Math.min(100, Math.max(0, riskScore));
    return `SkillSpector safety=${safetyScore} (${riskSeverity})`;
  }
  if (review.findings.some((finding) => finding.id === "skillspector-unavailable")) {
    return "SkillSpector unavailable (regex fallback)";
  }
  return "SkillSpector disabled (regex rules)";
}

function summarizeEvaluation(evaluation?: FunctionalEvaluationReport): string {
  if (!evaluation) {
    return "eval=n/a";
  }
  return `eval ${evaluation.provider} ${evaluation.status} score=${evaluation.score} tasks=${evaluation.tasksPassed}/${evaluation.tasksTotal}`;
}
