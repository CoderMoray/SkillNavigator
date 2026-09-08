import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { resolveInspectionStageStates, type InspectionStageDisplayStatus } from "../lib/inspection-stages";
import type { SkillInspectionStage } from "../lib/types";

function StageStatusIcon({ status }: { status: InspectionStageDisplayStatus }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 size={14} aria-hidden="true" />;
    case "failed":
      return <XCircle size={14} aria-hidden="true" />;
    case "pending":
      return <CircleDashed size={14} aria-hidden="true" />;
  }
}

export function SkillInspectionProgress({
  completedStages,
  failedStages,
}: {
  completedStages?: SkillInspectionStage[];
  failedStages?: SkillInspectionStage[];
}) {
  const stages = resolveInspectionStageStates(completedStages, failedStages);

  return (
    <div className="skill-inspection-progress" role="status" aria-label="审查进度">
      <span className="skill-inspection-progress-label">审查进度</span>
      <div className="skill-inspection-progress-stages">
        {stages.map((entry) => (
          <span
            key={entry.stage}
            className={`skill-inspection-stage skill-inspection-stage--${entry.status}`}
            title={`${entry.label}：${entry.statusLabel}`}
          >
            <StageStatusIcon status={entry.status} />
            <span className="skill-inspection-stage-name">{entry.label}</span>
            <span className="skill-inspection-stage-status">{entry.statusLabel}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
