import { parseThreatVerdict, resolveVirusTotalEngineTotal, type VirusTotalScanSummary } from "@skill-platform/inspection-engine";

export interface VirusTotalReviewColumns {
  virustotalProvider: string | null;
  virustotalSha256: string | null;
  virustotalAnalysisId: string | null;
  virustotalStatus: string | null;
  virustotalMalicious: number | null;
  virustotalSuspicious: number | null;
  virustotalHarmless: number | null;
  virustotalUndetected: number | null;
  virustotalTotalEngines: number | null;
  virustotalAnalysisUrl: string | null;
  virustotalError: string | null;
  virustotalThreatVerdict: string | null;
}

export function virusTotalInspectionColumns(
  summary: VirusTotalScanSummary | undefined
): VirusTotalReviewColumns {
  if (!summary) {
    return {
      virustotalProvider: null,
      virustotalSha256: null,
      virustotalAnalysisId: null,
      virustotalStatus: null,
      virustotalMalicious: null,
      virustotalSuspicious: null,
      virustotalHarmless: null,
      virustotalUndetected: null,
      virustotalTotalEngines: null,
      virustotalAnalysisUrl: null,
      virustotalError: null,
      virustotalThreatVerdict: null
    };
  }

  return {
    virustotalProvider: summary.provider,
    virustotalSha256: summary.sha256 || null,
    virustotalAnalysisId: summary.analysisId ?? null,
    virustotalStatus: summary.status,
    virustotalMalicious: summary.malicious,
    virustotalSuspicious: summary.suspicious,
    virustotalHarmless: summary.harmless,
    virustotalUndetected: summary.undetected,
    virustotalTotalEngines: summary.totalEngines,
    virustotalAnalysisUrl: summary.analysisUrl ?? null,
    virustotalError: summary.error ?? null,
    virustotalThreatVerdict: summary.threatVerdict ?? null
  };
}

export function parseVirusTotalInspectionRow(row: {
  virustotalProvider?: string | null;
  virustotalSha256?: string | null;
  virustotalAnalysisId?: string | null;
  virustotalStatus?: string | null;
  virustotalMalicious?: number | null;
  virustotalSuspicious?: number | null;
  virustotalHarmless?: number | null;
  virustotalUndetected?: number | null;
  virustotalTotalEngines?: number | null;
  virustotalAnalysisUrl?: string | null;
  virustotalError?: string | null;
  virustotalThreatVerdict?: string | null;
}): VirusTotalScanSummary | undefined {
  if (!row.virustotalStatus) {
    return undefined;
  }
  if (!row.virustotalSha256 && row.virustotalStatus !== "failed") {
    return undefined;
  }

  // `pending` survives a round-trip deliberately: the deferred-flow sweep needs
  // the stored hash to fetch the report, and a version whose VT stage is still
  // processing must not read back as "completed".
  const status: VirusTotalScanSummary["status"] =
    row.virustotalStatus === "not_found"
      ? "not_found"
      : row.virustotalStatus === "failed"
        ? "failed"
        : row.virustotalStatus === "pending"
          ? "pending"
          : "completed";

  const threatVerdict = parseThreatVerdict(row.virustotalThreatVerdict);
  const summary = {
    provider: (row.virustotalProvider as VirusTotalScanSummary["provider"]) ?? "virustotal",
    sha256: row.virustotalSha256 ?? "",
    status,
    malicious: Number(row.virustotalMalicious ?? 0),
    suspicious: Number(row.virustotalSuspicious ?? 0),
    harmless: Number(row.virustotalHarmless ?? 0),
    undetected: Number(row.virustotalUndetected ?? 0),
    totalEngines: Number(row.virustotalTotalEngines ?? 0)
  } satisfies Pick<
    VirusTotalScanSummary,
    "provider" | "sha256" | "status" | "malicious" | "suspicious" | "harmless" | "undetected" | "totalEngines"
  >;

  return {
    ...summary,
    totalEngines: resolveVirusTotalEngineTotal(summary),
    ...(row.virustotalAnalysisId ? { analysisId: row.virustotalAnalysisId } : {}),
    ...(row.virustotalAnalysisUrl ? { analysisUrl: row.virustotalAnalysisUrl } : {}),
    ...(row.virustotalError ? { error: row.virustotalError } : {}),
    ...(threatVerdict ? { threatVerdict } : {})
  };
}
