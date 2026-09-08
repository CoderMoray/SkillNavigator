import { createHash } from "node:crypto";
import { skillSnapshotToZipBuffer, type SkillSnapshot } from "@skill-platform/skill-spec";
import type { InspectionFinding } from "./index.js";

const VIRUSTOTAL_API_BASE_URL = "https://www.virustotal.com/api/v3";
const VIRUSTOTAL_GUI_BASE_URL = "https://www.virustotal.com/gui/file";
const DIRECT_UPLOAD_LIMIT_BYTES = 32 * 1024 * 1024;
const MAX_UPLOAD_LIMIT_BYTES = 650 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_POLL_INTERVAL_MS = 30_000;

type VirusTotalStep =
  | "file_lookup"
  | "upload_url_request"
  | "file_upload"
  | "analysis_poll"
  | "file_metadata_lookup";

const STEP_TIMEOUT_ENV: Record<VirusTotalStep, string> = {
  file_lookup: "VIRUSTOTAL_LOOKUP_TIMEOUT_MS",
  upload_url_request: "VIRUSTOTAL_UPLOAD_URL_TIMEOUT_MS",
  file_upload: "VIRUSTOTAL_UPLOAD_TIMEOUT_MS",
  analysis_poll: "VIRUSTOTAL_ANALYSIS_POLL_TIMEOUT_MS",
  file_metadata_lookup: "VIRUSTOTAL_METADATA_LOOKUP_TIMEOUT_MS"
};

const STEP_TIMEOUT_DEFAULT_MS: Record<VirusTotalStep, number> = {
  file_lookup: 30_000,
  upload_url_request: 30_000,
  file_upload: 120_000,
  analysis_poll: 30_000,
  file_metadata_lookup: 30_000
};

interface VirusTotalErrorDiagnosis {
  kind: "timeout" | "network" | "rate_limit" | "auth" | "client" | "server" | "analysis" | "unknown";
  retryable: boolean;
  detail: string;
}

class VirusTotalHttpError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "VirusTotalHttpError";
  }
}

class VirusTotalStepError extends Error {
  constructor(
    readonly step: VirusTotalStep,
    readonly action: string,
    readonly diagnosis: VirusTotalErrorDiagnosis,
    cause: unknown
  ) {
    super(formatVirusTotalStepFailure(step, action, diagnosis, cause));
    this.name = "VirusTotalStepError";
    this.cause = cause;
  }
}

export type VirusTotalScanStatus = "completed" | "not_found" | "failed";

export type VirusTotalThreatVerdict =
  | "VERDICT_UNKNOWN"
  | "VERDICT_UNDETECTED"
  | "VERDICT_SUSPICIOUS"
  | "VERDICT_MALICIOUS";

const VIRUSTOTAL_THREAT_VERDICTS = new Set<VirusTotalThreatVerdict>([
  "VERDICT_UNKNOWN",
  "VERDICT_UNDETECTED",
  "VERDICT_SUSPICIOUS",
  "VERDICT_MALICIOUS"
]);

export interface VirusTotalEngineResult {
  engine: string;
  category: string;
  result: string;
  method?: string;
  engineUpdate?: string;
}

export interface VirusTotalScanSummary {
  provider: "virustotal";
  sha256: string;
  status: VirusTotalScanStatus;
  malicious: number;
  suspicious: number;
  harmless: number;
  undetected: number;
  totalEngines: number;
  analysisUrl?: string;
  error?: string;
  threatVerdict?: VirusTotalThreatVerdict;
  engineResults?: VirusTotalEngineResult[];
}

interface VirusTotalStats {
  malicious: number;
  suspicious: number;
  harmless: number;
  undetected: number;
  totalEngines: number;
}

interface VirusTotalReport {
  stats: VirusTotalStats;
  engineResults: VirusTotalEngineResult[];
  threatVerdict?: VirusTotalThreatVerdict;
}

export function isVirusTotalEnabled(): boolean {
  return Boolean(readApiKey()) && process.env.VIRUSTOTAL_ENABLED?.trim().toLowerCase() !== "false";
}

export function isVirusTotalUploadOnMissEnabled(): boolean {
  return process.env.VIRUSTOTAL_UPLOAD_ON_MISS?.trim().toLowerCase() === "true";
}

