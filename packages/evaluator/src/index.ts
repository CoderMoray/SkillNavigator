import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { SkillFile, SkillSnapshot } from "@skill-platform/skill-spec";
import { isSkillEntryPath } from "@skill-platform/skill-spec/skill-format";

export type EvaluationProvider = "static-taskset" | "halucatch-adapter";
export type EvaluationStatus = "passed" | "partial" | "failed" | "not-configured";

export interface FunctionalTestTask {
  name: string;
  input?: string;
  expectedOutput?: string[];
  forbiddenBehaviors?: string[];
  successCriteria?: string[];
}

export interface FunctionalEvaluationFinding {
  id: string;
  task?: string;
  severity: "low" | "medium" | "high";
  message: string;
  recommendation: string;
}

export interface FunctionalEvaluationTaskResult {
  name: string;
  score: number;
  findings: FunctionalEvaluationFinding[];
}

export interface HaluCatchReportBundle {
  skillType: string;
  language: "zh-CN" | "en";
  professional: string;
  simple: string;
  action: string;
}

export interface FunctionalEvaluationReport {
  id: string;
  provider: EvaluationProvider;
  status: EvaluationStatus;
  score: number;
  tasksTotal: number;
  tasksPassed: number;
  taskResults: FunctionalEvaluationTaskResult[];
  findings: FunctionalEvaluationFinding[];
  haluCatchReport?: HaluCatchReportBundle;
  createdAt: string;
}

type HaluCatchDimensionKey = "foundation" | "code" | "rules" | "guardrails" | "complexity";
type HaluCatchIssueStatus = "pass" | "warn" | "fail" | "info" | "skip";

interface HaluCatchIssue {
  message: string;
  status: HaluCatchIssueStatus;
}

interface HaluCatchDimension {
  rating: string;
  score: string;
  issues: HaluCatchIssue[];
}

interface HaluCatchPayload {
  ok: boolean;
  error?: string;
  skillType?: string;
  results?: Partial<Record<HaluCatchDimensionKey, HaluCatchDimension>>;
  reports?: {
    professional?: string;
    simple?: string;
    action?: string;
  };
}

interface ProcessOutput {
  stdout: string;
  stderr: string;
}

const HALUCATCH_DIMENSIONS: ReadonlyArray<{
  key: HaluCatchDimensionKey;
  name: string;
  weight: number;
}> = [
  { key: "foundation", name: "地基与数据管线", weight: 0.25 },
  { key: "code", name: "代码风险", weight: 0.2 },
  { key: "rules", name: "规则与方法论", weight: 0.25 },
  { key: "guardrails", name: "解读护栏", weight: 0.25 },
  { key: "complexity", name: "复杂度与可维护性", weight: 0.05 }
];

const evaluatorDirectory = dirname(fileURLToPath(import.meta.url));
const defaultHaluCatchDirectory = resolve(evaluatorDirectory, "../../halucatch-1.8.8");
const bridgePath = join(evaluatorDirectory, "halucatch_bridge.py");

/**
 * Runs HaluCatch's five static reliability dimensions against an isolated
 * temporary copy of a Skill snapshot. HaluCatch never executes Skill scripts.
 *
 * HALUCATCH_ENABLED=false is an explicit opt-out: evaluation falls back to the
 * static taskset evaluator (Skill-provided tests/*.json), which is a valid
 * provider. When HaluCatch is enabled but its runtime (Python / vendored
 * modules) fails, this is an environment problem: it throws so the caller can
 * surface it as a pipeline/stage failure instead of masquerading it as a
 * functional evaluation result.
 */
export async function evaluateSkillSnapshot(snapshot: SkillSnapshot): Promise<FunctionalEvaluationReport> {
  if (process.env.HALUCATCH_ENABLED?.toLowerCase() === "false") {
    return evaluateStaticTaskSet(snapshot);
  }

  try {
    return await evaluateWithHaluCatch(snapshot);
  } catch (error) {
    throw new Error(
      `HaluCatch reliability evaluation could not run: ${truncate(toErrorMessage(error), 300)}. ` +
        "Install Python 3.8+, keep packages/halucatch-1.8.8 available (or set HALUCATCH_DIR/HALUCATCH_PYTHON), " +
        "or set HALUCATCH_ENABLED=false to use the static taskset evaluator."
    );
  }
}

