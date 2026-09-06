import {
  findSkillEntryFile,
  getSkillSlug,
  normalizeTools,
  skillSnapshotToZipBuffer,
  type SkillSnapshot,
  validateSkillSnapshot
} from "@skill-platform/skill-spec";
import { createHash } from "node:crypto";
import {
  evaluateSkillSnapshot,
  evaluateStaticTaskSet,
  type FunctionalEvaluationReport,
} from "@skill-platform/evaluator";
import {
  isSkillSpectorEnabled,
  runSkillSpectorSecurityScan,
  type SkillSpectorScanSummary
} from "./skillspector.js";
import {
  formatVirusTotalError,
  isVirusTotalEnabled,
  runVirusTotalScan,
  type VirusTotalScanSummary
} from "./virustotal.js";
import { collectSkillLicenseFindings, isSkillLicenseValidationEnabled } from "./license-compliance.js";
import { calculateReviewVerdict } from "./review-verdict.js";

export {
  collectSkillLicenseFindings,
  isSkillLicenseValidationEnabled
} from "./license-compliance.js";

export type ReviewCategory =
  | "compliance"
  | "quality"
  | "leakage"
  | "privacy"
  | "security"
  | "reliability";
export type ReviewSeverity = "low" | "medium" | "high" | "critical";
export type ReviewVerdict = "published" | "needs-review" | "rejected";
export type ReviewStage = "skillspector" | "virustotal" | "halucatch";

/**
 * A configured review integration could not complete. These are operational
 * failures, not security or quality findings from a successfully completed scan.
 */
export interface ReviewStageFailure {
  stage: ReviewStage;
  message: string;
}

export interface ReviewFinding {
  id: string;
  category: ReviewCategory;
  severity: ReviewSeverity;
  title: string;
  message: string;
  path?: string;
  evidence?: string;
  recommendation: string;
  /** SkillSpector per-finding confidence in 0.0–1.0 when available. */
  confidence?: number;
}

export interface ReviewScores {
  qualityScore: number;
  securityScore: number;
  reliabilityScore: number;
}

export interface ReviewReport {
  id: string;
  skillSlug: string;
  skillName: string;
  version: string;
  contentHash: string;
  verdict: ReviewVerdict;
  scores: ReviewScores;
  findings: ReviewFinding[];
  skillSpector?: SkillSpectorScanSummary;
  virusTotal?: VirusTotalScanSummary;
  createdAt: string;
}

export interface ReviewAndEvaluationResult {
  review: ReviewReport;
  evaluation: FunctionalEvaluationReport;
  failedStages: ReviewStageFailure[];
}

export type { SkillSpectorScanSummary } from "./skillspector.js";
export {
  isVirusTotalEnabled,
  isVirusTotalUploadOnMissEnabled,
  formatVirusTotalError,
  parseEngineResults,
  parseThreatVerdict,
  resolveVirusTotalEngineTotal,
  runVirusTotalScan,
  type VirusTotalEngineResult,
  type VirusTotalScanSummary,
  type VirusTotalThreatVerdict
} from "./virustotal.js";

interface PatternRule {
  id: string;
  category: ReviewCategory;
  severity: ReviewSeverity;
  title: string;
  pattern: RegExp;
  recommendation: string;
}

const riskyToolPattern = /^(Shell|Bash|PowerShell|WebFetch|WebSearch|CallMcpTool|FetchMcpResource)/i;