export async function runVirusTotalScan(
  snapshot: SkillSnapshot
): Promise<{ summary: VirusTotalScanSummary; findings: InspectionFinding[] }> {
  const apiKey = readApiKey();
  if (!apiKey) {
    throw new Error("VIRUSTOTAL_API_KEY is required to run VirusTotal scans.");
  }

  const archive = skillSnapshotToZipBuffer(snapshot);
  if (archive.byteLength > MAX_UPLOAD_LIMIT_BYTES) {
    throw new Error(
      `Skill archive is ${archive.byteLength} bytes, exceeding VirusTotal's ${MAX_UPLOAD_LIMIT_BYTES}-byte upload limit.`
    );
  }

  const sha256 = createHash("sha256").update(archive).digest("hex");
  const existingReport = await lookupFileReport(sha256, apiKey);
  if (existingReport) {
    const completedReport = await waitForCompletedFileReport(sha256, apiKey, existingReport);
    return completeScan(sha256, completedReport);
  }

  if (!isVirusTotalUploadOnMissEnabled()) {
    return {
      summary: {
        provider: "virustotal",
        sha256,
        status: "not_found",
        malicious: 0,
        suspicious: 0,
        harmless: 0,
        undetected: 0,
        totalEngines: 0
      },
      findings: []
    };
  }

  const analysisId = await uploadArchive(archive, apiKey);
  const report = await waitForAnalysis(analysisId, apiKey);
  const completedReport = hasCompletedEngineStats(report)
    ? report
    : await waitForCompletedFileReport(sha256, apiKey, report);
  const enrichedReport = await enrichReportWithFileMetadata(sha256, apiKey, completedReport);
  return completeScan(sha256, enrichedReport);
}

function completeScan(
  sha256: string,
  report: VirusTotalReport
): { summary: VirusTotalScanSummary; findings: InspectionFinding[] } {
  const summary: VirusTotalScanSummary = {
    provider: "virustotal",
    sha256,
    status: "completed",
    ...report.stats,
    analysisUrl: `${VIRUSTOTAL_GUI_BASE_URL}/${sha256}`,
    engineResults: report.engineResults,
    ...(report.threatVerdict ? { threatVerdict: report.threatVerdict } : {})
  };

  return { summary, findings: createFindings(summary, report.engineResults) };
}

async function lookupFileReport(
  sha256: string,
  apiKey: string,
  step: VirusTotalStep = "file_lookup"
): Promise<VirusTotalReport | undefined> {
  const action = describeStepAction(step);
  return runVirusTotalStep(step, action, async () => {
    const response = await virusTotalFetch(`${VIRUSTOTAL_API_BASE_URL}/files/${sha256}`, apiKey, { step });
    if (response.status === 404) {
      return undefined;
    }

    const payload = await readJsonResponse(response, action);
    return parseFileReportPayload(payload, action);
  });
}

function parseFileReportPayload(payload: unknown, source: string): VirusTotalReport {
  const stats = getNestedValue(payload, ["data", "attributes", "last_analysis_stats"]);
  const engineResults = getNestedValue(payload, ["data", "attributes", "last_analysis_results"]);
  const threatVerdict = parseThreatVerdict(getNestedValue(payload, ["data", "attributes", "threat_verdict"]));
  return {
    // A file resource can exist while VirusTotal is still analysing it. In
    // that state it may have absent or all-zero last_analysis_stats; neither
    // response is evidence of a completed, clean scan.
    stats: isRecord(stats) ? parseStats(stats, source) : emptyStats(),
    engineResults: parseEngineResults(engineResults),
    ...(threatVerdict ? { threatVerdict } : {})
  };
}

function parseAnalysisReportPayload(payload: unknown, source: string): VirusTotalReport {
  const stats = getNestedValue(payload, ["data", "attributes", "stats"]);
  const engineResults = getNestedValue(payload, ["data", "attributes", "results"]);
  const threatVerdict = parseThreatVerdict(getNestedValue(payload, ["data", "attributes", "threat_verdict"]));
  return {
    stats: parseStats(stats, source),
    engineResults: parseEngineResults(engineResults),
    ...(threatVerdict ? { threatVerdict } : {})
  };
}

async function enrichReportWithFileMetadata(
  sha256: string,
  apiKey: string,
  report: VirusTotalReport
): Promise<VirusTotalReport> {
  if (report.threatVerdict) {
    return report;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (attempt > 0) {
      await delay(2_000);
    }
    let fileReport: VirusTotalReport | undefined;
    try {
      fileReport = await lookupFileReport(sha256, apiKey, "file_metadata_lookup");
    } catch {
      continue;
    }
    if (fileReport?.threatVerdict) {
      return { ...report, threatVerdict: fileReport.threatVerdict };
    }
  }

  return report;
}

