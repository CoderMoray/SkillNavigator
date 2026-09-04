import { createHash } from "node:crypto";
import type { SkillFile, SkillSnapshot } from "@skill-platform/skill-spec";

export type BenchmarkSizeLabel = "demo" | "1mb" | "10mb" | "50mb";

export function parseBenchmarkSizeLabel(value: string): BenchmarkSizeLabel {
  const normalized = value.trim().toLowerCase();
  if (normalized === "demo") {
    return "demo";
  }
  if (normalized === "1" || normalized === "1mb") {
    return "1mb";
  }
  if (normalized === "10" || normalized === "10mb") {
    return "10mb";
  }
  if (normalized === "50" || normalized === "50mb") {
    return "50mb";
  }
  throw new Error(`Unknown benchmark size label: ${value}`);
}

export function resolveBenchmarkTargetMb(label: BenchmarkSizeLabel): number {
  switch (label) {
    case "demo":
      return 0;
    case "1mb":
      return 1;
    case "10mb":
      return 10;
    case "50mb":
      return 50;
  }
}

export function benchmarkExampleDirName(label: BenchmarkSizeLabel): string {
  return `bench-${label}`;
}

export interface BuildBenchmarkSkillOptions {
  targetMb?: number;
  /** Varies ZIP SHA-256 so VirusTotal always misses cache (cold upload benchmark). */
  runNonce?: string;
}

function buildSkillMarkdown(slug: string, version: string, runNonce?: string): string {
  const nonceLine = runNonce ? `benchmark-nonce: ${runNonce}\n` : "";
  return `---
slug: ${slug}
name: Benchmark Skill ${slug}
description: Synthetic benchmark package for static review timing. Use when measuring review pipeline performance.
version: ${version}
author: benchmark
license: MIT
${nonceLine}tags:
  - benchmark
allowed-tools:
  - Read
---

# Benchmark Skill

This package exists only for review pipeline benchmarking.

## Workflow

1. Read input.
2. Return structured output.
`;
}

function fillerLine(index: number): string {
  return `Reference note ${index}: document patterns, examples, and guidance for skill authors.\n`;
}

function buildFillerBytes(targetBytes: number): string {
  if (targetBytes <= 0) {
    return "";
  }
  const line = fillerLine(0);
  const lineBytes = Buffer.byteLength(line, "utf8");
  const lines = Math.max(1, Math.ceil(targetBytes / lineBytes));
  let content = Array.from({ length: lines }, (_, index) => fillerLine(index)).join("");
  while (Buffer.byteLength(content, "utf8") > targetBytes) {
    content = content.slice(0, Math.max(0, content.length - 64));
  }
  return content;
}

export function buildBenchmarkSkillSnapshot(
  label: BenchmarkSizeLabel,
  options: BuildBenchmarkSkillOptions = {}
): SkillSnapshot {
  const targetMb = options.targetMb ?? resolveBenchmarkTargetMb(label);
  const slug = benchmarkExampleDirName(label);
  const version = "0.0.1";
  const files: SkillFile[] = [
    {
      path: "SKILL.md",
      content: buildSkillMarkdown(slug, version, options.runNonce),
      sha256: "",
      size: 0
    },
    {
      path: "tests/smoke.json",
      content: JSON.stringify(
        {
          tasks: [
            {
              name: "basic",
              input: "hello",
              expectedOutput: ["structured output"],
              successCriteria: ["Returns structured output"]
            }
          ]
        },
        null,
        2
      ),
      sha256: "",
      size: 0
    }
  ];

  const skillBytes = Buffer.byteLength(files[0]!.content, "utf8");
  const testsBytes = Buffer.byteLength(files[1]!.content, "utf8");
  const bundleLimit = 50 * 1024 * 1024;
  let remaining = Math.max(0, Math.min(targetMb * 1024 * 1024, bundleLimit) - skillBytes - testsBytes);

  const maxFileBytes = 900 * 1024;
  let fileIndex = 0;
  while (remaining > 0) {
    const chunkBytes = Math.min(remaining, maxFileBytes);
    let content = buildFillerBytes(chunkBytes);
    while (Buffer.byteLength(content, "utf8") > 1024 * 1024) {
      content = content.slice(0, Math.floor(content.length * 0.95));
    }
    const actualBytes = Buffer.byteLength(content, "utf8");
    if (actualBytes <= 0) {
      break;
    }
    files.push({
      path: `references/filler-${String(fileIndex).padStart(3, "0")}.md`,
      content,
      sha256: "",
      size: 0
    });
    remaining -= actualBytes;
    fileIndex += 1;
  }

  for (const file of files) {
    const bytes = Buffer.from(file.content, "utf8");
    file.size = bytes.length;
    file.sha256 = createHash("sha256").update(bytes).digest("hex");
  }

  const contentHash = createHash("sha256")
    .update(files.map((file) => `${file.path}\0${file.sha256}`).join("\n"))
    .digest("hex");

  const skillEntry = files[0]!;
  const parsedBody = skillEntry.content.split("---").slice(2).join("---").trim();

  return {
    manifest: {
      slug,
      name: `Benchmark Skill ${label}`,
      description:
        "Synthetic benchmark package for static review timing. Use when measuring review pipeline performance.",
      version,
      author: "benchmark",
      license: "MIT",
      tags: ["benchmark"],
      allowedTools: ["Read"]
    },
    readme: parsedBody,
    files,
    contentHash,
    createdAt: new Date().toISOString(),
    entryPath: "SKILL.md"
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
