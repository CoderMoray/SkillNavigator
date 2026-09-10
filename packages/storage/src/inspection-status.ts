export const SKILL_INSPECTION_STATUSES = ["inspecting", "completed", "interrupted", "rejected"] as const;

export type SkillInspectionStatus = (typeof SKILL_INSPECTION_STATUSES)[number];

/** @deprecated Legacy DB/API value; normalized to interrupted or rejected at read time. */
export const LEGACY_SKILL_INSPECTION_FAILED = "failed" as const;

export type InspectionAggregateDisplayStatus = "inspecting" | "completed" | "interrupted" | "rejected";

export type SkillSpectorStageStatus = "passed" | "interrupted" | "rejected" | "processing";
export type VirusTotalStageStatus = "passed" | "interrupted" | "rejected" | "processing";
export type HaluCatchStageStatus = "done" | "interrupted" | "processing";

export type InspectionStageDisplayStatus =
  | SkillSpectorStageStatus
  | VirusTotalStageStatus
  | HaluCatchStageStatus;

export interface InspectionStageStatuses {
  skillspector?: SkillSpectorStageStatus;
  virustotal?: VirusTotalStageStatus;
  halucatch?: HaluCatchStageStatus;
}

export const SKILL_INSPECTION_STAGES = ["skillspector", "virustotal", "halucatch"] as const;

export type SkillInspectionStage = (typeof SKILL_INSPECTION_STAGES)[number];

export const DEFAULT_SKILL_INSPECTION_STATUS: SkillInspectionStatus = "completed";

export interface SkillInspectionFailureInfo {
  stages: SkillInspectionStage[];
  message: string;
}

export function isSkillInspectionStatus(value: string): value is SkillInspectionStatus {
  return (SKILL_INSPECTION_STATUSES as readonly string[]).includes(value);
}

export function isSkillInspectionStage(value: string): value is SkillInspectionStage {
  return (SKILL_INSPECTION_STAGES as readonly string[]).includes(value);
}

export function normalizeSkillInspectionStatus(value: string | undefined | null): SkillInspectionStatus {
  const raw = String(value ?? "").trim();
  if (raw === LEGACY_SKILL_INSPECTION_FAILED) {
    return "interrupted";
  }
  if (isSkillInspectionStatus(raw)) {
    return raw;
  }
  return DEFAULT_SKILL_INSPECTION_STATUS;
}

export function isInspectionFailureStatus(
  inspectionStatus: string | undefined | null
): inspectionStatus is "interrupted" | "rejected" {
  const normalized = normalizeSkillInspectionStatus(inspectionStatus);
  return normalized === "interrupted" || normalized === "rejected";
}

export function isInspectionPendingSkillStatus(inspectionStatus: SkillInspectionStatus): boolean {
  return inspectionStatus === "inspecting" || isInspectionFailureStatus(inspectionStatus);
}

export function skillInspectionStatusLabel(status: SkillInspectionStatus): string {
  switch (status) {
    case "inspecting":
      return "审查中";
    case "completed":
      return "审查完成";
    case "interrupted":
      return "审查中断";
    case "rejected":
      return "审查拒绝";
  }
}

export function inspectionAggregateStatusLabel(status: InspectionAggregateDisplayStatus): string {
  return skillInspectionStatusLabel(status);
}

export function isInspectionInFlight(input: {
  inspectionStatus: string | undefined | null;
  inspectionStartedAt?: string | null;
  inspectionEndedAt?: string | null;
}): boolean {
  const status = normalizeSkillInspectionStatus(input.inspectionStatus);
  if (status === "inspecting") {
    return true;
  }
  return Boolean(input.inspectionStartedAt && !input.inspectionEndedAt);
}

function isSkillSpectorStageStatus(value: string): value is SkillSpectorStageStatus {
  return value === "passed" || value === "interrupted" || value === "rejected" || value === "processing";
}

function isVirusTotalStageStatus(value: string): value is VirusTotalStageStatus {
  return value === "passed" || value === "interrupted" || value === "rejected" || value === "processing";
}

function isHaluCatchStageStatus(value: string): value is HaluCatchStageStatus {
  return value === "done" || value === "interrupted" || value === "processing";
}

export function parseInspectionStageStatuses(input: {
  skillspector?: string | null;
  virustotal?: string | null;
  halucatch?: string | null;
}): InspectionStageStatuses {
  const statuses: InspectionStageStatuses = {};
  const skillspector = String(input.skillspector ?? "").trim();
  const virustotal = String(input.virustotal ?? "").trim();
  const halucatch = String(input.halucatch ?? "").trim();
  if (skillspector && isSkillSpectorStageStatus(skillspector)) {
    statuses.skillspector = skillspector;
  }
  if (virustotal && isVirusTotalStageStatus(virustotal)) {
    statuses.virustotal = virustotal;
  }
  if (halucatch && isHaluCatchStageStatus(halucatch)) {
    statuses.halucatch = halucatch;
  }
  return statuses;
}

export function mapStageStatusesToColumns(statuses: Partial<InspectionStageStatuses>): {
  inspectionSkillspectorStatus: string | null;
  inspectionVirustotalStatus: string | null;
  inspectionHalucatchStatus: string | null;
} {
  return {
    inspectionSkillspectorStatus: statuses.skillspector ?? null,
    inspectionVirustotalStatus: statuses.virustotal ?? null,
    inspectionHalucatchStatus: statuses.halucatch ?? null,
  };
}