export function parseThreatVerdict(value: unknown): VirusTotalThreatVerdict | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toUpperCase() as VirusTotalThreatVerdict;
  return VIRUSTOTAL_THREAT_VERDICTS.has(normalized) ? normalized : undefined;
}

async function uploadArchive(archive: Buffer, apiKey: string): Promise<string> {
  const uploadUrl =
    archive.byteLength > DIRECT_UPLOAD_LIMIT_BYTES
      ? await getLargeFileUploadUrl(apiKey)
      : `${VIRUSTOTAL_API_BASE_URL}/files`;
  const form = new FormData();
  form.set("file", new Blob([Uint8Array.from(archive)], { type: "application/zip" }), "skill.zip");

  const payload = await runVirusTotalStep("file_upload", "VirusTotal file upload", async () =>
    readJsonResponse(
      await virusTotalFetch(uploadUrl, apiKey, { method: "POST", body: form, step: "file_upload" }),
      "VirusTotal file upload"
    )
  );
  const analysisId = getNestedValue(payload, ["data", "id"]);
  if (typeof analysisId !== "string" || !analysisId.trim()) {
    throw new Error("VirusTotal file upload returned no analysis ID.");
  }
  return analysisId;
}

async function getLargeFileUploadUrl(apiKey: string): Promise<string> {
  const payload = await runVirusTotalStep("upload_url_request", "VirusTotal upload URL request", async () =>
    readJsonResponse(
      await virusTotalFetch(`${VIRUSTOTAL_API_BASE_URL}/files/upload_url`, apiKey, {
        step: "upload_url_request"
      }),
      "VirusTotal upload URL request"
    )
  );
  const uploadUrl = getNestedValue(payload, ["data"]);
  if (typeof uploadUrl !== "string" || !uploadUrl.startsWith("https://")) {
    throw new Error("VirusTotal upload URL response was invalid.");
  }
  return uploadUrl;
}

async function waitForAnalysis(analysisId: string, apiKey: string): Promise<VirusTotalReport> {
  const timeoutMs = readAnalysisTimeoutMs();
  const pollIntervalMs = readPositiveInteger(
    process.env.VIRUSTOTAL_POLL_INTERVAL_MS,
    DEFAULT_POLL_INTERVAL_MS
  );
  const deadline = Date.now() + timeoutMs;
  let pollAttempt = 0;

  while (Date.now() < deadline) {
    if (pollAttempt > 0) {
      await delay(Math.min(pollIntervalMs, Math.max(1, deadline - Date.now())));
    }
    pollAttempt += 1;

    const payload = await runVirusTotalStep("analysis_poll", "VirusTotal analysis lookup", async () =>
      readJsonResponse(
        await virusTotalFetch(
          `${VIRUSTOTAL_API_BASE_URL}/analyses/${encodeURIComponent(analysisId)}`,
          apiKey,
          { step: "analysis_poll" }
        ),
        "VirusTotal analysis lookup"
      )
    );
    const status = getNestedValue(payload, ["data", "attributes", "status"]);

    if (status === "completed") {
      return parseAnalysisReportPayload(payload, "VirusTotal analysis");
    }

    if (status === "failed") {
      throw new Error("VirusTotal analysis failed.");
    }
  }

  throw createAnalysisTimeoutError(timeoutMs);
}

async function waitForCompletedFileReport(
  sha256: string,
  apiKey: string,
  initialReport: VirusTotalReport
): Promise<VirusTotalReport> {
  if (hasCompletedEngineStats(initialReport)) {
    return initialReport;
  }

  const timeoutMs = readAnalysisTimeoutMs();
  const pollIntervalMs = readPositiveInteger(
    process.env.VIRUSTOTAL_POLL_INTERVAL_MS,
    DEFAULT_POLL_INTERVAL_MS
  );
  const deadline = Date.now() + timeoutMs;
  let pollAttempt = 0;

  while (Date.now() < deadline) {
    if (pollAttempt > 0) {
      await delay(Math.min(pollIntervalMs, Math.max(1, deadline - Date.now())));
    }
    pollAttempt += 1;

    const report = await lookupFileReport(sha256, apiKey, "file_metadata_lookup");
    if (report && hasCompletedEngineStats(report)) {
      return report;
    }
  }

  throw createAnalysisTimeoutError(timeoutMs);
}

