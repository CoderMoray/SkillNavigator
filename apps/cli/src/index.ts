#!/usr/bin/env node
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { Command } from "commander";
import { evaluateSkillSnapshot, type FunctionalEvaluationReport } from "@skill-platform/evaluator";
import { reviewAndEvaluateSkillSnapshot, type ReviewReport } from "@skill-platform/review-engine";
import {
  getSkillSlug,
  readSkillPackage,
  readSkillPackageZipBuffer,
  readSkillZipBuffer,
  writeSkillSnapshot
} from "@skill-platform/skill-spec";

const defaultRegistry = process.env.SKILL_REGISTRY_URL ?? "http://127.0.0.1:3000";

/** Build a registry URL preserving any base path prefix (e.g. "/MonoSkillNavigator/api"). */
function registryUrl(registry: string, path: string): URL {
  return new URL(path.replace(/^\/+/, ""), `${registry.replace(/\/+$/, "")}/`);
}

interface ApiResponse<T> {
  status: number;
  body: T;
}

interface BinaryResponse {
  status: number;
  body: Buffer;
  error?: string;
  fileName?: string;
}

const program = new Command();

program
  .name("skill-platform")
  .description("CLI for the Skill management platform")
  .version("0.1.0");

program
  .command("review")
  .description("Review a local skill directory or zip package")
  .argument("<package>", "Skill directory or .zip package")
  .option("--version <version>", "Version used in the review report")
  .option("--json", "Print raw JSON report")
  .action(async (input: string, options: { version?: string; json?: boolean }) => {
    const snapshot = await readSkillPackage(resolveUserPath(input));
    const { review: report } = await reviewAndEvaluateSkillSnapshot(snapshot, options.version);

    if (options.json) {
      printJson(report);
      return;
    }

    printReview(report);
  });

program
  .command("publish")
  .description("Publish a local skill directory or zip package to the registry")
  .argument("<package>", "Skill directory or .zip package")
  .option("--version <version>", "Version to publish")
  .option("--registry <url>", "Registry API URL", defaultRegistry)
  .option("--token <token>", "Bearer token, defaults to SKILL_AUTH_TOKEN")
  .action(async (input: string, options: { version?: string; registry: string; token?: string }) => {
    const archive = await readSkillPackageZipBuffer(resolveUserPath(input));
    const response = await postJson<{
      slug: string;
      name: string;
      version: string;
      status: string;
      contentHash: string;
      review: ReviewReport;
      evaluation?: FunctionalEvaluationReport;
    }>(`${options.registry}/skills/publish`, {
      archiveBase64: archive.toString("base64"),
      version: options.version
    }, requireAuthToken(options.token));

    if (response.status >= 400) {
      printJson(response.body);
      process.exitCode = 1;
      return;
    }

    console.log(`Published ${response.body.name} (${response.body.slug})@${response.body.version}`);
    console.log(`Status: ${response.body.status}`);
    console.log(`Hash: ${response.body.contentHash}`);
    printReview(response.body.review);
    if (response.body.evaluation) {
      printEvaluation(response.body.evaluation);
    }
  });

program
  .command("evaluate")
  .description("Run HaluCatch reliability and quality evaluation for a local Skill package")
  .argument("<package>", "Skill directory or .zip package")
  .option("--json", "Print raw JSON report")
  .action(async (input: string, options: { json?: boolean }) => {
    const snapshot = await readSkillPackage(resolveUserPath(input));
    const evaluation = await evaluateSkillSnapshot(snapshot);

    if (options.json) {
      printJson(evaluation);
      return;
    }

    printEvaluation(evaluation);
  });

program
  .command("search")
  .description("Search skills in the registry")
  .argument("[query]", "Search query", "")
  .option("--registry <url>", "Registry API URL", defaultRegistry)
  .action(async (query: string, options: { registry: string }) => {
    const url = registryUrl(options.registry, "/skills");
    if (query) {
      url.searchParams.set("query", query);
    }

    const response = await getJson<{ items: Array<Record<string, unknown>> }>(url.toString());
    printJson(response.body);
  });

