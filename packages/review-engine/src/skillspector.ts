import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { SkillSnapshot } from "@skill-platform/skill-spec";
import { localizeSkillSpectorFindingByRuleId } from "./skillspector-i18n.js";

type ReviewCategory =
  | "compliance"
  | "quality"
  | "leakage"
  | "privacy"
  | "security"
  | "reliability";
type ReviewSeverity = "low" | "medium" | "high" | "critical";

interface ReviewFinding {
  id: string;
  category: ReviewCategory;
  severity: ReviewSeverity;
  title: string;
  message: string;
  path?: string;
  evidence?: string;
  recommendation: string;
  confidence?: number;
}

export interface SkillSpectorScanSummary {
  provider: "skillspector-static";
  riskScore: number;
  riskSeverity: string;
  recommendation: string;
  scanMode: "static-only";
}

interface SkillSpectorIssue {
  id?: string;
  category?: string | null;
  severity?: string;
  confidence?: number;
  location?: {
    file?: string;
    start_line?: number;
    end_line?: number | null;
  };
  finding?: string | null;
  explanation?: string | null;
  remediation?: string | null;
  code_snippet?: string | null;
  tags?: string[];
}

interface SkillSpectorPayload {
  ok: boolean;
  error?: string;
  riskScore?: number;
  riskSeverity?: string;
  recommendation?: string;
  scanMode?: string;
  findings?: SkillSpectorIssue[];
}

interface ProcessOutput {
  stdout: string;
  stderr: string;
}

const reviewEngineDirectory = dirname(fileURLToPath(import.meta.url));
const defaultSkillSpectorDirectory = resolve(reviewEngineDirectory, "../../SkillSpector-main");
const bridgePath = join(reviewEngineDirectory, "skillspector_bridge.py");

const PRIVACY_RULE_PREFIXES = ["E2", "E3", "PE3", "AS"];
const LEAKAGE_RULE_PREFIXES = ["E1", "E4", "E5", "SSRF"];

export async function runSkillSpectorSecurityScan(
  snapshot: SkillSnapshot
): Promise<{ summary: SkillSpectorScanSummary; findings: ReviewFinding[] }> {
  const snapshotDirectory = await mkdtemp(join(tmpdir(), "skill-platform-skillspector-"));

  try {
    await writeSnapshot(snapshot, snapshotDirectory);
    const payload = await invokeSkillSpectorBridge(snapshotDirectory);
    const summary: SkillSpectorScanSummary = {
      provider: "skillspector-static",
      riskScore: clampScore(payload.riskScore ?? 0),
      riskSeverity: payload.riskSeverity ?? "LOW",
      recommendation: payload.recommendation ?? "SAFE",
      scanMode: "static-only"
    };
    const findings = (payload.findings ?? []).map((issue, index) =>
      mapSkillSpectorFinding(issue, index)
    );

    return { summary, findings };
  } finally {
    await rm(snapshotDirectory, { recursive: true, force: true });
  }
}

export function isSkillSpectorEnabled(): boolean {
  return process.env.SKILLSPECTOR_ENABLED?.toLowerCase() !== "false";
}

export function usesSkillSpectorFindings(findings: ReviewFinding[]): boolean {
  return findings.some((finding) => finding.id.startsWith("skillspector-"));
}

function mapSkillSpectorFinding(issue: SkillSpectorIssue, index: number): ReviewFinding {
  const ruleId = (issue.id ?? `issue-${index}`).trim() || `issue-${index}`;
  const file = issue.location?.file?.replace(/\\/g, "/") ?? "SKILL.md";
  const line = issue.location?.start_line;
  const title = issue.category?.trim() || "SkillSpector security finding";
  const message =
    issue.explanation?.trim() ||
    issue.finding?.trim() ||
    `SkillSpector detected ${ruleId} in ${file}.`;
  const evidence = issue.code_snippet?.trim() || issue.finding?.trim() || undefined;
  const confidence = normalizeConfidence(issue.confidence);

  return localizeSkillSpectorFindingByRuleId(
    {
      id: `skillspector-${sanitizeId(ruleId)}-${sanitizeId(file)}-${index}`,
      category: mapSkillSpectorCategory(issue.category, ruleId),
      severity: mapSkillSpectorSeverity(issue.severity),
      title,
      message: line ? `${message} (${file}:${line})` : message,
      path: file,
      evidence,
      recommendation:
        issue.remediation?.trim() ||
        "Review this SkillSpector finding and remove or justify the flagged behavior before publishing.",
      ...(confidence !== undefined ? { confidence } : {})
    },
    ruleId
  );
}

function mapSkillSpectorCategory(category: string | null | undefined, ruleId: string): ReviewCategory {
  const normalizedCategory = category?.trim().toLowerCase() ?? "";
  const rulePrefix = ruleId.toUpperCase().replace(/[^A-Z0-9].*$/, "");

  if (PRIVACY_RULE_PREFIXES.some((prefix) => rulePrefix.startsWith(prefix))) {
    return "privacy";
  }
  if (LEAKAGE_RULE_PREFIXES.some((prefix) => rulePrefix.startsWith(prefix))) {
    return "leakage";
  }

  if (
    normalizedCategory.includes("exfiltration") ||
    normalizedCategory.includes("leakage") ||
    normalizedCategory.includes("ssrf")
  ) {
    return "leakage";
  }

  if (
    normalizedCategory.includes("snooping") ||
    normalizedCategory.includes("privacy") ||
    normalizedCategory.includes("credential")
  ) {
    return "privacy";
  }

  return "security";
}

