import type { InspectionFinding } from "./inspection-verdict.js";
import {
  isSkillSpectorInspectionFinding,
  isVirusTotalInspectionFinding,
  shouldRejectSkillSpectorFinding,
  shouldRejectVirusTotalFinding,
} from "./inspection-verdict.js";

export type InspectionStage = "skillspector" | "virustotal" | "halucatch";

export type SkillSpectorStageStatus = "passed" | "interrupted" | "rejected" | "processing";
export type VirusTotalStageStatus = "passed" | "interrupted" | "rejected" | "processing";
export type HaluCatchStageStatus = "done" | "interrupted" | "processing";

export interface InspectionStageStatuses {
  skillspector?: SkillSpectorStageStatus;
  virustotal?: VirusTotalStageStatus;
  halucatch?: HaluCatchStageStatus;
}

const TERMINAL_SKILLSPECTOR: ReadonlySet<SkillSpectorStageStatus> = new Set([
  "passed",
  "interrupted",
  "rejected",
]);
const TERMINAL_VIRUSTOTAL: ReadonlySet<VirusTotalStageStatus> = new Set([
  "passed",
  "interrupted",
  "rejected",
]);
const TERMINAL_HALUCATCH: ReadonlySet<HaluCatchStageStatus> = new Set(["done", "interrupted"]);

export function isTerminalStageStatus(
  stage: InspectionStage,
  status: string | undefined
): boolean {
  if (!status) {
    return false;
  }
  switch (stage) {
    case "skillspector":
      return TERMINAL_SKILLSPECTOR.has(status as SkillSpectorStageStatus);
    case "virustotal":
      return TERMINAL_VIRUSTOTAL.has(status as VirusTotalStageStatus);
    case "halucatch":
      return TERMINAL_HALUCATCH.has(status as HaluCatchStageStatus);
  }
}

export function isStageRetryable(
  stage: InspectionStage,
  status: string | undefined
): boolean {
  return !status || status === "processing" || status === "interrupted";
}

export function resolveSkillSpectorStageStatus(
  findings: InspectionFinding[],
  interrupted: boolean
): SkillSpectorStageStatus {
  if (interrupted) {
    return "interrupted";
  }
  const stageFindings = findings.filter(isSkillSpectorInspectionFinding);
  if (stageFindings.some(shouldRejectSkillSpectorFinding)) {
    return "rejected";
  }
  return "passed";
}

export function resolveVirusTotalStageStatus(
  findings: InspectionFinding[],
  interrupted: boolean
): VirusTotalStageStatus {
  if (interrupted) {
    return "interrupted";
  }
  const stageFindings = findings.filter(isVirusTotalInspectionFinding);
  if (stageFindings.some(shouldRejectVirusTotalFinding)) {
    return "rejected";
  }
  return "passed";
}

export function resolveHaluCatchStageStatus(interrupted: boolean): HaluCatchStageStatus {
  return interrupted ? "interrupted" : "done";
}

export function resolveInspectionStagesToRun(input: {
  configuredStages: InspectionStage[];
  stageStatuses: Partial<InspectionStageStatuses>;
  requestedStages?: InspectionStage[];
}): InspectionStage[] {
  const { configuredStages, stageStatuses, requestedStages } = input;

  const defaultStages = configuredStages.filter((stage) =>
    isStageRetryable(stage, stageStatuses[stage])
  );
  if (!requestedStages?.length) {
    return defaultStages;
  }

  const requested = new Set(requestedStages);
  return defaultStages.filter((stage) => requested.has(stage));
}

export function resolveAggregateStatusFromStageStatuses(input: {
  inFlight: boolean;
  stageStatuses: Partial<InspectionStageStatuses>;
  configuredStages: InspectionStage[];
  verdict?: string | null;
  inspectionStatus?: string | null;
}): "inspecting" | "completed" | "interrupted" | "rejected" {
  if (input.inFlight) {
    return "inspecting";
  }

  const statuses = input.configuredStages
    .map((stage) => input.stageStatuses[stage])
    .filter(Boolean);

  if (statuses.some((status) => status === "processing")) {
    return "inspecting";
  }
  if (statuses.some((status) => status === "interrupted")) {
    return "interrupted";
  }
  if (
    statuses.some((status) => status === "rejected") ||
    input.verdict === "rejected" ||
    input.inspectionStatus === "rejected"
  ) {
    return "rejected";
  }

  const allTerminal = input.configuredStages.every((stage) =>
    isTerminalStageStatus(stage, input.stageStatuses[stage])
  );
  if (allTerminal && input.configuredStages.length > 0) {
    return "completed";
  }

  if (input.inspectionStatus === "interrupted") {
    return "interrupted";
  }

  return "completed";
}
