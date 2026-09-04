/**
 * Export synthetic benchmark Skill packages to examples/.
 *
 * Usage:
 *   npx tsx scripts/export-benchmark-examples.ts [--sizes 1,10,50]
 */
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { skillSnapshotToZipBuffer, writeSkillSnapshot, writeSkillZip } from "@skill-platform/skill-spec";
import {
  benchmarkExampleDirName,
  buildBenchmarkSkillSnapshot,
  formatBytes,
  parseBenchmarkSizeLabel,
  type BenchmarkSizeLabel
} from "./benchmark-skill-package.js";

const EXAMPLES_ROOT = resolve("examples");
const DEFAULT_LABELS: BenchmarkSizeLabel[] = ["1mb", "10mb", "50mb"];

function readArgValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

async function exportBenchmarkExample(label: BenchmarkSizeLabel): Promise<void> {
  const dirName = benchmarkExampleDirName(label);
  const targetDir = resolve(EXAMPLES_ROOT, dirName);
  const zipPath = resolve(EXAMPLES_ROOT, `${dirName}.zip`);

  console.log(`Exporting ${label} -> ${targetDir}`);
  const snapshot = buildBenchmarkSkillSnapshot(label);
  const uncompressedBytes = snapshot.files.reduce((sum, file) => sum + file.size, 0);

  await rm(targetDir, { force: true, recursive: true });
  await rm(zipPath, { force: true });

  await writeSkillSnapshot(snapshot, targetDir);
  await writeSkillZip(snapshot, zipPath);

  const zipBytes = skillSnapshotToZipBuffer(snapshot).length;
  console.log(
    `  files=${snapshot.files.length}, uncompressed=${formatBytes(uncompressedBytes)}, zip=${formatBytes(zipBytes)}`
  );
}

async function main(): Promise<void> {
  const sizesArg = readArgValue("--sizes") ?? "1,10,50";
  const labels = sizesArg
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => parseBenchmarkSizeLabel(value));

  for (const label of labels) {
    await exportBenchmarkExample(label);
  }

  console.log("\nDone. Example paths:");
  for (const label of labels.length > 0 ? labels : DEFAULT_LABELS) {
    const dirName = benchmarkExampleDirName(label);
    console.log(`  examples/${dirName}/`);
    console.log(`  examples/${dirName}.zip`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
