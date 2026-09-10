import { CheckCircle2, CircleDashed, LoaderCircle, OctagonX, TriangleAlert } from "lucide-react";
import { resolveInspectionStageStates, type InspectionStageDisplayStatus } from "../lib/inspection-stages";
import type { InspectionStageStatuses } from "../lib/types";

function StageStatusIcon({ status }: { status: InspectionStageDisplayStatus }) {
  switch (status) {
    case "passed":
    case "done":
      return <CheckCircle2 size={14} aria-hidden="true" />;
    case "rejected":
      return <OctagonX size={14} aria-hidden="true" />;
    case "interrupted":
      return <TriangleAlert size={14} aria-hidden="true" />;
    case "processing":
      return <LoaderCircle size={14} aria-hidden="true" className="skill-inspection-stage-spinner" />;
    default:
      return <CircleDashed size={14} aria-hidden="true" />;
  }
}

export function SkillInspectionProgress({
  stageStatuses,
}: {
  stageStatuses?: InspectionStageStatuses;
}) {
  const stages = resolveInspectionStageStates(stageStatuses);

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