program
  .command("top")
  .description("Show registry leaderboard")
  .option("--sort <sort>", "downloads, rating, quality, security, reliability, recent", "downloads")
  .option("--limit <limit>", "Number of skills to show", "20")
  .option("--registry <url>", "Registry API URL", defaultRegistry)
  .action(async (options: { sort: string; limit: string; registry: string }) => {
    const url = registryUrl(options.registry, "/leaderboard");
    url.searchParams.set("sort", options.sort);
    url.searchParams.set("limit", options.limit);

    const response = await getJson<{ items: Array<Record<string, unknown>> }>(url.toString());
    printJson(response.body);
  });

program
  .command("info")
  .description("Show skill metadata")
  .argument("<slug>", "Skill slug")
  .option("--registry <url>", "Registry API URL", defaultRegistry)
  .action(async (slug: string, options: { registry: string }) => {
    const response = await getJson<Record<string, unknown>>(
      `${options.registry}/skills/${encodeURIComponent(slug)}`
    );
    printJson(response.body);
  });

program
  .command("install")
  .description("Download a skill zip from the registry and install it as a directory")
  .argument("<slug>", "Skill slug")
  .argument("[targetDir]", "Target directory")
  .option("--version <version>", "Version to install", "latest")
  .option("--registry <url>", "Registry API URL", defaultRegistry)
  .option("--token <token>", "Bearer token, defaults to SKILL_AUTH_TOKEN")
  .action(
    async (
      slug: string,
      targetDir: string | undefined,
      options: { version: string; registry: string; token?: string }
    ) => {
      const authToken = requireAuthToken(options.token);
      const endpoint = `${options.registry}/skills/${encodeURIComponent(slug)}/versions/${encodeURIComponent(options.version)}/download`;
      const response = await getBinary(endpoint, authToken);

      if (response.status >= 400) {
        console.error(response.error ?? `Download failed: ${response.status}`);
        process.exitCode = 1;
        return;
      }

      const snapshot = readSkillZipBuffer(response.body);
      const installDir = resolveUserPath(targetDir ?? getSkillSlug(snapshot.manifest));
      await writeSkillSnapshot(snapshot, installDir);
      console.log(`Installed ${snapshot.manifest.name} to ${installDir}`);
      console.log(`Hash: ${snapshot.contentHash}`);
    }
  );

program
  .command("download")
  .description("Download a skill version as a zip package")
  .argument("<slug>", "Skill slug")
  .argument("[output]", "Output zip path")
  .option("--version <version>", "Version to download", "latest")
  .option("--registry <url>", "Registry API URL", defaultRegistry)
  .option("--token <token>", "Bearer token, defaults to SKILL_AUTH_TOKEN")
  .action(async (slug: string, output: string | undefined, options: { version: string; registry: string; token?: string }) => {
    const authToken = requireAuthToken(options.token);
    const endpoint = `${options.registry}/skills/${encodeURIComponent(slug)}/versions/${encodeURIComponent(options.version)}/download`;
    const response = await getBinary(endpoint, authToken);

    if (response.status >= 400) {
      console.error(response.error ?? `Download failed: ${response.status}`);
      process.exitCode = 1;
      return;
    }

    const outputPath = resolveUserPath(output ?? response.fileName ?? `${slug}-${options.version}.zip`);
    await writeFile(outputPath, response.body);
    console.log(`Downloaded ${slug}@${options.version} to ${outputPath}`);
  });

