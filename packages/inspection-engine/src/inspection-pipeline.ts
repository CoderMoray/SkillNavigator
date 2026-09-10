import {
  getSkillSlug,
  validateSkillSnapshot,
  type SkillSnapshot,
} from "@skill-platform/skill-spec";
import {
  evaluateSkillSnapshot,
  evaluateStaticTaskSet,
  type FunctionalEvaluationReport,
} from "@skill-platform/evaluator";
import type {
  InspectionAndEvaluationResult,
  InspectionFinding,
  InspectionReport,
  InspectionStage,
  InspectionStageFailure,
} from "./index.js";
import { isSkillSpectorEnabled, runSkillSpectorSecurityScan } from "./skillspector.js";
import {
  formatVirusTotalError,
  isVirusTotalEnabled,
  runVirusTotalScan,
} from "./virustotal.js";
import { calculateInspectionVerdict } from "./inspection-verdict.js";
import {
  resolveHaluCatchStageStatus,
  resolveSkillSpectorStageStatus,
  resolveVirusTotalStageStatus,
  type InspectionStageStatuses,
} from "./stage-status.js";

export interface InspectionPipelineState {
  findings: InspectionFinding[];
  skillSpector?: InspectionReport["skillSpector"];
  skillSpectorAvailable: boolean;
  virusTotal?: InspectionReport["virusTotal"];
  evaluation?: FunctionalEvaluationReport;
  failedStages: InspectionStageFailure[];
  completedStages: InspectionStage[];
  stageStatuses: InspectionStageStatuses;
}

export interface InspectionStageCompleteEvent {
  stage: InspectionStage;
  state: InspectionPipelineState;
  inspection: InspectionReport;
  evaluation?: FunctionalEvaluationReport;
}

export interface RunInspectionPipelineOptions {
  skipStages?: InspectionStage[];
  initialState?: Partial<InspectionPipelineState>;
  onStageComplete?: (event: InspectionStageCompleteEvent) => Promise<void>;
}

function createInitialPipelineState(initial?: Partial<InspectionPipelineState>): InspectionPipelineState {
  return {
    findings: initial?.findings ?? [],
    skillSpector: initial?.skillSpector,
    skillSpectorAvailable: initial?.skillSpectorAvailable ?? false,
    virusTotal: initial?.virusTotal,
    evaluation: initial?.evaluation,
    failedStages: initial?.failedStages ?? [],
    completedStages: initial?.completedStages ?? [],
    stageStatuses: { ...(initial?.stageStatuses ?? {}) },
  };
}

function shouldSkipStage(stage: InspectionStage, skipStages: InspectionStage[] | undefined): boolean {
  return skipStages?.includes(stage) ?? false;
}

