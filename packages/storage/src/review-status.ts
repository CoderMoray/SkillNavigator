export const SKILL_REVIEW_STATUSES = ["reviewing", "completed", "failed"] as const;

export type SkillReviewStatus = (typeof SKILL_REVIEW_STATUSES)[number];

export const SKILL_REVIEW_STAGES = ["halucatch", "skillspector", "virustotal"] as const;

export type SkillReviewStage = (typeof SKILL_REVIEW_STAGES)[number];

export const DEFAULT_SKILL_REVIEW_STATUS: SkillReviewStatus = "completed";

export interface SkillReviewFailureInfo {
  stages: SkillReviewStage[];
  message: string;
}

export function isSkillReviewStatus(value: string): value is SkillReviewStatus {
  return (SKILL_REVIEW_STATUSES as readonly string[]).includes(value);
}

export function isSkillReviewStage(value: string): value is SkillReviewStage {
  return (SKILL_REVIEW_STAGES as readonly string[]).includes(value);
}

export function isReviewPendingSkillStatus(reviewStatus: SkillReviewStatus): boolean {
  return reviewStatus === "reviewing" || reviewStatus === "failed";
}

export function skillReviewStatusLabel(status: SkillReviewStatus): string {
  switch (status) {
    case "reviewing":
      return "审查中";
    case "completed":
      return "审查完成";
    case "failed":
      return "审查失败";
  }
}

export function skillReviewStageLabel(stage: SkillReviewStage): string {
  switch (stage) {
    case "skillspector":
      return "SkillSpector";
    case "virustotal":
      return "VirusTotal";
    case "halucatch":
      return "HaluCatch";
  }
}

export function parseSkillReviewStages(values: string[] | null | undefined): SkillReviewStage[] {
  if (!values?.length) {
    return [];
  }
  return values.filter(isSkillReviewStage);
}

export function buildSkillReviewFailureFromStages(
  failedStages: ReadonlyArray<{ stage: string; message: string }>
): SkillReviewFailureInfo {
  const stages = [
    ...new Set(failedStages.map((item) => item.stage).filter(isSkillReviewStage)),
  ];
  const message = failedStages.length
    ? failedStages
        .map((item) => {
          const label = isSkillReviewStage(item.stage)
            ? skillReviewStageLabel(item.stage)
            : item.stage;
          return `${label}：${item.message}`;
        })
        .join("；")
    : "审查流程未完成";

  return { stages, message };
}

export function buildSkillReviewFailureFromError(error: unknown): SkillReviewFailureInfo {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw === "skill_review_in_progress") {
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

export function formatSkillReviewFailureSummary(failure: SkillReviewFailureInfo): string {
  if (failure.stages.length === 0) {
    return failure.message;
  }
  return `${failure.stages.map(skillReviewStageLabel).join("、")}：${failure.message}`;
}

const DEFAULT_REVIEW_STALE_MS = 30 * 60 * 1000;

export function readReviewStaleMs(): number {
  const raw = process.env.REVIEW_STALE_MS?.trim();
  if (!raw) {
    return DEFAULT_REVIEW_STALE_MS;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REVIEW_STALE_MS;
}

export function readReviewRecoverAllOnStartup(): boolean {
  return process.env.REVIEW_RECOVER_ALL_ON_STARTUP?.toLowerCase() !== "false";
}

export const REVIEW_INTERRUPTED_MESSAGE = "审查任务因服务重启中断，请重试未完成或失败的审查环节。";
export const REVIEW_STALE_MESSAGE = "审查超时未完成，请重试未完成或失败的审查环节。";