program
  .command("rate")
  .description("Rate a skill in the registry")
  .argument("<slug>", "Skill slug")
  .requiredOption("--score <score>", "Score from 1 to 5")
  .option("--version <version>", "Version being rated")
  .option("--comment <comment>", "Optional rating comment")
  .option("--registry <url>", "Registry API URL", defaultRegistry)
  .option("--token <token>", "Bearer token, defaults to SKILL_AUTH_TOKEN")
  .action(
    async (
      slug: string,
      options: { score: string; version?: string; comment?: string; registry: string; token?: string }
    ) => {
      const authToken = requireAuthToken(options.token);
      const response = await postJson<Record<string, unknown>>(
        `${options.registry}/skills/${encodeURIComponent(slug)}/ratings`,
        {
        score: Number(options.score),
        version: options.version,
        comment: options.comment
        },
        authToken
      );
      printJson(response.body);
    }
  );

program
  .command("issue")
  .description("Create an issue for a skill")
  .argument("<slug>", "Skill slug")
  .requiredOption("--title <title>", "Issue title")
  .option("--type <type>", "bug, security, compatibility, feature, docs", "bug")
  .option("--severity <severity>", "low, medium, high, critical", "medium")
  .option("--body <body>", "Issue body")
  .option("--registry <url>", "Registry API URL", defaultRegistry)
  .option("--token <token>", "Bearer token, defaults to SKILL_AUTH_TOKEN")
  .action(
    async (
      slug: string,
      options: {
        title: string;
        type: string;
        severity: string;
        body?: string;
        registry: string;
        token?: string;
      }
    ) => {
      const authToken = requireAuthToken(options.token);
      const response = await postJson<Record<string, unknown>>(
        `${options.registry}/skills/${encodeURIComponent(slug)}/issues`,
        {
        title: options.title,
        type: options.type,
        severity: options.severity,
        body: options.body
        },
        authToken
      );
      printJson(response.body);
    }
  );

program
  .command("issues")
  .description("List issues for a skill")
  .argument("<slug>", "Skill slug")
  .option("--status <status>", "open, triaged, closed")
  .option("--registry <url>", "Registry API URL", defaultRegistry)
  .action(async (slug: string, options: { status?: string; registry: string }) => {
    const url = registryUrl(options.registry, `/skills/${encodeURIComponent(slug)}/issues`);
    if (options.status) {
      url.searchParams.set("status", options.status);
    }

    const response = await getJson<Record<string, unknown>>(url.toString());
    printJson(response.body);
  });

program
  .command("contributor")
  .description("Add a skill contributor (skill owner token required)")
  .argument("<slug>", "Skill slug")
  .requiredOption("--person <person>", "Contributor display name")
  .option("--registry <url>", "Registry API URL", defaultRegistry)
  .option("--token <token>", "Bearer token, defaults to SKILL_AUTH_TOKEN")
  .action(async (slug: string, options: { person: string; registry: string; token?: string }) => {
    const response = await postJson<Record<string, unknown>>(
      `${options.registry}/skills/${encodeURIComponent(slug)}/contributors`,
      {
        name: options.person,
        role: "contributor"
      },
      requireAuthToken(options.token)
    );
    printJson(response.body);
  });

program
  .command("remove-contributor")
  .description("Remove a skill contributor (skill owner token required)")
  .argument("<slug>", "Skill slug")
  .requiredOption("--id <id>", "Contributor id")
  .option("--registry <url>", "Registry API URL", defaultRegistry)
  .option("--token <token>", "Bearer token, defaults to SKILL_AUTH_TOKEN")
  .action(async (slug: string, options: { id: string; registry: string; token?: string }) => {
    const response = await deleteJson<Record<string, unknown>>(
      `${options.registry}/skills/${encodeURIComponent(slug)}/contributors/${encodeURIComponent(options.id)}`,
      requireAuthToken(options.token)
    );
    printJson(response.body);
  });

