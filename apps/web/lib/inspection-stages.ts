import type { SkillInspectionStage } from "./types";

export const INSPECTION_STAGE_ORDER: SkillInspectionStage[] = ["skillspector", "virustotal", "halucatch"];

export type InspectionStageDisplayStatus = "completed" | "failed" | "pending";

export interface InspectionStageState {
  stage: SkillInspectionStage;
  label: string;
  status: InspectionStageDisplayStatus;
  statusLabel: string;
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

function inspectionStageStatusLabel(status: InspectionStageDisplayStatus): string {
  switch (status) {
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "pending":
      return "待审查";
  }
}

export function resolveInspectionStageStates(
  completedStages: SkillInspectionStage[] | undefined,
  failedStages: SkillInspectionStage[] | undefined
): InspectionStageState[] {
  const completed = new Set(completedStages ?? []);
  const failed = new Set(failedStages ?? []);

  return INSPECTION_STAGE_ORDER.map((stage) => {
    const status: InspectionStageDisplayStatus = failed.has(stage)
      ? "failed"
      : completed.has(stage)
        ? "completed"
        : "pending";

    return {
      stage,
      label: skillInspectionStageLabel(stage),
      status,
      statusLabel: inspectionStageStatusLabel(status),
    };
  });
}

export function formatInspectionStageProgress(
  completedStages: SkillInspectionStage[] | undefined,
  failedStages: SkillInspectionStage[] | undefined
): string {
  return resolveInspectionStageStates(completedStages, failedStages)
    .map((entry) => `${entry.label}：${entry.statusLabel}`)
    .join(" · ");
}