function hasCompletedEngineStats(report: VirusTotalReport): boolean {
  return report.stats.totalEngines > 0;
}

function createAnalysisTimeoutError(timeoutMs: number): VirusTotalStepError {
  return new VirusTotalStepError(
    "analysis_poll",
    "VirusTotal analysis wait",
    {
      kind: "analysis",
      retryable: true,
      detail: `analysis did not complete within ${timeoutMs}ms`
    },
    new Error(`VirusTotal analysis timed out after ${timeoutMs}ms.`)
  );
}

function readAnalysisTimeoutMs(): number {
  const unlimited = process.env.REVIEW_BENCHMARK_UNLIMITED?.trim().toLowerCase() === "true";
  return readPositiveInteger(
    process.env.VIRUSTOTAL_ANALYSIS_TIMEOUT_MS ?? process.env.VIRUSTOTAL_TIMEOUT_MS,
    unlimited ? 3_600_000 : DEFAULT_TIMEOUT_MS
  );
}

interface VirusTotalFetchOptions extends RequestInit {
  step?: VirusTotalStep;
  timeoutMs?: number;
}

async function virusTotalFetch(
  url: string,
  apiKey: string,
  init?: VirusTotalFetchOptions
): Promise<Response> {
  const step = init?.step ?? "file_lookup";
  const timeoutMs = init?.timeoutMs ?? readStepTimeoutMs(step);
  const { step: _step, timeoutMs: _timeoutMs, ...requestInit } = init ?? {};
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...requestInit,
      headers: { "x-apikey": apiKey },
      signal: controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`VirusTotal ${step} timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function runVirusTotalStep<T>(
  step: VirusTotalStep,
  action: string,
  operation: () => Promise<T>
): Promise<T> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const diagnosis = diagnoseVirusTotalError(error);
      if (attempt < 2 && diagnosis.retryable) {
        await delay(retryDelayMs(diagnosis));
        continue;
      }
      throw new VirusTotalStepError(step, action, diagnosis, error);
    }
  }

  throw new Error(`VirusTotal ${step} failed unexpectedly.`);
}

function retryDelayMs(diagnosis: VirusTotalErrorDiagnosis): number {
  return diagnosis.kind === "rate_limit" ? 2_000 : 500;
}

function readStepTimeoutMs(step: VirusTotalStep): number {
  const unlimited = process.env.REVIEW_BENCHMARK_UNLIMITED?.trim().toLowerCase() === "true";
  const fallback = unlimited ? 600_000 : STEP_TIMEOUT_DEFAULT_MS[step];
  const specific = process.env[STEP_TIMEOUT_ENV[step]];
  if (specific?.trim()) {
    return readPositiveInteger(specific, fallback);
  }
  return readPositiveInteger(process.env.VIRUSTOTAL_TIMEOUT_MS, fallback);
}

function describeStepAction(step: VirusTotalStep): string {
  switch (step) {
    case "file_lookup":
      return "VirusTotal file lookup";
    case "upload_url_request":
      return "VirusTotal upload URL request";
    case "file_upload":
      return "VirusTotal file upload";
    case "analysis_poll":
      return "VirusTotal analysis lookup";
    case "file_metadata_lookup":
      return "VirusTotal file metadata lookup";
  }
}

function diagnoseVirusTotalError(error: unknown): VirusTotalErrorDiagnosis {
  if (error instanceof VirusTotalHttpError) {
    if (error.status === 429) {
      return {
        kind: "rate_limit",
        retryable: true,
        detail: `HTTP 429 quota or rate limit exceeded`
      };
    }
    if (error.status === 401 || error.status === 403) {
      return {
        kind: "auth",
        retryable: false,
        detail: `HTTP ${error.status} authorization failure`
      };
    }
    if (error.status >= 500) {
      return {
        kind: "server",
        retryable: true,
        detail: `HTTP ${error.status} server error`
      };
    }
    return {
      kind: "client",
      retryable: false,
      detail: `HTTP ${error.status} client error`
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  if (/timed out/i.test(message)) {
    return { kind: "timeout", retryable: true, detail: message };
  }
  if (/fetch failed/i.test(message) || /ECONN|ENOTFOUND|ETIMEDOUT|network/i.test(message)) {
    const cause = error instanceof Error ? error.cause : undefined;
    const causeCode =
      cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string"
        ? cause.code
        : undefined;
    return {
      kind: "network",
      retryable: true,
      detail: causeCode ? `${message} (${causeCode})` : message
    };
  }
  if (/analysis timed out/i.test(message) || /analysis failed/i.test(message)) {
    return { kind: "analysis", retryable: false, detail: message };
  }

  return { kind: "unknown", retryable: false, detail: message };
}

function formatVirusTotalStepFailure(
  step: VirusTotalStep,
  action: string,
  diagnosis: VirusTotalErrorDiagnosis,
  cause: unknown
): string {
  const base = `${action} failed at step ${step} (${diagnosis.kind}): ${diagnosis.detail}`;
  if (cause instanceof Error && cause.message && cause.message !== diagnosis.detail) {
    return `${base} — ${cause.message}`;
  }
  return base;
}

export function formatVirusTotalError(error: unknown): string {
  if (error instanceof VirusTotalStepError) {
    return error.message;
  }
  return diagnoseVirusTotalError(error).detail;
}

async function readJsonResponse(response: Response, action: string): Promise<unknown> {
  const payload = await response.json().catch(() => undefined);
  if (response.ok) {
    return payload;
  }

  const message = getNestedValue(payload, ["error", "message"]);
  const suffix = typeof message === "string" && message.trim() ? `: ${message.trim()}` : "";
  throw new VirusTotalHttpError(`${action} failed with HTTP ${response.status}${suffix}`, response.status);
}

function parseStats(value: unknown, source: string): VirusTotalStats {
  if (!isRecord(value)) {
    throw new Error(`${source} returned no analysis statistics.`);
  }

  const malicious = readCount(value.malicious);
  const suspicious = readCount(value.suspicious);
  const harmless = readCount(value.harmless);
  const undetected = readCount(value.undetected);
  const totalEngines = sumAnalysisStats(value) || malicious + suspicious + harmless + undetected;

  return {
    malicious,
    suspicious,
    harmless,
    undetected,
    totalEngines
  };
}

function emptyStats(): VirusTotalStats {
  return {
    malicious: 0,
    suspicious: 0,
    harmless: 0,
    undetected: 0,
    totalEngines: 0
  };
}

function sumAnalysisStats(value: Record<string, unknown>): number {
  let total = 0;
  for (const entry of Object.values(value)) {
    if (typeof entry === "number" && Number.isFinite(entry) && entry > 0) {
      total += Math.floor(entry);
    }
  }
  return total;
}

export function resolveVirusTotalEngineTotal(summary: Pick<
  VirusTotalScanSummary,
  "malicious" | "suspicious" | "harmless" | "undetected" | "totalEngines"
>): number {
  if (summary.totalEngines > 0) {
    return summary.totalEngines;
  }
  return summary.malicious + summary.suspicious + summary.harmless + summary.undetected;
}

export function parseEngineResults(value: unknown): VirusTotalEngineResult[] {
  if (!isRecord(value)) {
    return [];
  }

  const results: VirusTotalEngineResult[] = [];
  for (const [engine, entry] of Object.entries(value)) {
    if (!isRecord(entry)) {
      continue;
    }

    const category = typeof entry.category === "string" ? entry.category.trim().toLowerCase() : "undetected";
    if (category !== "malicious" && category !== "suspicious") {
      continue;
    }

    const result = typeof entry.result === "string" ? entry.result.trim() : "";
    results.push({
      engine,
      category,
      result: result || category,
      method: typeof entry.method === "string" ? entry.method : undefined,
      engineUpdate: typeof entry.engine_update === "string" ? entry.engine_update : undefined
    });
  }

  return results.sort((left, right) => {
    const categoryRank = (category: string) => (category === "malicious" ? 0 : 1);
    const rankDiff = categoryRank(left.category) - categoryRank(right.category);
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return left.engine.localeCompare(right.engine);
  });
}

function createFindings(summary: VirusTotalScanSummary, engineResults: VirusTotalEngineResult[]): InspectionFinding[] {
  if (summary.status !== "completed") {
    return [];
  }

  const maliciousEngines = engineResults.filter((engine) => engine.category === "malicious");
  const suspiciousEngines = engineResults.filter((engine) => engine.category === "suspicious");
  if (maliciousEngines.length > 0 || suspiciousEngines.length > 0) {
    const findings: InspectionFinding[] = [];
    if (maliciousEngines.length > 0) {
      findings.push(createGroupedCategoryFinding(summary, "malicious", maliciousEngines));
    }
    if (suspiciousEngines.length > 0) {
      findings.push(createGroupedCategoryFinding(summary, "suspicious", suspiciousEngines));
    }
    return findings;
  }

  return createAggregateFindings(summary);
}

function createGroupedCategoryFinding(
  summary: VirusTotalScanSummary,
  category: "malicious" | "suspicious",
  engines: VirusTotalEngineResult[]
): InspectionFinding {
  const severity = category === "malicious" ? "high" : "medium";
  const engineNames = engines.map((engine) => engine.engine).join(", ");

  return {
    id: `virustotal-${category}-${summary.sha256.slice(0, 16)}`,
    category: "security",
    severity,
    title: `VirusTotal (${category})`,
    message: `${engineNames} classified this package as ${category}.`,
    evidence: buildGroupedEvidence(summary, category, engines),
    recommendation:
      category === "malicious"
        ? "Do not publish this package until the flagged content is removed or the VirusTotal detection is reviewed and cleared."
        : "Review the package and VirusTotal report before publishing; remove suspicious behavior or document a verified false positive."
  };
}

function createAggregateFindings(summary: VirusTotalScanSummary): InspectionFinding[] {
  const totalEngines = resolveVirusTotalEngineTotal(summary);
  const evidence = [
    `SHA-256: ${summary.sha256}`,
    ...(summary.threatVerdict ? [`Threat verdict: ${summary.threatVerdict}`] : []),
    `Total engines: ${totalEngines}`,
    `VirusTotal engines: malicious=${summary.malicious}, suspicious=${summary.suspicious}, harmless=${summary.harmless}, undetected=${summary.undetected}`,
    ...(summary.analysisUrl ? [`Report: ${summary.analysisUrl}`] : [])
  ].join("\n");

  if (summary.malicious > 0) {
    return [
      {
        id: `virustotal-malicious-${summary.sha256.slice(0, 16)}`,
        category: "security",
        severity: "high",
        title: "VirusTotal detected malicious content",
        message: `VirusTotal reported ${summary.malicious} malicious detection(s)${summary.suspicious ? ` and ${summary.suspicious} suspicious detection(s)` : ""}${totalEngines ? ` across ${totalEngines} engines` : ""}.`,
        evidence,
        recommendation:
          "Do not publish this package until the flagged content is removed or the VirusTotal detections are reviewed and cleared."
      }
    ];
  }

  if (summary.suspicious > 0) {
    return [
      {
        id: `virustotal-suspicious-${summary.sha256.slice(0, 16)}`,
        category: "security",
        severity: "medium",
        title: "VirusTotal detected suspicious content",
        message: `VirusTotal reported ${summary.suspicious} suspicious detection(s)${totalEngines ? ` across ${totalEngines} engines` : ""}.`,
        evidence,
        recommendation:
          "Review the package and VirusTotal report before publishing; remove suspicious behavior or document a verified false positive."
      }
    ];
  }

  return [];
}

function buildGroupedEvidence(
  summary: VirusTotalScanSummary,
  category: "malicious" | "suspicious",
  engines: VirusTotalEngineResult[]
): string {
  const resultLines = engines.map((engine) => `\t${engine.engine}: ${engine.result}`).join("\n");
  const methods = [...new Set(engines.map((engine) => engine.method).filter(Boolean))].join(", ");
  const engineUpdates = [...new Set(engines.map((engine) => engine.engineUpdate).filter(Boolean))].join(", ");

  const totalEngines = resolveVirusTotalEngineTotal(summary);

  return [
    `SHA-256: ${summary.sha256}`,
    ...(summary.threatVerdict ? [`Threat verdict: ${summary.threatVerdict}`] : []),
    `Total engines: ${totalEngines}`,
    `Category: ${category}`,
    `Result:\n${resultLines}`,
    ...(methods ? [`Method: ${methods}`] : []),
    ...(engineUpdates ? [`Engine update: ${engineUpdates}`] : []),
    ...(summary.analysisUrl ? [`Report: ${summary.analysisUrl}`] : [])
  ].join("\n");
}

function getNestedValue(value: unknown, path: string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function readApiKey(): string | undefined {
  const value = process.env.VIRUSTOTAL_API_KEY?.trim();
  return value || undefined;
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