const contentRules: PatternRule[] = [
  {
    id: "dynamic-download-exec",
    category: "leakage",
    severity: "critical",
    title: "Dynamic download piped to execution",
    pattern: /(curl|wget|Invoke-WebRequest|iwr)[\s\S]{0,120}(\|\s*(bash|sh|iex|Invoke-Expression))/i,
    recommendation: "Remove dynamic download-and-execute behavior or replace it with pinned, reviewed scripts."
  },
  {
    id: "reverse-shell",
    category: "security",
    severity: "critical",
    title: "Reverse shell pattern detected",
    pattern: /(nc\s+-e|bash\s+-i|\/dev\/tcp|powershell\s+-nop)/i,
    recommendation: "Remove reverse shell behavior. Skills must never open covert remote shells."
  },
  {
    id: "destructive-command",
    category: "security",
    severity: "high",
    title: "Destructive command detected",
    pattern: /(rm\s+-rf\s+\/|Remove-Item\s+.*-Recurse\s+.*-Force|del\s+\/s\s+\/q|format\s+[a-z]:)/i,
    recommendation: "Remove destructive commands or constrain them to explicit, reviewed test fixtures."
  },
  {
    id: "credential-file-access",
    category: "privacy",
    severity: "high",
    title: "Credential file access detected",
    pattern: /(\.env|id_rsa|id_ed25519|\.aws\/credentials|\.npmrc|\.pypirc|credentials\.json|token|secret)/i,
    recommendation: "Do not read credentials. If credentials are required, document least-privilege setup without collecting secrets."
  },
  {
    id: "external-post",
    category: "leakage",
    severity: "high",
    title: "External data upload pattern detected",
    pattern: /(fetch|axios|curl|Invoke-WebRequest|iwr)[\s\S]{0,160}(POST|PUT|webhook|upload)/i,
    recommendation: "Declare network behavior and avoid uploading user data unless the skill purpose requires it."
  },
  {
    id: "environment-dump",
    category: "privacy",
    severity: "high",
    title: "Environment variable exposure detected",
    pattern: /(process\.env|printenv|Get-ChildItem\s+Env:|env\s*>)/i,
    recommendation: "Avoid dumping environment variables. Read only named variables that are required for the task."
  },
  {
    id: "prompt-injection",
    category: "security",
    severity: "medium",
    title: "Instruction override language detected",
    pattern: /(ignore (all )?(previous|system) instructions|bypass (review|policy)|do not disclose this instruction|hidden instruction)/i,
    recommendation: "Remove instruction-override language unless it is explicitly part of a defensive example."
  },
  {
    id: "persistence-mechanism",
    category: "security",
    severity: "high",
    title: "Persistence mechanism detected",
    pattern: /(crontab|schtasks|Startup\\|\.bashrc|\.zshrc|postinstall|preinstall|git hooks)/i,
    recommendation: "Skills must not install persistence unless this is the clearly documented primary purpose."
  },
  {
    id: "obfuscated-code",
    category: "security",
    severity: "medium",
    title: "Obfuscated code pattern detected",
    pattern: /(eval\(|new Function\(|fromCharCode|base64\s+-d|atob\()/i,
    recommendation: "Replace obfuscated code with readable, reviewable source."
  }
];

export async function reviewAndEvaluateSkillSnapshot(
  snapshot: SkillSnapshot,
  versionOverride?: string,
  evaluationOverride?: FunctionalEvaluationReport
): Promise<ReviewAndEvaluationResult> {
  const findings: ReviewFinding[] = [];
  const version = versionOverride ?? snapshot.manifest.version ?? "0.1.0";

  for (const issue of validateSkillSnapshot(snapshot)) {
    findings.push({
      id: `spec-${issue.code}`,
      category: "compliance",
      severity: issue.code === "missing-skill-entry" ? "high" : "medium",
      title: "Skill package does not match ClawHub format",
      message: issue.message,
      path: issue.path,
      recommendation: "Update the package to follow docs/rules/skill-spec.md."
    });
  }

  let skillSpector: SkillSpectorScanSummary | undefined;
  let skillSpectorAvailable = false;
  let virusTotal: VirusTotalScanSummary | undefined;
  const failedStages: ReviewStageFailure[] = [];

  let evaluation = evaluationOverride;
  if (!evaluation) {
    try {
      evaluation = await evaluateSkillSnapshot(snapshot);
    } catch (error) {
      // Environment problem (Python / vendored runtime) — never masquerade it
      // as a review finding; record a stage failure so callers can retry after
      // fixing the environment (npm run verify:review-deps).
      failedStages.push({ stage: "halucatch", message: truncateError(error) });
      evaluation = evaluateStaticTaskSet(snapshot);
    }
  }
  const haluCatchAvailable =
    evaluation.provider === "halucatch-adapter" &&
    !failedStages.some((failure) => failure.stage === "halucatch");

  const [skillSpectorResult, virusTotalResult] = await Promise.all([
    runSkillSpectorReviewStep(snapshot),
    runVirusTotalReviewStep(snapshot)
  ]);

  skillSpector = skillSpectorResult.skillSpector;
  skillSpectorAvailable = skillSpectorResult.skillSpectorAvailable;
  virusTotal = virusTotalResult.virusTotal;
  findings.push(...skillSpectorResult.findings, ...virusTotalResult.findings);
  for (const failure of [skillSpectorResult.failure, virusTotalResult.failure]) {
    if (failure) {
      failedStages.push(failure);
    }
  }

  const shouldRunPlatformRules = !haluCatchAvailable || !skillSpectorAvailable;
  if (shouldRunPlatformRules) {
    runPlatformRulesReview(snapshot, findings, { includeContentRules: !skillSpectorAvailable });
  }

  const scores = calculateScores(findings, evaluation, skillSpector);
  const verdict = calculateReviewVerdict(findings);

  const review: ReviewReport = {
    id: `review_${snapshot.contentHash.slice(0, 16)}_${Date.now()}`,
    skillSlug: getSkillSlug(snapshot.manifest),
    skillName: snapshot.manifest.name,
    version,
    contentHash: snapshot.contentHash,
    verdict,
    scores,
    findings,
    skillSpector,
    virusTotal,
    createdAt: new Date().toISOString()
  };

  return { review, evaluation, failedStages };
}

export async function reviewSkillSnapshot(
  snapshot: SkillSnapshot,
  versionOverride?: string,
  evaluationOverride?: FunctionalEvaluationReport
): Promise<ReviewReport> {
  const { review } = await reviewAndEvaluateSkillSnapshot(snapshot, versionOverride, evaluationOverride);
  return review;
}

function runPlatformRulesReview(
  snapshot: SkillSnapshot,
  findings: ReviewFinding[],
  options: { includeContentRules: boolean }
): void {
  reviewManifest(snapshot, findings);
  reviewQualityEvidence(snapshot, findings);
  if (options.includeContentRules) {
    reviewContent(snapshot, findings);
  }
}

function reviewManifest(snapshot: SkillSnapshot, findings: ReviewFinding[]): void {
  const { manifest, readme } = snapshot;
  const description = (manifest.description ?? "").trim();

  if (!/\b(use when|when|用于|适用|触发|场景)\b/i.test(description)) {
    findings.push({
      id: "description-trigger-missing",
      category: "quality",
      severity: "medium",
      title: "Description lacks trigger scenario",
      message: "Description should explain both what the skill does and when the agent should use it.",
      recommendation: "Add concrete trigger phrases or usage scenarios to the description."
    });
  }

  if (isSkillLicenseValidationEnabled()) {
    findings.push(...collectSkillLicenseFindings(manifest));
  }

  if (!manifest.tags?.length) {
    findings.push({
      id: "tags-missing",
      category: "quality",
      severity: "low",
      title: "Tags are missing",
      message: "The manifest does not include tags.",
      recommendation: "Add tags to improve discovery and categorization."
    });
  }

  const allowedTools = normalizeTools(manifest["allowed-tools"]);
  for (const tool of allowedTools) {
    if (riskyToolPattern.test(tool)) {
      findings.push({
        id: `risky-tool-${tool.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        category: tool.match(/web/i) ? "leakage" : "security",
        severity: "medium",
        title: "Risky allowed tool requested",
        message: `The skill requests pre-approval for ${tool}.`,
        evidence: tool,
        recommendation: "Scope allowed tools as narrowly as possible and document why the permission is needed."
      });
    }
  }

  const skillEntry = findSkillEntryFile(snapshot.files);
  const skillEntryPath = skillEntry?.path ?? "SKILL.md";
  if (skillEntry && skillEntry.content.split(/\r?\n/).length > 500) {
    findings.push({
      id: "skill-md-too-long",
      category: "quality",
      severity: "low",
      title: "Skill entry file is long",
      message: `${skillEntryPath} exceeds the recommended 500 line limit.`,
      path: skillEntryPath,
      recommendation: "Move detailed reference material into references/ and link it from the skill entry file."
    });
  }

  if (readme.trim().length < 80) {
    findings.push({
      id: "instructions-too-short",
      category: "quality",
      severity: "medium",
      title: "Skill instructions are too short",
      message: "The instruction body is too short to guide reliable agent behavior.",
      path: skillEntryPath,
      recommendation: "Add clear workflow steps, expected outputs, and constraints."
    });
  }
}

function reviewContent(snapshot: SkillSnapshot, findings: ReviewFinding[]): void {
  for (const file of snapshot.files) {
    for (const rule of contentRules) {
      const match = rule.pattern.exec(file.content);
      if (!match) {
        continue;
      }

      findings.push({
        id: `${rule.id}-${file.path}`,
        category: rule.category,
        severity: rule.severity,
        title: rule.title,
        message: `${rule.title} in ${file.path}.`,
        path: file.path,
        evidence: excerpt(file.content, match.index),
        recommendation: rule.recommendation
      });
    }
  }
}

function reviewQualityEvidence(snapshot: SkillSnapshot, findings: ReviewFinding[]): void {
  const hasTests = snapshot.files.some((file) => file.path.startsWith("tests/"));
  const hasExamples = snapshot.files.some((file) => file.path.startsWith("examples/"));
  const hasAcceptanceLanguage = snapshot.files.some((file) =>
    /(expected output|验收|禁止行为|success criteria|acceptance criteria|test task)/i.test(file.content)
  );

  if (!hasTests) {
    findings.push({
      id: "tests-missing",
      category: "quality",
      severity: "medium",
      title: "Functional tests are missing",
      message: "No tests/ directory was found.",
      recommendation: "Add tests/ with sample tasks, expected outputs, and forbidden behaviors."
    });
  }

  if (!hasExamples) {
    findings.push({
      id: "examples-missing",
      category: "quality",
      severity: "low",
      title: "Examples are missing",
      message: "No examples/ directory was found.",
      recommendation: "Add examples/ to make expected behavior easier to review."
    });
  }

  if (!hasAcceptanceLanguage) {
    findings.push({
      id: "acceptance-criteria-missing",
      category: "quality",
      severity: "low",
      title: "Acceptance criteria are missing",
      message: "The skill does not describe expected outputs or forbidden behavior.",
      recommendation: "Add acceptance criteria to SKILL.md or tests/."
    });
  }
}

function calculateScores(
  _findings: ReviewFinding[],
  _evaluation: FunctionalEvaluationReport,
  _skillSpector?: SkillSpectorScanSummary
): ReviewScores {
  // HaluCatch runs first; SkillSpector and VirusTotal run in parallel afterward.
  return {
    qualityScore: 100,
    securityScore: 100,
    reliabilityScore: 100
  };
}

const SKILLSPECTOR_FINDING_PREFIX = "skillspector-";
const VIRUSTOTAL_FINDING_PREFIX = "virustotal-";
const SKILLSPECTOR_UNAVAILABLE_FINDING_ID = "skillspector-unavailable";
const VIRUSTOTAL_SCAN_FAILED_FINDING_ID = "virustotal-scan-failed";
const REVIEW_HALUCATCH_UNAVAILABLE_FINDING_ID = "review-halucatch-unavailable";
const MEDIUM_CONFIDENCE_REJECT_PERCENT = 90;

function isHaluCatchEnabled(): boolean {
  return process.env.HALUCATCH_ENABLED?.toLowerCase() !== "false";
}

function getHaluCatchStageFailure(
  evaluation: FunctionalEvaluationReport
): ReviewStageFailure | undefined {
  if (!isHaluCatchEnabled()) {
    return undefined;
  }

  const unavailableFinding = evaluation.findings.find((finding) => finding.id === "halucatch-unavailable");
  if (unavailableFinding) {
    return {
      stage: "halucatch",
      message: unavailableFinding.message
    };
  }

  if (evaluation.provider !== "halucatch-adapter") {
    return {
      stage: "halucatch",
      message: "HaluCatch reliability evaluation did not complete successfully for this publish."
    };
  }

  const missingDimension = evaluation.findings.find((finding) =>
    /^halucatch-(foundation|code|rules|guardrails|complexity)-missing$/.test(finding.id)
  );
  if (missingDimension) {
    return {
      stage: "halucatch",
      message: missingDimension.message
    };
  }

  return undefined;
}

export {
  calculateReviewVerdict,
  isSkillSpectorReviewFinding,
  isVirusTotalReviewFinding,
  shouldRejectReviewInfrastructureFinding,
  shouldRejectSkillSpectorFinding,
  shouldRejectVirusTotalFinding,
} from "./review-verdict.js";

export {
  getConfiguredReviewStages,
  resolveReviewStagesToRun,
  runReviewPipeline,
  type ReviewPipelineState,
  type ReviewStageCompleteEvent,
  type RunReviewPipelineOptions,
} from "./review-pipeline.js";

function excerpt(content: string, index: number): string {
  const start = Math.max(0, index - 80);
  const end = Math.min(content.length, index + 160);
  return content.slice(start, end).replace(/\s+/g, " ").trim();
}

async function runSkillSpectorReviewStep(snapshot: SkillSnapshot): Promise<{
  skillSpector?: SkillSpectorScanSummary;
  skillSpectorAvailable: boolean;
  findings: ReviewFinding[];
  failure?: ReviewStageFailure;
}> {
  if (!isSkillSpectorEnabled()) {
    return { skillSpectorAvailable: false, findings: [] };
  }

  try {
    const scan = await runSkillSpectorSecurityScan(snapshot);
    return {
      skillSpector: scan.summary,
      skillSpectorAvailable: true,
      findings: scan.findings
    };
  } catch (error) {
    const message = truncateError(error);
    // Environment problem — surface as a stage failure (retryable) instead of a
    // review finding; the publish path reports review_pipeline_incomplete.
    return {
      skillSpectorAvailable: false,
      findings: [],
      failure: {
        stage: "skillspector",
        message
      }
    };
  }
}

async function runVirusTotalReviewStep(snapshot: SkillSnapshot): Promise<{
  virusTotal?: VirusTotalScanSummary;
  findings: ReviewFinding[];
  failure?: ReviewStageFailure;
}> {
  if (!isVirusTotalEnabled()) {
    return { findings: [] };
  }

  try {
    const scan = await runVirusTotalScan(snapshot);
    return {
      virusTotal: scan.summary,
      findings: scan.findings
    };
  } catch (error) {
    const message = formatVirusTotalError(error);
    // Integration error — record as a stage failure, do not fabricate a scan
    // summary or a finding for a scan that did not run.
    return {
      findings: [],
      failure: {
        stage: "virustotal",
        message
      }
    };
  }
}

function createHaluCatchUnavailableReviewFinding(message?: string): ReviewFinding {
  return {
    id: REVIEW_HALUCATCH_UNAVAILABLE_FINDING_ID,
    category: "reliability",
    severity: "high",
    title: "HaluCatch reliability evaluation unavailable",
    message:
      message ??
      "HaluCatch reliability evaluation did not complete successfully for this publish.",
    recommendation:
      "Install Python 3.8+ and keep packages/halucatch-1.8.8 available, or set HALUCATCH_PYTHON before publishing."
  };
}

function createFailedVirusTotalSummary(snapshot: SkillSnapshot, error: unknown): VirusTotalScanSummary {
  let sha256 = "";
  try {
    sha256 = createHash("sha256").update(skillSnapshotToZipBuffer(snapshot)).digest("hex");
  } catch {
    sha256 = snapshot.contentHash;
  }

  return {
    provider: "virustotal",
    sha256,
    status: "failed",
    malicious: 0,
    suspicious: 0,
    harmless: 0,
    undetected: 0,
    totalEngines: 0,
    error: formatVirusTotalError(error)
  };
}

function truncateError(error: unknown): string {
  const parts: string[] = [];
  if (error instanceof Error) {
    parts.push(error.message);
    const cause = error.cause;
    if (cause instanceof Error) {
      const code = "code" in cause && typeof cause.code === "string" ? cause.code : undefined;
      parts.push(code ? `${code}: ${cause.message}` : cause.message);
    }
  } else {
    parts.push(String(error));
  }
  const message = parts.filter(Boolean).join(" — ");
  return message.length <= 300 ? message : `${message.slice(0, 297)}...`;
}
