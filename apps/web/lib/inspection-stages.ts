import type { InspectionStageStatuses, SkillInspectionStage } from "./types";

export const INSPECTION_STAGE_ORDER: SkillInspectionStage[] = ["skillspector", "virustotal", "halucatch"];

export type InspectionStageDisplayStatus =
  | "passed"
  | "done"
  | "processing"
  | "interrupted"
  | "rejected";

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

function inspectionStageStatusLabel(
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

export function resolveInspectionStageStates(
  stageStatuses: InspectionStageStatuses | undefined
): InspectionStageState[] {
  return INSPECTION_STAGE_ORDER.map((stage) => {
    const status = (stageStatuses?.[stage] ?? "processing") as InspectionStageDisplayStatus;

    return {
      stage,
      label: skillInspectionStageLabel(stage),
      status,
      statusLabel: inspectionStageStatusLabel(stage, status),
    };
  });
}

export function formatInspectionStageProgress(stageStatuses: InspectionStageStatuses | undefined): string {
  return resolveInspectionStageStates(stageStatuses)
    .map((entry) => `${entry.label}: ${entry.status}`)
    .join(" · ");
}