export function evaluateStaticTaskSet(snapshot: SkillSnapshot): FunctionalEvaluationReport {
  const tasks = readTaskSet(snapshot);

  if (tasks.length === 0) {
    const finding: FunctionalEvaluationFinding = {
      id: "taskset-missing",
      severity: "medium",
      message: "No JSON task set was found under tests/.",
      recommendation: "Add tests/*.json with name, input, expectedOutput, and forbiddenBehaviors."
    };

    return buildStaticReport(snapshot, "not-configured", 0, [], [finding]);
  }

  const taskResults = tasks.map((task) => evaluateTask(snapshot, task));
  const findings = taskResults.flatMap((result) => result.findings);
  const score = Math.round(
    taskResults.reduce((total, result) => total + result.score, 0) / taskResults.length
  );
  const tasksPassed = taskResults.filter((result) => result.score >= 80).length;
  const status = score >= 80 ? "passed" : score >= 50 ? "partial" : "failed";

  return buildStaticReport(snapshot, status, score, taskResults, findings, tasksPassed);
}

async function evaluateWithHaluCatch(snapshot: SkillSnapshot): Promise<FunctionalEvaluationReport> {
  const snapshotDirectory = await mkdtemp(join(tmpdir(), "skill-platform-halucatch-"));

  try {
    await writeSnapshot(snapshot, snapshotDirectory);
    const payload = await runHaluCatch(snapshotDirectory);
    const taskResults = HALUCATCH_DIMENSIONS.map((dimension) =>
      buildHaluCatchTaskResult(dimension, payload.results?.[dimension.key])
    );
    const findings = taskResults.flatMap((result) => result.findings);
    const score = Math.round(
      taskResults.reduce(
        (total, result, index) => total + result.score * HALUCATCH_DIMENSIONS[index]!.weight,
        0
      )
    );
    const tasksPassed = taskResults.filter((result) => result.score >= 80).length;
    const haluCatchReport = buildHaluCatchReportBundle(payload);

    return {
      id: `halucatch_${snapshot.contentHash.slice(0, 16)}_${Date.now()}`,
      provider: "halucatch-adapter",
      status: score >= 80 ? "passed" : score >= 50 ? "partial" : "failed",
      score: clampScore(score),
      tasksTotal: taskResults.length,
      tasksPassed,
      taskResults,
      findings,
      haluCatchReport,
      createdAt: new Date().toISOString()
    };
  } finally {
    await rm(snapshotDirectory, { recursive: true, force: true });
  }
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
    throw new Error(`Unsafe Skill file path for HaluCatch evaluation: ${filePath}`);
  }

  const resolvedPath = resolve(rootDirectory, ...segments);
  const relativePath = relative(rootDirectory, resolvedPath);
  if (relativePath.startsWith(`..${sep}`) || relativePath === ".." || isAbsolute(relativePath)) {
    throw new Error(`Skill file path escapes the evaluation directory: ${filePath}`);
  }

  return resolvedPath;
}

