import type { SkillReviewStage } from "./types";

export const REVIEW_STAGE_ORDER: SkillReviewStage[] = ["halucatch", "skillspector", "virustotal"];

export type ReviewStageDisplayStatus = "completed" | "failed" | "pending";

export interface ReviewStageState {
  stage: SkillReviewStage;
  label: string;
  status: ReviewStageDisplayStatus;
  statusLabel: string;
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

function reviewStageStatusLabel(status: ReviewStageDisplayStatus): string {
  switch (status) {
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "pending":
      return "待审查";
  }
}

export function resolveReviewStageStates(
  completedStages: SkillReviewStage[] | undefined,
  failedStages: SkillReviewStage[] | undefined
): ReviewStageState[] {
  const completed = new Set(completedStages ?? []);
  const failed = new Set(failedStages ?? []);

  return REVIEW_STAGE_ORDER.map((stage) => {
    const status: ReviewStageDisplayStatus = failed.has(stage)
      ? "failed"
      : completed.has(stage)
        ? "completed"
        : "pending";

    return {
      stage,
      label: skillReviewStageLabel(stage),
      status,
      statusLabel: reviewStageStatusLabel(status),
    };
  });
}

export function formatReviewStageProgress(
  completedStages: SkillReviewStage[] | undefined,
  failedStages: SkillReviewStage[] | undefined
): string {
  return resolveReviewStageStates(completedStages, failedStages)
    .map((entry) => `${entry.label}：${entry.statusLabel}`)
    .join(" · ");
}
