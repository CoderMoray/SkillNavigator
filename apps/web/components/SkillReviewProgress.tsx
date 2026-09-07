import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { resolveReviewStageStates, type ReviewStageDisplayStatus } from "../lib/review-stages";
import type { SkillReviewStage } from "../lib/types";

function StageStatusIcon({ status }: { status: ReviewStageDisplayStatus }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 size={14} aria-hidden="true" />;
    case "failed":
      return <XCircle size={14} aria-hidden="true" />;
    case "pending":
      return <CircleDashed size={14} aria-hidden="true" />;
  }
}

export function SkillReviewProgress({
  completedStages,
  failedStages,
}: {
  completedStages?: SkillReviewStage[];
  failedStages?: SkillReviewStage[];
}) {
  const stages = resolveReviewStageStates(completedStages, failedStages);

  return (
    <div className="skill-review-progress" role="status" aria-label="审查进度">
      <span className="skill-review-progress-label">审查进度</span>
      <div className="skill-review-progress-stages">
        {stages.map((entry) => (
          <span
            key={entry.stage}
            className={`skill-review-stage skill-review-stage--${entry.status}`}
            title={`${entry.label}：${entry.statusLabel}`}
          >
            <StageStatusIcon status={entry.status} />
            <span className="skill-review-stage-name">{entry.label}</span>
            <span className="skill-review-stage-status">{entry.statusLabel}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
