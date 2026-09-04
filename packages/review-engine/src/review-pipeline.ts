import {
  getSkillSlug,
  validateSkillSnapshot,
  type SkillSnapshot,
} from "@skill-platform/skill-spec";
import { evaluateSkillSnapshot, type FunctionalEvaluationReport } from "@skill-platform/evaluator";
import type {
  ReviewAndEvaluationResult,
  ReviewFinding,
  ReviewReport,
  ReviewStage,
  ReviewStageFailure,
} from "./index.js";
import { calculateReviewVerdict } from "./review-verdict.js";
import { isSkillSpectorEnabled, runSkillSpectorSecurityScan } from "./skillspector.js";
import {
  formatVirusTotalError,
  isVirusTotalEnabled,
  runVirusTotalScan,
} from "./virustotal.js";

export interface ReviewPipelineState {
  findings: ReviewFinding[];
  skillSpector?: ReviewReport["skillSpector"];
  skillSpectorAvailable: boolean;
  virusTotal?: ReviewReport["virusTotal"];
  evaluation?: FunctionalEvaluationReport;
  failedStages: ReviewStageFailure[];
  completedStages: ReviewStage[];
}

export interface ReviewStageCompleteEvent {
  stage: ReviewStage;
  state: ReviewPipelineState;
  review: ReviewReport;
  evaluation?: FunctionalEvaluationReport;
}

export interface RunReviewPipelineOptions {
  skipStages?: ReviewStage[];
  initialState?: Partial<ReviewPipelineState>;
  onStageComplete?: (event: ReviewStageCompleteEvent) => Promise<void>;
}

function createInitialPipelineState(initial?: Partial<ReviewPipelineState>): ReviewPipelineState {
  return {
    findings: initial?.findings ?? [],
    skillSpector: initial?.skillSpector,
    skillSpectorAvailable: initial?.skillSpectorAvailable ?? false,
    virusTotal: initial?.virusTotal,
    evaluation: initial?.evaluation,
    failedStages: initial?.failedStages ?? [],
    completedStages: initial?.completedStages ?? [],
  };
}

function shouldSkipStage(stage: ReviewStage, skipStages: ReviewStage[] | undefined): boolean {
  return skipStages?.includes(stage) ?? false;
}

function specValidationFindings(snapshot: SkillSnapshot): ReviewFinding[] {
  return validateSkillSnapshot(snapshot).map((issue) => ({
    id: `spec-${issue.code}`,
    category: "compliance" as const,
    severity: issue.code === "missing-skill-entry" ? ("high" as const) : ("medium" as const),
    title: "Skill package does not match ClawHub format",
    message: issue.message,
    path: issue.path,
    recommendation: "Update the package to follow docs/rules/skill-spec.md.",
  }));
}

function buildReviewFromState(
  snapshot: SkillSnapshot,
  version: string,
  state: ReviewPipelineState
): ReviewReport {
  return {
    id: `review_${snapshot.contentHash.slice(0, 16)}_${Date.now()}`,
    skillSlug: getSkillSlug(snapshot.manifest),
    skillName: snapshot.manifest.name,
    version,
    contentHash: snapshot.contentHash,
    verdict: calculateReviewVerdict(state.findings),
    scores: {
      qualityScore: 100,
      securityScore: 100,
      reliabilityScore: 100,
    },
    findings: state.findings,
    skillSpector: state.skillSpector,
    virusTotal: state.virusTotal,
    createdAt: new Date().toISOString(),
  };
}

async function emitStageComplete(
  snapshot: SkillSnapshot,
  version: string,
  state: ReviewPipelineState,
  stage: ReviewStage,
  onStageComplete: RunReviewPipelineOptions["onStageComplete"]
): Promise<void> {
  if (!onStageComplete) {
    return;
  }
  await onStageComplete({
    stage,
    state,
    review: buildReviewFromState(snapshot, version, state),
    evaluation: state.evaluation,
  });
}

async function runSkillSpectorStage(
  snapshot: SkillSnapshot,
  version: string,
  state: ReviewPipelineState,
  onStageComplete: RunReviewPipelineOptions["onStageComplete"]
): Promise<void> {
  if (!isSkillSpectorEnabled()) {
    state.skillSpectorAvailable = false;
    return;
  }

  try {
    const scan = await runSkillSpectorSecurityScan(snapshot);
    state.skillSpector = scan.summary;
    state.skillSpectorAvailable = true;
    state.findings.push(...scan.findings);
  } catch (error) {
    const message = truncateError(error);
    state.skillSpectorAvailable = false;
    state.failedStages.push({ stage: "skillspector", message });
    state.findings.push({
      id: "skillspector-unavailable",
      category: "security",
      severity: "high",
      title: "SkillSpector security scan unavailable",
      message: `SkillSpector static security scan could not run: ${message}`,
      recommendation:
        "Install Python 3.12+ with SkillSpector dependencies, keep packages/SkillSpector-main available, or set SKILLSPECTOR_PYTHON before publishing.",
    });
  }

  if (!state.completedStages.includes("skillspector")) {
    state.completedStages.push("skillspector");
  }
  await emitStageComplete(snapshot, version, state, "skillspector", onStageComplete);
}

