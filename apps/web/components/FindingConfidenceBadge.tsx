import type { InspectionFinding } from "../lib/types";
import { formatFindingConfidence } from "../lib/finding-confidence";

export function FindingConfidenceBadge({ finding }: { finding: InspectionFinding }) {
  const label = formatFindingConfidence(finding.confidence);
  if (!label) {
    return null;
  }

  return <span className="badge finding-confidence">置信度 {label}</span>;
}