export function interruptInFlightStageStatuses(
  statuses: Partial<InspectionStageStatuses>
): InspectionStageStatuses {
  const next: InspectionStageStatuses = { ...statuses };
  for (const stage of SKILL_INSPECTION_STAGES) {
    if (next[stage] === "processing") {
      next[stage] = "interrupted";
    }
  }
  return next;
}

export function inspectionStageStatusLabel(
  stage: SkillInspectionStage,
  status: InspectionStageDisplayStatus
): string {
  switch (status) {
    case "passed":
      return "通过";
    case "done":
      return "完成";
    case "processing":
      return "审查中";
    case "interrupted":
      return "中断";
    case "rejected":
      return "未通过";
  }
}

/** User-facing aggregate status for skillnav / API (inspecting while in-flight). */
export function resolveInspectionAggregateStatus(input: {
  inspectionStatus: string | undefined | null;
  inspectionStartedAt?: string | null;
  inspectionEndedAt?: string | null;
  versionStatus?: string | null;
  verdict?: string | null;
  stageStatuses?: Partial<InspectionStageStatuses>;
}): InspectionAggregateDisplayStatus {
  const inFlight = isInspectionInFlight({
    inspectionStatus: input.inspectionStatus,
    inspectionStartedAt: input.inspectionStartedAt,
    inspectionEndedAt: input.inspectionEndedAt,
  });

  const stageValues = Object.values(input.stageStatuses ?? {}).filter(Boolean);
  if (inFlight || stageValues.some((value) => value === "processing")) {
    return "inspecting";
  }

  const status = normalizeSkillInspectionStatus(input.inspectionStatus);
  const verdict = String(input.verdict ?? input.versionStatus ?? "").trim();

  if (stageValues.some((value) => value === "interrupted") || status === "interrupted") {
    return "interrupted";
  }
  if (stageValues.some((value) => value === "rejected") || status === "rejected" || verdict === "rejected") {
    return "rejected";
  }
  return "completed";
}

/** Pipeline / runtime failures mean the inspection did not finish — never "rejected". */
export function classifyInspectionFailureStatus(
  _failure: SkillInspectionFailureInfo | undefined,
  _versionStatus?: string
): "interrupted" {
  return "interrupted";
}

export function skillInspectionStageLabel(stage: SkillInspectionStage): string {
  switch (stage) {
    case "skillspector":
      return "SkillSpector";
    case "virustotal":
      return "VirusTotal";
    case "halucatch":
      return "HaluCatch";
  }
}

export function parseSkillInspectionStages(values: string[] | null | undefined): SkillInspectionStage[] {
  if (!values?.length) {
    return [];
  }
  return values.filter(isSkillInspectionStage);
}

export function buildSkillInspectionFailureFromStages(
  failedStages: ReadonlyArray<{ stage: string; message: string }>
): SkillInspectionFailureInfo {
  const stages = [
    ...new Set(failedStages.map((item) => item.stage).filter(isSkillInspectionStage)),
  ];
  const message = failedStages.length
    ? failedStages
        .map((item) => {
          const label = isSkillInspectionStage(item.stage)
            ? skillInspectionStageLabel(item.stage)
            : item.stage;
          return `${label}：${item.message}`;
        })
        .join("；")
    : "审查流程未完成";

  return { stages, message };
}

export function buildSkillInspectionFailureFromError(error: unknown): SkillInspectionFailureInfo {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw === "skill_inspection_in_progress") {
    return {
      stages: [],
      message: "审查状态冲突：Skill 仍处于审查中，无法完成入库。请稍后重试发布。",
    };
  }

  const message = raw.length <= 500 ? raw : `${raw.slice(0, 497)}...`;
  const lower = message.toLowerCase();
  const stages = [
    ...(lower.includes("skillspector") ? (["skillspector"] as const) : []),
    ...(lower.includes("virustotal") ? (["virustotal"] as const) : []),
    ...(lower.includes("halucatch") ? (["halucatch"] as const) : []),
  ];

  return {
    stages: [...new Set(stages)],
    message: stages.length > 0 ? message : `审查流程异常中断：${message}`,
  };
}

export function formatSkillInspectionFailureSummary(failure: SkillInspectionFailureInfo): string {
  if (failure.stages.length === 0) {
    return failure.message;
  }
  return `${failure.stages.map(skillInspectionStageLabel).join("、")}：${failure.message}`;
}

const DEFAULT_INSPECTION_STALE_MS = 30 * 60 * 1000;

export function readInspectionStaleMs(): number {
  const raw =
    process.env.INSPECTION_STALE_MS?.trim() ??
    process.env.REVIEW_STALE_MS?.trim();
  if (!raw) {
    return DEFAULT_INSPECTION_STALE_MS;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INSPECTION_STALE_MS;
}

export function readInspectionRecoverAllOnStartup(): boolean {
  const value =
    process.env.INSPECTION_RECOVER_ALL_ON_STARTUP ??
    process.env.REVIEW_RECOVER_ALL_ON_STARTUP;
  return value?.toLowerCase() !== "false";
}

export const INSPECTION_INTERRUPTED_MESSAGE = "审查任务因服务重启中断，请重试未完成或失败的审查环节。";
export const INSPECTION_STALE_MESSAGE = "审查超时未完成，请重试未完成或失败的审查环节。";
export const INSPECTION_SUPERSEDED_MESSAGE =
  "该版本审查已被更新的 latest 版本取代，无需重审；请查看当前 latest 版本的审查状态。";