function mapSkillSpectorSeverity(severity: string | undefined): ReviewSeverity {
  switch ((severity ?? "LOW").toUpperCase()) {
    case "CRITICAL":
      return "critical";
    case "HIGH":
      return "high";
    case "MEDIUM":
      return "medium";
    default:
      return "low";
  }
}

async function invokeSkillSpectorBridge(skillDirectory: string): Promise<SkillSpectorPayload> {
  const skillspectorDirectory = process.env.SKILLSPECTOR_DIR?.trim() || defaultSkillSpectorDirectory;
  const pythonCommands = process.env.SKILLSPECTOR_PYTHON?.trim()
    ? [process.env.SKILLSPECTOR_PYTHON.trim()]
    : process.platform === "win32"
      ? ["python", "python3"]
      : ["python3", "python"];
  let lastCommandError: unknown;

  for (const command of pythonCommands) {
    try {
      const output = await runProcess(
        command,
        [bridgePath, "--skill-dir", skillDirectory, "--skillspector-dir", skillspectorDirectory],
        skillspectorDirectory
      );
      return parseSkillSpectorPayload(output);
    } catch (error) {
      if (isCommandNotFoundError(error)) {
        lastCommandError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastCommandError ?? new Error("No Python runtime was found for SkillSpector.");
}

function runProcess(command: string, args: string[], cwd: string): Promise<ProcessOutput> {
  const timeoutMs = readSkillSpectorTimeout();

  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        PYTHONDONTWRITEBYTECODE: "1",
        PYTHONIOENCODING: "utf-8"
      },
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let timeout: NodeJS.Timeout | undefined;

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      callback();
    };

    const appendOutput = (current: string, chunk: Buffer): string => {
      const next = current + chunk.toString("utf8");
      if (next.length > 2_000_000) {
        child.kill();
        throw new Error("SkillSpector produced more than 2 MB of output.");
      }
      return next;
    };

    child.stdout.on("data", (chunk: Buffer) => {
      try {
        stdout = appendOutput(stdout, chunk);
      } catch (error) {
        finish(() => rejectProcess(error));
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = appendOutput(stderr, chunk);
    });

    child.on("error", (error) => finish(() => rejectProcess(error)));
    child.on("close", (code) => {
      finish(() => {
        if (timedOut) {
          rejectProcess(new Error(`SkillSpector timed out after ${timeoutMs}ms.`));
          return;
        }
        if (code !== 0 && code !== 1) {
          rejectProcess(
            new Error(
              truncate(
                `SkillSpector bridge exited with code ${code ?? "unknown"}: ${stderr || stdout}`,
                500
              )
            )
          );
          return;
        }
        resolveProcess({ stdout, stderr });
      });
    });

    timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
  });
}

function parseSkillSpectorPayload(output: ProcessOutput): SkillSpectorPayload {
  const payloadLine = output.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);

  if (!payloadLine) {
    throw new Error(
      truncate(`SkillSpector bridge returned no JSON payload. stderr: ${output.stderr}`, 500)
    );
  }

  let payload: SkillSpectorPayload;
  try {
    payload = JSON.parse(payloadLine) as SkillSpectorPayload;
  } catch {
    throw new Error(truncate(`SkillSpector bridge returned invalid JSON: ${payloadLine}`, 500));
  }

  if (!payload.ok) {
    throw new Error(payload.error ?? "SkillSpector bridge reported failure.");
  }

  return payload;
}

async function writeSnapshot(snapshot: SkillSnapshot, targetDirectory: string): Promise<void> {
  await Promise.all(
    snapshot.files.map(async (file) => {
      const destination = resolveSnapshotPath(targetDirectory, file.path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, file.content, "utf8");
    })
  );
}

function resolveSnapshotPath(rootDirectory: string, filePath: string): string {
  const normalized = filePath.replaceAll("\\", "/");
  const segments = normalized.split("/");

  if (
    !normalized ||
    isAbsolute(normalized) ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`Unsafe Skill file path for SkillSpector review: ${filePath}`);
  }

  const resolvedPath = resolve(rootDirectory, ...segments);
  const relativePath = relative(rootDirectory, resolvedPath);
  if (relativePath.startsWith(`..${sep}`) || relativePath === ".." || isAbsolute(relativePath)) {
    throw new Error(`Skill file path escapes the review directory: ${filePath}`);
  }

  return resolvedPath;
}

function readSkillSpectorTimeout(): number {
  const raw = process.env.SKILLSPECTOR_TIMEOUT_MS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : 60_000;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 60_000;
  }
  if (process.env.REVIEW_BENCHMARK_UNLIMITED?.trim().toLowerCase() === "true") {
    return parsed;
  }
  return Math.min(parsed, 180_000);
}

function isCommandNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function sanitizeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "finding";
}

function normalizeConfidence(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, Math.min(1, value));
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}
