/**
 * Static review pipeline benchmark.
 *
 * Usage:
 *   npx tsx scripts/review-benchmark.ts [--sizes demo,1,10,50] [--skip-vt]
 *   npx tsx scripts/review-benchmark.ts --unlimited --vt-cold --sizes 1,10,50
 *
 * --unlimited   Sets REVIEW_BENCHMARK_UNLIMITED=true and raises stage timeout env defaults.
 * --vt-cold     Uses a unique benchmark-nonce per VirusTotal / full-pipeline run (no VT cache).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import {
  readSkillZipBuffer,
  skillSnapshotToZipBuffer,
  validateSkillSnapshot,
  type SkillSnapshot
} from "@skill-platform/skill-spec";
import {
  isVirusTotalEnabled,
  isVirusTotalUploadOnMissEnabled,
  inspectAndEvaluateSkillSnapshot,
  runVirusTotalScan
} from "@skill-platform/inspection-engine";
import {
  isSkillSpectorEnabled,
  runSkillSpectorSecurityScan
} from "../packages/inspection-engine/src/skillspector.js";
import { evaluateSkillSnapshot } from "@skill-platform/evaluator";
import {
  buildBenchmarkSkillSnapshot,
  formatBytes,
  parseBenchmarkSizeLabel,
  resolveBenchmarkTargetMb,
  type BenchmarkSizeLabel
} from "./benchmark-skill-package.js";

if (existsSync(".env")) {
  loadEnvFile(".env");
}

interface StageTiming {
  stage: string;
  ms: number;
  status: "ok" | "skipped" | "error";
  detail?: string;
}

interface PackageBenchmark {
  label: BenchmarkSizeLabel;
  targetMb: number;
  fileCount: number;
  uncompressedBytes: number;
  zipBytes: number;
  stages: StageTiming[];
  parallelSecurityMs: number;
  estimatedUserWaitMs: number;
  totalPipelineMs: number;
  inspectionStatus?: string;
  findingCount?: number;
  failedStages?: string[];
}

function readArgValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function applyUnlimitedBenchmarkEnv(): void {
  process.env.REVIEW_BENCHMARK_UNLIMITED = "true";
  process.env.SKILLSPECTOR_TIMEOUT_MS = "3600000";
  process.env.HALUCATCH_TIMEOUT_MS = "600000";
  process.env.VIRUSTOTAL_TIMEOUT_MS = "600000";
  process.env.VIRUSTOTAL_UPLOAD_TIMEOUT_MS = "600000";
  process.env.VIRUSTOTAL_ANALYSIS_TIMEOUT_MS = "3600000";
  process.env.VIRUSTOTAL_ANALYSIS_POLL_TIMEOUT_MS = "600000";
  process.env.VIRUSTOTAL_LOOKUP_TIMEOUT_MS = "120000";
}

function createRunNonce(label: BenchmarkSizeLabel, purpose: string): string {
  return `${label}-${purpose}-${Date.now()}-${createHash("sha256").update(String(Math.random())).digest("hex").slice(0, 12)}`;
}

function parseSnapshot(label: BenchmarkSizeLabel, runNonce?: string): {
  snapshot: SkillSnapshot;
  zipBytes: number;
} {
  const snapshot = buildBenchmarkSkillSnapshot(label, { runNonce });
  const zipBuffer = skillSnapshotToZipBuffer(snapshot);
  return {
    snapshot: readSkillZipBuffer(zipBuffer),
    zipBytes: zipBuffer.length
  };
}

async function timeStage(
  stage: string,
  runner: () => Promise<void> | void
): Promise<StageTiming> {
  const start = performance.now();
  try {
    await runner();
    return { stage, ms: performance.now() - start, status: "ok" };
  } catch (error) {
    return {
      stage,
      ms: performance.now() - start,
      status: "error",
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

function formatMs(ms: number): string {
  if (ms < 1000) {
    return `${ms.toFixed(0)} ms`;
  }
  return `${(ms / 1000).toFixed(2)} s`;
}

function stageMs(stages: StageTiming[], name: string): number {
  return stages.find((stage) => stage.stage === name)?.ms ?? 0;
}

async function benchmarkPackage(
  label: BenchmarkSizeLabel,
  options: { skipVt: boolean; vtCold: boolean }
): Promise<PackageBenchmark> {
  const targetMb = resolveBenchmarkTargetMb(label);
  const base = parseSnapshot(label);
  const parsed = base.snapshot;
  const uncompressedBytes = parsed.files.reduce((sum, file) => sum + file.size, 0);
  const stages: StageTiming[] = [];

  stages.push(
    await timeStage("zip_build", () => {
      skillSnapshotToZipBuffer(buildBenchmarkSkillSnapshot(label));
    })
  );

  stages.push(
    await timeStage("zip_parse", () => {
      parseSnapshot(label);
    })
  );

  stages.push(
    await timeStage("spec_validation", () => {
      validateSkillSnapshot(parsed);
    })
  );

  if (isSkillSpectorEnabled()) {
    stages.push(
      await timeStage("skillspector", async () => {
        await runSkillSpectorSecurityScan(parsed);
      })
    );
  } else {
    stages.push({ stage: "skillspector", ms: 0, status: "skipped", detail: "SKILLSPECTOR_ENABLED=false" });
  }

  if (!options.skipVt && isVirusTotalEnabled()) {
    const vtParsed = options.vtCold
      ? parseSnapshot(label, createRunNonce(label, "virustotal")).snapshot
      : parsed;
    stages.push(
      await timeStage("virustotal_cold_upload", async () => {
        if (!isVirusTotalUploadOnMissEnabled()) {
          throw new Error("VIRUSTOTAL_UPLOAD_ON_MISS must be true for cold VT benchmark");
        }
        await runVirusTotalScan(vtParsed);
      })
    );
  } else {
    stages.push({
      stage: "virustotal_cold_upload",
      ms: 0,
      status: "skipped",
      detail: options.skipVt ? "--skip-vt" : "VIRUSTOTAL_ENABLED=false or no API key"
    });
  }

  stages.push(
    await timeStage("halucatch", async () => {
      await evaluateSkillSnapshot(parsed);
    })
  );

  const pipelineParsed = options.vtCold
    ? parseSnapshot(label, createRunNonce(label, "pipeline")).snapshot
    : parsed;

  const pipelineStart = performance.now();
  let inspectionStatus: string | undefined;
  let findingCount: number | undefined;
  let failedStages: string[] | undefined;
  try {
    const result = await inspectAndEvaluateSkillSnapshot(pipelineParsed);
    inspectionStatus = result.failedStages.length > 0 ? "interrupted" : "completed";
    findingCount = result.inspection.findings.length;
    failedStages = result.failedStages.map((failure) => failure.stage);
  } catch (error) {
    failedStages = [error instanceof Error ? error.message : String(error)];
  }
  const totalPipelineMs = performance.now() - pipelineStart;
  stages.push({
    stage: "full_pipeline",
    ms: totalPipelineMs,
    status: failedStages?.length ? "error" : "ok",
    detail: failedStages?.join("; ")
  });

  stages.push(
    await timeStage("persist_zip_rebuild", () => {
      skillSnapshotToZipBuffer(parsed);
    })
  );

  const skillspectorMs = stageMs(stages, "skillspector");
  const virustotalMs = stageMs(stages, "virustotal_cold_upload");
  const halucatchMs = stageMs(stages, "halucatch");
  const parseMs = stageMs(stages, "zip_parse");
  const persistMs = stageMs(stages, "persist_zip_rebuild");
  const parallelSecurityMs = Math.max(skillspectorMs, virustotalMs);
  const estimatedUserWaitMs = parseMs + parallelSecurityMs + halucatchMs + persistMs;

  return {
    label,
    targetMb,
    fileCount: parsed.files.length,
    uncompressedBytes,
    zipBytes: base.zipBytes,
    stages,
    parallelSecurityMs,
    estimatedUserWaitMs,
    totalPipelineMs,
    inspectionStatus,
    findingCount,
    failedStages
  };
}

function printReport(results: PackageBenchmark[], options: { unlimited: boolean; vtCold: boolean }): void {
  console.log("\n=== Skill 静态审查测速报告 ===\n");
  console.log("环境:");
  console.log(`  无超时限制: ${options.unlimited ? "是 (REVIEW_BENCHMARK_UNLIMITED)" : "否"}`);
  console.log(`  VT 冷启动: ${options.vtCold ? "是 (唯一 benchmark-nonce)" : "否"}`);
  console.log(`  SkillSpector: ${isSkillSpectorEnabled() ? "enabled" : "disabled"}`);
  console.log(`  VirusTotal: ${isVirusTotalEnabled() ? "enabled" : "disabled"}`);
  console.log(`  VT upload on miss: ${isVirusTotalUploadOnMissEnabled() ? "true" : "false"}`);
  console.log(`  SKILLSPECTOR_TIMEOUT_MS: ${process.env.SKILLSPECTOR_TIMEOUT_MS ?? "(default 60000)"}`);
  console.log(`  HALUCATCH_TIMEOUT_MS: ${process.env.HALUCATCH_TIMEOUT_MS ?? "(default 30000)"}`);
  console.log(`  VIRUSTOTAL_ANALYSIS_TIMEOUT_MS: ${process.env.VIRUSTOTAL_ANALYSIS_TIMEOUT_MS ?? "(default)"}`);

  for (const result of results) {
    console.log(`\n--- 包规模: ${result.label.toUpperCase()} (目标 ${result.targetMb || "~demo"} MB) ---`);
    console.log(`  文件数: ${result.fileCount}`);
    console.log(`  解压文本总量: ${formatBytes(result.uncompressedBytes)}`);
    console.log(`  ZIP 体积: ${formatBytes(result.zipBytes)}`);
    console.log(`  审查状态: ${result.inspectionStatus ?? "n/a"} (${result.findingCount ?? 0} findings)`);
    if (result.failedStages?.length) {
      console.log(`  失败阶段: ${result.failedStages.join(", ")}`);
    }
    console.log(`  并行安全扫描: ${formatMs(result.parallelSecurityMs)} (max(SS, VT))`);
    console.log(`  预估用户等待: ${formatMs(result.estimatedUserWaitMs)} (解析+并行+HaluCatch+持久化)`);

    console.log("  各环节耗时:");
    for (const stage of result.stages) {
      const suffix =
        stage.status === "skipped"
          ? ` [skipped${stage.detail ? `: ${stage.detail}` : ""}]`
          : stage.status === "error"
            ? ` [ERROR: ${stage.detail}]`
            : "";
      console.log(`    ${stage.stage.padEnd(26)} ${formatMs(stage.ms).padStart(10)}${suffix}`);
    }
  }
}

function writeJsonReport(
  results: PackageBenchmark[],
  options: { unlimited: boolean; vtCold: boolean }
): string {
  const outputDir = resolve("tmp");
  mkdirSync(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = resolve(outputDir, `inspection-benchmark-${stamp}.json`);
  writeFileSync(
    outputPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        unlimited: options.unlimited,
        vtCold: options.vtCold,
        env: {
          SKILLSPECTOR_TIMEOUT_MS: process.env.SKILLSPECTOR_TIMEOUT_MS,
          HALUCATCH_TIMEOUT_MS: process.env.HALUCATCH_TIMEOUT_MS,
          VIRUSTOTAL_ANALYSIS_TIMEOUT_MS: process.env.VIRUSTOTAL_ANALYSIS_TIMEOUT_MS,
          VIRUSTOTAL_UPLOAD_ON_MISS: process.env.VIRUSTOTAL_UPLOAD_ON_MISS
        },
        results
      },
      null,
      2
    ),
    "utf8"
  );
  return outputPath;
}

async function main(): Promise<void> {
  const unlimited = hasFlag("--unlimited");
  const vtCold = hasFlag("--vt-cold") || unlimited;
  const skipVt = hasFlag("--skip-vt");

  if (unlimited) {
    applyUnlimitedBenchmarkEnv();
  }

  const sizesArg = readArgValue("--sizes") ?? "demo,1,10,50";
  const labels = sizesArg
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => parseBenchmarkSizeLabel(value));

  const results: PackageBenchmark[] = [];
  for (const label of labels) {
    console.log(`\nBenchmarking ${label}${vtCold ? " (VT cold)" : ""}${unlimited ? " (unlimited)" : ""}...`);
    results.push(await benchmarkPackage(label, { skipVt, vtCold }));
  }

  printReport(results, { unlimited, vtCold });
  const reportPath = writeJsonReport(results, { unlimited, vtCold });
  console.log(`\nJSON 报告: ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