function specValidationFindings(snapshot: SkillSnapshot): InspectionFinding[] {
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

function buildInspectionFromState(
  snapshot: SkillSnapshot,
  version: string,
  state: InspectionPipelineState
): InspectionReport {
  return {
    id: `inspection_${snapshot.contentHash.slice(0, 16)}_${Date.now()}`,
    skillSlug: getSkillSlug(snapshot.manifest),
    skillName: snapshot.manifest.name,
    version,
    contentHash: snapshot.contentHash,
    verdict: calculateInspectionVerdict(state.findings),
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
  state: InspectionPipelineState,
  stage: InspectionStage,
  onStageComplete: RunInspectionPipelineOptions["onStageComplete"]
): Promise<void> {
  if (!onStageComplete) {
    return;
  }
  await onStageComplete({
    stage,
    state,
    inspection: buildInspectionFromState(snapshot, version, state),
    evaluation: state.evaluation,
  });
}

async function runSkillSpectorStage(
  snapshot: SkillSnapshot,
  version: string,
  state: InspectionPipelineState,
  onStageComplete: RunInspectionPipelineOptions["onStageComplete"]
): Promise<void> {
  if (!isSkillSpectorEnabled()) {
    state.skillSpectorAvailable = false;
    return;
  }

  state.stageStatuses.skillspector = "processing";
  await emitStageComplete(snapshot, version, state, "skillspector", onStageComplete);

  let interrupted = false;
  try {
    const scan = await runSkillSpectorSecurityScan(snapshot);
    state.skillSpector = scan.summary;
    state.skillSpectorAvailable = true;
    state.findings.push(...scan.findings);
  } catch (error) {
    const message = truncateError(error);
    state.skillSpectorAvailable = false;
    interrupted = true;
    // Environment problem → stage failure (retryable), not a review finding.
    state.failedStages.push({ stage: "skillspector", message });
  }

  state.stageStatuses.skillspector = resolveSkillSpectorStageStatus(state.findings, interrupted);

  if (!state.completedStages.includes("skillspector")) {
    state.completedStages.push("skillspector");
  }
  await emitStageComplete(snapshot, version, state, "skillspector", onStageComplete);
}

async function runVirusTotalStage(
  snapshot: SkillSnapshot,
  version: string,
  state: InspectionPipelineState,
  onStageComplete: RunInspectionPipelineOptions["onStageComplete"]
): Promise<void> {
  if (!isVirusTotalEnabled()) {
    return;
  }

  state.stageStatuses.virustotal = "processing";
  await emitStageComplete(snapshot, version, state, "virustotal", onStageComplete);

  let interrupted = false;
  try {
    const scan = await runVirusTotalScan(snapshot);
    state.virusTotal = scan.summary;
    state.findings.push(...scan.findings);
  } catch (error) {
    const message = formatVirusTotalError(error);
    interrupted = true;
    // Integration error → stage failure, not a fabricated scan finding.
    state.failedStages.push({ stage: "virustotal", message });
  }

  state.stageStatuses.virustotal = resolveVirusTotalStageStatus(state.findings, interrupted);

  if (!state.completedStages.includes("virustotal")) {
    state.completedStages.push("virustotal");
  }
  await emitStageComplete(snapshot, version, state, "virustotal", onStageComplete);
}

function isHaluCatchEnabled(): boolean {
  return process.env.HALUCATCH_ENABLED?.toLowerCase() !== "false";
}

async function runHaluCatchStage(
  snapshot: SkillSnapshot,
  version: string,
  state: InspectionPipelineState,
  onStageComplete: RunInspectionPipelineOptions["onStageComplete"]
): Promise<void> {
  if (!isHaluCatchEnabled()) {
    return;
  }

  state.stageStatuses.halucatch = "processing";
  await emitStageComplete(snapshot, version, state, "halucatch", onStageComplete);

  let evaluation;
  let interrupted = false;
  try {
    evaluation = await evaluateSkillSnapshot(snapshot);
  } catch (error) {
    // Environment problem (Python / vendored runtime) → stage failure. Use the
    // static taskset evaluator only as a placeholder report; never fabricate a
    // "inspection-halucatch-unavailable" finding.
    evaluation = evaluateStaticTaskSet(snapshot);
    interrupted = true;
    state.failedStages.push({ stage: "halucatch", message: truncateError(error) });
  }
  state.evaluation = evaluation;
  state.stageStatuses.halucatch = resolveHaluCatchStageStatus(interrupted);

  if (!state.completedStages.includes("halucatch")) {
    state.completedStages.push("halucatch");
  }
  await emitStageComplete(snapshot, version, state, "halucatch", onStageComplete);
}

export async function runInspectionPipeline(
  snapshot: SkillSnapshot,
  versionOverride?: string,
  options: RunInspectionPipelineOptions = {}
): Promise<InspectionAndEvaluationResult> {
  const version = versionOverride ?? snapshot.manifest.version ?? "0.1.0";
  const skipStages = options.skipStages ?? [];
  const state = createInitialPipelineState(options.initialState);

  if (state.findings.length === 0) {
    state.findings.push(...specValidationFindings(snapshot));
  }

  const securityStages: Promise<void>[] = [];

  if (!shouldSkipStage("skillspector", skipStages)) {
    securityStages.push(runSkillSpectorStage(snapshot, version, state, options.onStageComplete));
  }

  if (!shouldSkipStage("virustotal", skipStages)) {
    securityStages.push(runVirusTotalStage(snapshot, version, state, options.onStageComplete));
  }

  if (securityStages.length > 0) {
    await Promise.all(securityStages);
  }

  if (!shouldSkipStage("halucatch", skipStages)) {
    await runHaluCatchStage(snapshot, version, state, options.onStageComplete);
  }

  const inspection = buildInspectionFromState(snapshot, version, state);
  const evaluation = state.evaluation ?? (await evaluateSkillSnapshot(snapshot));

  return {
    inspection,
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

export { resolveInspectionStagesToRun } from "./stage-status.js";

export function getConfiguredInspectionStages(): InspectionStage[] {
  const stages: InspectionStage[] = [];
  if (isSkillSpectorEnabled()) {
    stages.push("skillspector");
  }
  if (isVirusTotalEnabled()) {
    stages.push("virustotal");
  }
  if (isHaluCatchEnabled()) {
    stages.push("halucatch");
  }
  return stages;
}
