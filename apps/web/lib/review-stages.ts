import type { SkillReviewStage } from "./types";

export const REVIEW_STAGE_ORDER: SkillReviewStage[] = ["skillspector", "virustotal", "halucatch"];

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

export function formatReviewStageProgress(
  completedStages: SkillReviewStage[] | undefined,
  failedStages: SkillReviewStage[] | undefined
): string {
  const completed = new Set(completedStages ?? []);
  const failed = new Set(failedStages ?? []);

  return REVIEW_STAGE_ORDER.map((stage) => {
    if (failed.has(stage)) {
      return `${skillReviewStageLabel(stage)}：失败`;
    }
    if (completed.has(stage)) {
      return `${skillReviewStageLabel(stage)}：已完成`;
    }
    return `${skillReviewStageLabel(stage)}：待审查`;
  }).join(" · ");
}
