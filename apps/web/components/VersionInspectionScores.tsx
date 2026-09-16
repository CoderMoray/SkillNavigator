import {
  displayInspectionScore,
  resolveVersionInspectionScoreParts
} from "../lib/version-inspection-scores";
import type { FunctionalEvaluationReport, InspectionReport } from "../lib/types";

const VERSION_INSPECTION_SCORE_ITEMS = [
  { key: "skillSpector", label: "SkillSpector" },
  { key: "virusTotal", label: "VirusTotal" },
  { key: "haluCatch", label: "HaluCatch" }
] as const;

interface VersionInspectionScoresProps {
  inspection: InspectionReport | undefined;
  evaluation: FunctionalEvaluationReport | undefined;
}

export function VersionInspectionScores({ inspection, evaluation }: VersionInspectionScoresProps) {
  const parts = resolveVersionInspectionScoreParts(inspection, evaluation);

  return (
    <div className="version-score-grid" onClick={(event) => event.stopPropagation()}>
      {VERSION_INSPECTION_SCORE_ITEMS.map(({ key, label }) => {
        const rawScore = parts[key];
        const displayScore = displayInspectionScore(rawScore);
        const unavailable = displayScore === "—";

        return (
          <div className="version-score-item" key={key}>
            <span className="version-score-label">{label}</span>
            <strong
              aria-label={`${label} ${unavailable ? "暂无数据" : displayScore}`}
              className={`version-score-value${unavailable ? " is-muted" : ""}`}
            >
              {displayScore}
            </strong>
          </div>
        );
      })}
    </div>
  );
}