program
  .command("review-remote")
  .description("Ask the API to review a local skill snapshot without publishing it")
  .argument("<package>", "Skill directory or .zip package")
  .option("--version <version>", "Version used in the review report")
  .option("--registry <url>", "Registry API URL", defaultRegistry)
  .option("--token <token>", "Bearer token, defaults to SKILL_AUTH_TOKEN")
  .action(async (input: string, options: { version?: string; registry: string; token?: string }) => {
    const archive = await readSkillPackageZipBuffer(resolveUserPath(input));
    const response = await postJson<{ review: ReviewReport; evaluation?: FunctionalEvaluationReport }>(`${options.registry}/reviews/run`, {
      archiveBase64: archive.toString("base64"),
      version: options.version
    }, requireAuthToken(options.token));
    printReview(response.body.review);
    if (response.body.evaluation) {
      printEvaluation(response.body.evaluation);
    }
  });

await program.parseAsync(process.argv);

async function getJson<T>(url: string): Promise<ApiResponse<T>> {
  const response = await fetch(url);
  return {
    status: response.status,
    body: (await response.json()) as T
  };
}

async function getBinary(url: string, token?: string): Promise<BinaryResponse> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });
  const body = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? "";
  const error = !response.ok && contentType.includes("application/json")
    ? ((JSON.parse(body.toString("utf8")) as { error?: string }).error ?? body.toString("utf8"))
    : undefined;

  return {
    status: response.status,
    body,
    error,
    fileName: parseContentDispositionFilename(response.headers.get("content-disposition"))
  };
}

function parseContentDispositionFilename(header: string | null): string | undefined {
  if (!header) {
    return undefined;
  }

  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const asciiMatch = header.match(/filename="([^"]+)"/i) ?? header.match(/filename=([^;]+)/i);
  return asciiMatch?.[1]?.trim();
}

async function postJson<T>(url: string, body: unknown, token?: string): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  return {
    status: response.status,
    body: (await response.json()) as T
  };
}

async function deleteJson<T>(url: string, token?: string): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: "DELETE",
    headers
  });

  return {
    status: response.status,
    body: (await response.json()) as T
  };
}

function printReview(report: ReviewReport): void {
  console.log(`Review: ${report.skillName}@${report.version}`);
  console.log(`Verdict: ${report.verdict}`);
  console.log(
    `Scores: quality=${report.scores.qualityScore}, security=${report.scores.securityScore}, reliability=${report.scores.reliabilityScore}`
  );

  if (report.findings.length === 0) {
    console.log("Findings: none");
    return;
  }

  console.log("Findings:");
  for (const finding of report.findings) {
    const location = finding.path ? ` (${finding.path})` : "";
    console.log(`- [${finding.severity}/${finding.category}] ${finding.title}${location}`);
    console.log(`  ${finding.message}`);
    console.log(`  Recommendation: ${finding.recommendation}`);
  }
}

function printEvaluation(report: FunctionalEvaluationReport): void {
  console.log(`Evaluation: ${report.provider}`);
  console.log(
    `Status: ${report.status}, score=${report.score}, tasks=${report.tasksPassed}/${report.tasksTotal}`
  );

  if (report.findings.length === 0) {
    console.log("Evaluation findings: none");
    return;
  }

  console.log("Evaluation findings:");
  for (const finding of report.findings) {
    const task = finding.task ? ` (${finding.task})` : "";
    console.log(`- [${finding.severity}] ${finding.message}${task}`);
    console.log(`  Recommendation: ${finding.recommendation}`);
  }
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function resolveUserPath(value: string): string {
  if (path.isAbsolute(value)) {
    return value;
  }

  return path.resolve(process.env.INIT_CWD ?? process.cwd(), value);
}

function resolveAuthToken(token: string | undefined): string | undefined {
  return token ?? process.env.SKILL_AUTH_TOKEN;
}

function requireAuthToken(token: string | undefined): string {
  const resolved = resolveAuthToken(token);
  if (!resolved) {
    console.error("Authentication required. Pass --token or set SKILL_AUTH_TOKEN.");
    process.exit(1);
  }
  return resolved;
}
