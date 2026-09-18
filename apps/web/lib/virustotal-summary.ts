import type { VirusTotalScanSummary, VirusTotalThreatVerdict } from "../lib/types";

const THREAT_VERDICT_LABELS: Record<VirusTotalThreatVerdict, string> = {
  VERDICT_MALICIOUS: "恶意",
  VERDICT_SUSPICIOUS: "可疑",
  VERDICT_UNDETECTED: "未检出威胁",
  VERDICT_UNKNOWN: "未知"
};

export function formatVirusTotalThreatVerdict(
  verdict: VirusTotalThreatVerdict | undefined
): string | undefined {
  if (!verdict) {
    return undefined;
  }
  return THREAT_VERDICT_LABELS[verdict] ?? verdict;
}

export function formatVirusTotalDetectionSummary(
  scan: Pick<VirusTotalScanSummary, "status" | "malicious" | "suspicious"> | undefined
): string {
  if (!scan) {
    return "-";
  }
  if (scan.status === "not_found") {
    return "未扫描";
  }
  const detections = scan.malicious + scan.suspicious;
  if (detections > 0) {
    return `${scan.malicious} 恶意 · ${scan.suspicious} 可疑`;
  }
  return "未检出";
}

/** Badge tone classes aligned with `.badge.passed` / `.partial` / `.rejected`. */
export function virusTotalDetectionBadgeClass(
  scan: Pick<VirusTotalScanSummary, "status" | "malicious" | "suspicious"> | undefined
): string | null {
  if (!scan || scan.status === "not_found") {
    return null;
  }
  const detections = scan.malicious + scan.suspicious;
  if (detections === 0) {
    return "passed";
  }
  if (scan.malicious > 0) {
    return "rejected";
  }
  return "partial";
}

export function resolveVirusTotalEngineTotal(
  summary: Pick<
    VirusTotalScanSummary,
    "malicious" | "suspicious" | "harmless" | "undetected" | "totalEngines"
  >
): number {
  if (summary.totalEngines > 0) {
    return summary.totalEngines;
  }
  return summary.malicious + summary.suspicious + summary.harmless + summary.undetected;
}
