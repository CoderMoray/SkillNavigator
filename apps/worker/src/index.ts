import {
  reviewAndEvaluateSkillSnapshot,
  type ReviewFinding,
  type ReviewReport
} from "@skill-platform/review-engine";
import type { FunctionalEvaluationReport } from "@skill-platform/evaluator";
import { createRegistryStoreFromEnv, loadDotEnvIfPresent } from "@skill-platform/storage";

loadDotEnvIfPresent();

console.log("Registry worker: batch re-review of all skill versions (persists reviews and evaluations to the registry).");

const store = createRegistryStoreFromEnv();

const reviewed = await store.reviewAll(async (snapshot, version) => {
  const result = await reviewAndEvaluateSkillSnapshot(snapshot, version);
  if (result.failedStages.length > 0) {
    // Do not persist half-complete reviews in a batch re-review: abort so the
    // operator fixes the environment first.
    const summary = result.failedStages
      .map((failure) => `[${failure.stage}] ${failure.message}`)
      .join("; ");
    throw new Error(`review_pipeline_incomplete: ${summary}`);
  }
  return result;
});

console.log(`Done. Re-reviewed ${reviewed.length} version(s).\n`);
for (const item of reviewed) {
  console.log(formatVersionLogLine(item.review.skillSlug, item.manifest.name, item.version, item.status, item.review, item.evaluation));
}

function formatVersionLogLine(
  slug: string,
  displayName: string,
  version: string,
  verdict: string,
  review: ReviewReport,
  evaluation?: FunctionalEvaluationReport
): string {
  const parts = [
    `${slug} (${displayName})@${version}`,
    `verdict=${verdict}`,
    summarizeReviewFindings(review.findings),
    summarizeSkillSpector(review),
    summarizeEvaluation(evaluation)
  ];
  return parts.join(" | ");
}

function summarizeReviewFindings(findings: ReviewFinding[]): string {
  if (findings.length === 0) {
    return "findings=0";
  }

  const bySeverity: Record<ReviewFinding["severity"], number> = {
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

function summarizeSkillSpector(review: ReviewReport): string {
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