async function runVirusTotalStage(
  snapshot: SkillSnapshot,
  version: string,
  state: ReviewPipelineState,
  onStageComplete: RunReviewPipelineOptions["onStageComplete"]
): Promise<void> {
  if (!isVirusTotalEnabled()) {
    return;
  }

  try {
    const scan = await runVirusTotalScan(snapshot);
    state.virusTotal = scan.summary;
    state.findings.push(...scan.findings);
  } catch (error) {
    const message = formatVirusTotalError(error);
    state.failedStages.push({ stage: "virustotal", message });
    state.findings.push({
      id: "virustotal-scan-failed",
      category: "security",
      severity: "high",
      title: "VirusTotal package scan failed",
      message: `VirusTotal static AV scan could not complete: ${message}`,
      recommendation:
        "Resolve the VirusTotal scan error (network, API key, timeout, or upload settings) and publish again.",
    });
  }

  if (!state.completedStages.includes("virustotal")) {
    state.completedStages.push("virustotal");
  }
  await emitStageComplete(snapshot, version, state, "virustotal", onStageComplete);
}

function isHaluCatchEnabled(): boolean {
  return process.env.HALUCATCH_ENABLED?.toLowerCase() !== "false";
}

function getHaluCatchStageFailure(
  evaluation: FunctionalEvaluationReport
): ReviewStageFailure | undefined {
  if (!isHaluCatchEnabled()) {
    return undefined;
  }

  const unavailableFinding = evaluation.findings.find((finding) => finding.id === "halucatch-unavailable");
  if (unavailableFinding) {
    return {
      stage: "halucatch",
      message: unavailableFinding.message,
    };
  }

  if (evaluation.provider !== "halucatch-adapter") {
    return {
      stage: "halucatch",
      message: "HaluCatch reliability evaluation did not complete successfully for this publish.",
    };
  }

  const missingDimension = evaluation.findings.find((finding) =>
    /^halucatch-(foundation|code|rules|guardrails|complexity)-missing$/.test(finding.id)
  );
  if (missingDimension) {
    return {
      stage: "halucatch",
      message: missingDimension.message,
    };
  }

  return undefined;
}

async function runHaluCatchStage(
  snapshot: SkillSnapshot,
  version: string,
  state: ReviewPipelineState,
  onStageComplete: RunReviewPipelineOptions["onStageComplete"]
): Promise<void> {
  if (!isHaluCatchEnabled()) {
    return;
  }

  const evaluation = await evaluateSkillSnapshot(snapshot);
  state.evaluation = evaluation;

  const haluCatchFailure = getHaluCatchStageFailure(evaluation);
  if (haluCatchFailure) {
    state.failedStages.push(haluCatchFailure);
    state.findings.push({
      id: "review-halucatch-unavailable",
      category: "reliability",
      severity: "high",
      title: "HaluCatch reliability evaluation unavailable",
      message: haluCatchFailure.message,
      recommendation:
        "Install Python 3.8+ and keep packages/halucatch-1.8.8 available, or set HALUCATCH_PYTHON before publishing.",
    });
  }

  if (!state.completedStages.includes("halucatch")) {
    state.completedStages.push("halucatch");
  }
  await emitStageComplete(snapshot, version, state, "halucatch", onStageComplete);
}

export async function runReviewPipeline(
  snapshot: SkillSnapshot,
  versionOverride?: string,
  options: RunReviewPipelineOptions = {}
): Promise<ReviewAndEvaluationResult> {
  const version = versionOverride ?? snapshot.manifest.version ?? "0.1.0";
  const skipStages = options.skipStages ?? [];
  const state = createInitialPipelineState(options.initialState);

  if (state.findings.length === 0) {
    state.findings.push(...specValidationFindings(snapshot));
  }

  if (!shouldSkipStage("halucatch", skipStages)) {
    await runHaluCatchStage(snapshot, version, state, options.onStageComplete);
  }

  const parallelStages: Promise<void>[] = [];

  if (!shouldSkipStage("skillspector", skipStages)) {
    parallelStages.push(runSkillSpectorStage(snapshot, version, state, options.onStageComplete));
  }

  if (!shouldSkipStage("virustotal", skipStages)) {
    parallelStages.push(runVirusTotalStage(snapshot, version, state, options.onStageComplete));
  }

  if (parallelStages.length > 0) {
    await Promise.all(parallelStages);
  }

  const review = buildReviewFromState(snapshot, version, state);
  const evaluation = state.evaluation ?? (await evaluateSkillSnapshot(snapshot));

  return {
    review,
    evaluation,
    failedStages: state.failedStages,
  };
}

function truncateError(error: unknown): string {
  const parts: string[] = [];
  if (error instanceof Error) {
    parts.push(error.message);
    const cause = error.cause;
    if (cause instanceof Error) {
      const code = "code" in cause && typeof cause.code === "string" ? cause.code : undefined;
      parts.push(code ? `${code}: ${cause.message}` : cause.message);
    }
  } else {
    parts.push(String(error));
  }
  const message = parts.filter(Boolean).join(" — ");
  return message.length <= 300 ? message : `${message.slice(0, 297)}...`;
}

export function resolveReviewStagesToRun(input: {
  configuredStages: ReviewStage[];
  completedStages: ReviewStage[];
  failedStages: ReviewStage[];
  requestedStages?: ReviewStage[];
}): ReviewStage[] {
  const { configuredStages, completedStages, failedStages, requestedStages } = input;
  const completed = new Set(completedStages);
  const failed = new Set(failedStages);

  const defaultStages = configuredStages.filter(
    (stage) => !completed.has(stage) || failed.has(stage)
  );
  if (!requestedStages?.length) {
    return defaultStages;
  }

  const requested = new Set(requestedStages);
  return defaultStages.filter((stage) => requested.has(stage));
}

export function getConfiguredReviewStages(): ReviewStage[] {
  const stages: ReviewStage[] = [];
  if (isHaluCatchEnabled()) {
    stages.push("halucatch");
  }
  if (isSkillSpectorEnabled()) {
    stages.push("skillspector");
  }
  if (isVirusTotalEnabled()) {
    stages.push("virustotal");
  }
  return stages;
}