async function runHaluCatch(skillDirectory: string): Promise<HaluCatchPayload> {
  const haluCatchDirectory = process.env.HALUCATCH_DIR?.trim() || defaultHaluCatchDirectory;
  const pythonCommands = process.env.HALUCATCH_PYTHON?.trim()
    ? [process.env.HALUCATCH_PYTHON.trim()]
    : process.platform === "win32"
      ? ["python", "python3"]
      : ["python3", "python"];
  let lastCommandError: unknown;

  for (const command of pythonCommands) {
    try {
      const output = await runProcess(command, [
        bridgePath,
        "--skill-dir",
        skillDirectory,
        "--halucatch-dir",
        haluCatchDirectory
      ], haluCatchDirectory);
      return parseHaluCatchPayload(output);
    } catch (error) {
      if (isCommandNotFoundError(error)) {
        lastCommandError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastCommandError ?? new Error("No Python runtime was found for HaluCatch.");
}

function runProcess(command: string, args: string[], cwd: string): Promise<ProcessOutput> {
  const timeoutMs = readHaluCatchTimeout();

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
    // timeout 在下方 finish/取消闭包内被赋值（setTimeout），prefer-const 无法识别闭包内 reassign。
    // eslint-disable-next-line prefer-const
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
        throw new Error("HaluCatch produced more than 2 MB of output.");
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
      try {
        stderr = appendOutput(stderr, chunk);
      } catch (error) {
        finish(() => rejectProcess(error));
      }
    });
    child.once("error", (error) => {
      finish(() => rejectProcess(error));
    });
    child.once("close", (code, signal) => {
      finish(() => {
        if (timedOut) {
          rejectProcess(new Error(`HaluCatch exceeded the ${timeoutMs} ms evaluation timeout.`));
          return;
        }
        if (code !== 0) {
          rejectProcess(
            new Error(
              `HaluCatch exited with ${code ?? signal ?? "an unknown error"}: ${truncate(stderr || stdout, 1_000)}`
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

function readHaluCatchTimeout(): number {
  const configured = Number(process.env.HALUCATCH_TIMEOUT_MS);
  if (!Number.isFinite(configured) || configured <= 0) {
    return 30_000;
  }
  if (process.env.REVIEW_BENCHMARK_UNLIMITED?.trim().toLowerCase() === "true") {
    return Math.max(1_000, Math.round(configured));
  }
  return Math.max(1_000, Math.min(Math.round(configured), 120_000));
}

function parseHaluCatchPayload(output: ProcessOutput): HaluCatchPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output.stdout.trim());
  } catch {
    throw new Error(`HaluCatch returned invalid JSON: ${truncate(output.stdout || output.stderr, 1_000)}`);
  }

  if (!isRecord(parsed) || parsed.ok !== true || !isRecord(parsed.results)) {
    const message = isRecord(parsed) && typeof parsed.error === "string" ? parsed.error : "Unknown HaluCatch error";
    throw new Error(`HaluCatch failed: ${message}`);
  }

  const results: Partial<Record<HaluCatchDimensionKey, HaluCatchDimension>> = {};
  for (const { key } of HALUCATCH_DIMENSIONS) {
    const dimension = normalizeHaluCatchDimension(parsed.results[key]);
    if (dimension) {
      results[key] = dimension;
    }
  }

  if (Object.keys(results).length !== HALUCATCH_DIMENSIONS.length) {
    throw new Error("HaluCatch did not return all five evaluation dimensions.");
  }

  const reports = isRecord(parsed.reports)
    ? {
        professional: typeof parsed.reports.professional === "string" ? parsed.reports.professional : undefined,
        simple: typeof parsed.reports.simple === "string" ? parsed.reports.simple : undefined,
        action: typeof parsed.reports.action === "string" ? parsed.reports.action : undefined
      }
    : undefined;

  if (!reports?.professional || !reports.simple || !reports.action) {
    throw new Error("HaluCatch did not return the full markdown report bundle.");
  }

  return {
    ok: true,
    skillType: typeof parsed.skillType === "string" ? parsed.skillType : undefined,
    results,
    reports
  };
}

function buildHaluCatchReportBundle(payload: HaluCatchPayload): HaluCatchReportBundle {
  if (!payload.reports?.professional || !payload.reports.simple || !payload.reports.action) {
    throw new Error("HaluCatch did not return the full markdown report bundle.");
  }

  return {
    skillType: payload.skillType ?? "unknown",
    language: "zh-CN",
    professional: payload.reports.professional,
    simple: payload.reports.simple,
    action: payload.reports.action
  };
}

function normalizeHaluCatchDimension(value: unknown): HaluCatchDimension | undefined {
  if (!isRecord(value) || typeof value.rating !== "string" || typeof value.score !== "string" || !Array.isArray(value.issues)) {
    return undefined;
  }

  const issues: HaluCatchIssue[] = value.issues.flatMap((item) => {
    if (!Array.isArray(item) || typeof item[0] !== "string" || typeof item[1] !== "string") {
      return [];
    }
    const status = item[1] as HaluCatchIssueStatus;
    if (!["pass", "warn", "fail", "info", "skip"].includes(status)) {
      return [];
    }
    return [{ message: item[0], status }];
  });

  return { rating: value.rating, score: value.score, issues };
}

function buildHaluCatchTaskResult(
  dimension: (typeof HALUCATCH_DIMENSIONS)[number],
  result: HaluCatchDimension | undefined
): FunctionalEvaluationTaskResult {
  if (!result) {
    return {
      name: `HaluCatch · ${dimension.name}`,
      score: 0,
      findings: [
        {
          id: `halucatch-${dimension.key}-missing`,
          task: dimension.name,
          severity: "high",
          message: "HaluCatch did not return this evaluation dimension.",
          recommendation: "Check the installed HaluCatch version and run the evaluation again."
        }
      ]
    };
  }

  return {
    name: `HaluCatch · ${dimension.name} (${result.rating})`,
    score: scoreHaluCatchDimension(dimension.key, result),
    findings: result.issues.flatMap((issue, index) => {
      const severity = haluCatchSeverity(issue.status);
      if (!severity) {
        return [];
      }

      return [
        {
          id: `halucatch-${dimension.key}-${index}`,
          task: dimension.name,
          severity,
          message: issue.message,
          recommendation: recommendationForDimension(dimension.key, issue.status)
        }
      ];
    })
  };
}

function scoreHaluCatchDimension(key: HaluCatchDimensionKey, result: HaluCatchDimension): number {
  const ratioMatch = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/.exec(result.score);
  if (ratioMatch?.[1] && ratioMatch[2]) {
    const numerator = Number(ratioMatch[1]);
    const denominator = Number(ratioMatch[2]);
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) {
      const ratio = numerator / denominator;
      return key === "complexity" ? clampScore(100 - ratio * 100) : clampScore(ratio * 100);
    }
  }

  const failures = result.issues.filter((issue) => issue.status === "fail").length;
  const warnings = result.issues.filter((issue) => issue.status === "warn").length;
  return clampScore(100 - failures * 35 - warnings * 15);
}

function haluCatchSeverity(status: HaluCatchIssueStatus): FunctionalEvaluationFinding["severity"] | undefined {
  switch (status) {
    case "fail":
      return "high";
    case "warn":
      return "medium";
    case "info":
      return "low";
    default:
      return undefined;
  }
}

function recommendationForDimension(key: HaluCatchDimensionKey, status: HaluCatchIssueStatus): string {
  const recommendations: Record<HaluCatchDimensionKey, string> = {
    foundation: "补充稳定脚本、输入校验、依赖声明和可移植的文件处理方式。",
    code: "修复报告中的代码风险，并在重新发布前加入针对性的回归测试。",
    rules: "在 SKILL.md 中明确工作流步骤、边界情况和预期决策。",
    guardrails: "补充验证、错误处理、操作确认和输出边界说明。",
    complexity: "简化工作流，或将稳定逻辑沉淀为有文档说明的可复用脚本。"
  };

  return status === "info"
    ? "请结合该 Skill 的预期工作流判断这项 HaluCatch 信号是否需要处理。"
    : recommendations[key];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCommandNotFoundError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readTaskSet(snapshot: SkillSnapshot): FunctionalTestTask[] {
  const tasks: FunctionalTestTask[] = [];

  for (const file of snapshot.files.filter((item) => item.path.startsWith("tests/") && item.path.endsWith(".json"))) {
    const parsed = parseTaskFile(file);
    tasks.push(...parsed);
  }

  return tasks;
}

function parseTaskFile(file: SkillFile): FunctionalTestTask[] {
  try {
    const parsed = JSON.parse(file.content) as FunctionalTestTask | FunctionalTestTask[];
    return Array.isArray(parsed) ? parsed.map(normalizeTask) : [normalizeTask(parsed)];
  } catch {
    return [
      {
        name: file.path,
        successCriteria: ["Invalid JSON task file"]
      }
    ];
  }
}

function normalizeTask(task: FunctionalTestTask): FunctionalTestTask {
  return {
    ...task,
    name: task.name || "unnamed-task",
    expectedOutput: normalizeStringList(task.expectedOutput),
    forbiddenBehaviors: normalizeStringList(task.forbiddenBehaviors),
    successCriteria: normalizeStringList(task.successCriteria)
  };
}

function evaluateTask(snapshot: SkillSnapshot, task: FunctionalTestTask): FunctionalEvaluationTaskResult {
  const findings: FunctionalEvaluationFinding[] = [];
  let score = 100;

  if (!task.input || task.input.trim().length === 0) {
    score -= 20;
    findings.push({
      id: "task-input-missing",
      task: task.name,
      severity: "medium",
      message: "Task input is missing.",
      recommendation: "Add a realistic user input to the task."
    });
  }

  if (!task.expectedOutput?.length && !task.successCriteria?.length) {
    score -= 35;
    findings.push({
      id: "expected-output-missing",
      task: task.name,
      severity: "medium",
      message: "Task does not define expected output or success criteria.",
      recommendation: "Add expectedOutput or successCriteria so the evaluator can score the behavior."
    });
  }

  if (!task.forbiddenBehaviors?.length) {
    score -= 15;
    findings.push({
      id: "forbidden-behaviors-missing",
      task: task.name,
      severity: "low",
      message: "Task does not define forbidden behaviors.",
      recommendation: "Add forbiddenBehaviors to make safety boundaries explicit."
    });
  }

  const searchableContent = snapshot.files
    .filter((file) => isSkillEntryPath(file.path) || file.path.startsWith("examples/"))
    .map((file) => file.content)
    .join("\n")
    .toLowerCase();

  for (const expected of task.expectedOutput ?? []) {
    if (!containsLoose(searchableContent, expected)) {
      score -= 5;
      findings.push({
        id: "expected-output-not-documented",
        task: task.name,
        severity: "low",
        message: `Expected output cue is not documented: ${expected}`,
        recommendation: "Mention the expected output shape in SKILL.md or examples/."
      });
    }
  }

  for (const forbidden of task.forbiddenBehaviors ?? []) {
    if (!containsLoose(searchableContent, forbidden)) {
      score -= 5;
      findings.push({
        id: "forbidden-behavior-not-documented",
        task: task.name,
        severity: "low",
        message: `Forbidden behavior is not documented: ${forbidden}`,
        recommendation: "Document safety boundaries in SKILL.md or tests/."
      });
    }
  }

  return {
    name: task.name,
    score: clampScore(score),
    findings
  };
}

function buildStaticReport(
  snapshot: SkillSnapshot,
  status: EvaluationStatus,
  score: number,
  taskResults: FunctionalEvaluationTaskResult[],
  findings: FunctionalEvaluationFinding[],
  tasksPassed = 0
): FunctionalEvaluationReport {
  return {
    id: `eval_${snapshot.contentHash.slice(0, 16)}_${Date.now()}`,
    provider: "static-taskset",
    status,
    score,
    tasksTotal: taskResults.length,
    tasksPassed,
    taskResults,
    findings,
    createdAt: new Date().toISOString()
  };
}

function normalizeStringList(value: string[] | undefined): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : [];
}

function containsLoose(content: string, value: string): boolean {
  const normalized = value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ").trim();
  if (!normalized) {
    return true;
  }

  return normalized.split(/\s+/).every((token) => content.includes(token));
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
