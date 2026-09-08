export const SKILL_INSPECTION_STATUSES = ["inspecting", "completed", "failed"] as const;

export type SkillInspectionStatus = (typeof SKILL_INSPECTION_STATUSES)[number];

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

export function isInspectionPendingSkillStatus(inspectionStatus: SkillInspectionStatus): boolean {
  return inspectionStatus === "inspecting" || inspectionStatus === "failed";
}

export function skillInspectionStatusLabel(status: SkillInspectionStatus): string {
  switch (status) {
    case "inspecting":
      return "审查中";
    case "completed":
      return "审查完成";
    case "failed":
      return "审查失败";
  }
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
