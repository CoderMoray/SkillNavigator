import type { InspectionScores } from "./types";

const scoreKeys: Array<keyof InspectionScores> = [
  "qualityScore",
  "securityScore",
  "reliabilityScore"
];

export function averageInspectionScores(items: Array<{ scores: InspectionScores }>): InspectionScores | undefined {
  if (items.length === 0) {
    return undefined;
  }

  const totals = Object.fromEntries(scoreKeys.map((key) => [key, 0])) as Record<keyof InspectionScores, number>;
  for (const item of items) {
    for (const key of scoreKeys) {
      totals[key] += item.scores[key];
    }
  }

  const count = items.length;
  return {
    qualityScore: Math.round(totals.qualityScore / count),
    securityScore: Math.round(totals.securityScore / count),
    reliabilityScore: Math.round(totals.reliabilityScore / count)
  };
}
