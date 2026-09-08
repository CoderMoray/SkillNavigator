import type { FunctionalEvaluationFinding, FunctionalEvaluationReport, FunctionalEvaluationTaskResult, HaluCatchReportBundle } from "@skill-platform/evaluator";
import type { InspectionFinding, InspectionReport } from "@skill-platform/inspection-engine";
import {
  getSkillSlug,
  parseSkillMarkdown,
  findSkillEntryFile,
  type SkillFile,
  type SkillManifest,
  type SkillSnapshot
} from "@skill-platform/skill-spec";
import { assertPublishPreflight } from "../publish-preflight.js";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, sql, desc, or, ilike, inArray, isNull, isNotNull, lte, ne } from "drizzle-orm";
import pg from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../schema";
import type {
  ArtifactDescriptor, ArtifactProvider, ArtifactStore,
  IssueSeverity, IssueStatus, IssueType,
  MarkSkillInspectionStatusOptions,
  CommitInspectionResultsOptions,
  PersistInspectionStageResultsOptions,
  RecoverStaleInspectingSkillsOptions,
  PublishSnapshotOptions,
  StagePendingPublishSnapshotOptions,
  PostgresRegistryStoreOptions,
  RegistryContributor, RegistryData, RegistryIssue, RegistryRating,
  RegistrySkill, RegistryVersion, SkillSearchResult,
  RecycleBinSkill,
  SkillInspectionFailureInfo,
  SkillInspectionStatus,
  SkillSlugAvailability,
} from "../types";
import {
  DEFAULT_SKILL_INSPECTION_STATUS,
  isSkillInspectionStatus,
  parseSkillInspectionStages,
  INSPECTION_INTERRUPTED_MESSAGE,
  INSPECTION_STALE_MESSAGE,
  INSPECTION_SUPERSEDED_MESSAGE,
  readInspectionStaleMs,
} from "../inspection-status.js";
import { skillRecyclePurgeAt, skillRecycleRetentionMs } from "../recycle-bin";
import { parseSkillSpectorInspectionRow, skillSpectorInspectionColumns } from "../skillspector-inspection";
import { parseVirusTotalInspectionRow, virusTotalInspectionColumns } from "../virustotal-inspection";
import { normalizeContributorRole, assertAssignableContributorRole } from "../contributors";
import {
  assertSkillRepublishAllowed,
  assertSkillVersionRepublishAllowed,
  normalizeCategoryFilters,
  toIsoTimestampString,
  resolveVersionReference,
} from "../utils";
import { JsonRegistryStore } from "./base";

type DB = NodePgDatabase<typeof schema>;
type DrizzleTx = Parameters<Parameters<DB["transaction"]>[0]>[0];

type EvaluationFindingRow = {
  findingId: string;
  taskName: string | null;
  severity: string;
  message: string;
  recommendation: string;
};

function parseSkillInspectionStatus(value: string | null | undefined): SkillInspectionStatus {
  return value && isSkillInspectionStatus(value) ? value : DEFAULT_SKILL_INSPECTION_STATUS;
}

function mapReviewFailureFromRow(
  inspectionStatus: SkillInspectionStatus,
  stages: string[] | null | undefined,
  message: string | null | undefined
): SkillInspectionFailureInfo | undefined {
  if (inspectionStatus !== "failed") {
    return undefined;
  }

  const parsedStages = parseSkillInspectionStages(stages);
  if (!parsedStages.length && !message) {
    return undefined;
  }

  return {
    stages: parsedStages,
    message: message ?? "审查流程未完成",
  };
}

function resolveMarkReviewTargetVersion(
  options: MarkSkillInspectionStatusOptions | undefined,
  existingLatestVersion: string | undefined
): string | undefined {
  return options?.version ?? options?.latestVersion ?? options?.setLatestVersion ?? existingLatestVersion;
}

function resolveMarkReviewLatestPointer(
  options: MarkSkillInspectionStatusOptions | undefined
): string | undefined {
  return options?.setLatestVersion ?? options?.latestVersion;
}

function inspectionFailurePatch(
  inspectionStatus: SkillInspectionStatus,
  failure?: SkillInspectionFailureInfo
): {
  inspectionFailedStages: string[];
  inspectionFailedMessage: string | null;
} {
  if (inspectionStatus === "failed" && failure) {
    return {
      inspectionFailedStages: failure.stages,
      inspectionFailedMessage: failure.message,
    };
  }

  if (inspectionStatus !== "failed") {
    return {
      inspectionFailedStages: [],
      inspectionFailedMessage: null,
    };
  }

  return {
    inspectionFailedStages: [],
    inspectionFailedMessage: "审查流程未完成",
  };
}

function skillReviewTimingPatch(
  inspectionStatus: SkillInspectionStatus,
  now: Date
): {
  inspectionStartedAt?: Date | null;
  inspectionEndedAt?: Date | null;
} {
  if (inspectionStatus === "inspecting") {
    return { inspectionStartedAt: now, inspectionEndedAt: null };
  }
  if (inspectionStatus === "completed" || inspectionStatus === "failed") {
    return { inspectionEndedAt: now };
  }
  return {};
}

function mapOptionalTimestamp(value: Date | string | null | undefined): string | undefined {
  if (value == null) {
    return undefined;
  }
  return toIsoTimestampString(value);
}

function toFunctionalEvaluationFinding(row: EvaluationFindingRow): FunctionalEvaluationFinding {
  return {
    id: row.findingId,
    task: row.taskName ?? undefined,
    severity: row.severity as FunctionalEvaluationFinding["severity"],
    message: row.message,
    recommendation: row.recommendation,
  };
}

function mapContributorRow(row: {
  id: string;
  userId: string | null;
  username: string | null;
  name: string;
  role: string;
  addedAt: Date | string;
}): RegistryContributor {
  return {
    id: row.id,
    userId: row.userId ?? undefined,
    username: row.username ?? undefined,
    name: row.name,
    role: normalizeContributorRole(row.role),
    addedAt: toIsoTimestampString(row.addedAt),
  };
}

function parseHaluCatchReport(value: string | null | undefined): HaluCatchReportBundle | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value) as HaluCatchReportBundle;
  } catch {
    return undefined;
  }
}

function serializeHaluCatchReport(report: HaluCatchReportBundle | undefined): string | null {
  return report ? JSON.stringify(report) : null;
}

function toStringList(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

type SkillVersionArtifactRow = Pick<
  typeof schema.skillVersions.$inferSelect,
  | "artifactProvider"
  | "artifactBucket"
  | "artifactObjectKey"
  | "artifactContentHash"
  | "artifactSize"
  | "artifactStoredAt"
>;

type StoredSkillFile = Pick<
  typeof schema.skillVersionFiles.$inferSelect,
  "path" | "content" | "size" | "sha256"
>;

function artifactDescriptorFromRow(
  row: SkillVersionArtifactRow,
  slug: string,
  version: string
): ArtifactDescriptor | undefined {
  if (!row.artifactProvider) {
    return undefined;
  }

  if (
    !row.artifactBucket ||
    !row.artifactObjectKey ||
    !row.artifactContentHash ||
    row.artifactSize == null ||
    !row.artifactStoredAt
  ) {
    throw new Error(`Artifact descriptor is incomplete for ${slug}@${version}`);
  }

  return {
    provider: row.artifactProvider as ArtifactProvider,
    bucket: row.artifactBucket,
    objectKey: row.artifactObjectKey,
    contentHash: row.artifactContentHash,
    size: Number(row.artifactSize),
    storedAt: toIsoTimestampString(row.artifactStoredAt),
  };
}

function databaseFilesToSnapshotFiles(
  files: StoredSkillFile[],
  slug: string,
  version: string
): SkillFile[] {
  return files.map((file) => {
    if (typeof file.content !== "string") {
      throw new Error(
        `Skill content for ${slug}@${version} is stored in its artifact; enable the configured artifact store`
      );
    }

    return {
      path: file.path,
      content: file.content,
      size: file.size,
      sha256: file.sha256,
    };
  });
}

function hydrateFilesFromArtifact(
  files: StoredSkillFile[],
  artifactSnapshot: SkillSnapshot,
  slug: string,
  version: string
): SkillFile[] {
  const artifactFiles = new Map<string, SkillFile>();
  for (const file of artifactSnapshot.files) {
    if (artifactFiles.has(file.path)) {
      throw new Error(`Artifact for ${slug}@${version} contains duplicate file path: ${file.path}`);
    }
    artifactFiles.set(file.path, file);
  }

  if (artifactFiles.size !== files.length) {
    throw new Error(`Artifact file list does not match stored metadata for ${slug}@${version}`);
  }

  return files.map((file) => {
    const artifactFile = artifactFiles.get(file.path);
    if (
      !artifactFile ||
      artifactFile.size !== file.size ||
      artifactFile.sha256 !== file.sha256
    ) {
      throw new Error(`Artifact file metadata does not match PostgreSQL for ${slug}@${version}: ${file.path}`);
    }

    return {
      path: file.path,
      content: artifactFile.content,
      size: file.size,
      sha256: file.sha256,
    };
  });
}

function parseManifestFromDatabaseFiles(files: StoredSkillFile[]): SkillManifest | undefined {
  const skillMd = findSkillEntryFile(files);
  if (!skillMd || typeof skillMd.content !== "string") {
    return undefined;
  }

  try {
    return parseSkillMarkdown(skillMd.content).manifest;
  } catch {
    return undefined;
  }
}

async function replaceEvaluationDetails(db: DrizzleTx, slug: string, version: string, evaluation: FunctionalEvaluationReport) {
  const reportFindings = Array.isArray(evaluation.findings) ? evaluation.findings : [];
  const taskResults = Array.isArray(evaluation.taskResults) ? evaluation.taskResults : [];

  await db.delete(schema.skillEvaluationReportFindings)
    .where(and(eq(schema.skillEvaluationReportFindings.skillSlug, slug), eq(schema.skillEvaluationReportFindings.version, version)));
  await db.delete(schema.skillEvaluationTaskFindings)
    .where(and(eq(schema.skillEvaluationTaskFindings.skillSlug, slug), eq(schema.skillEvaluationTaskFindings.version, version)));
  await db.delete(schema.skillEvaluationTasks)
    .where(and(eq(schema.skillEvaluationTasks.skillSlug, slug), eq(schema.skillEvaluationTasks.version, version)));

  if (reportFindings.length) {
    await db.insert(schema.skillEvaluationReportFindings).values(
      reportFindings.map((finding, position) => ({
        skillSlug: slug,
        version,
        position,
        findingId: finding.id ?? `evaluation_report_finding_${position}`,
        taskName: finding.task ?? null,
        severity: finding.severity,
        message: finding.message,
        recommendation: finding.recommendation,
      }))
    );
  }

  if (taskResults.length) {
    await db.insert(schema.skillEvaluationTasks).values(
      taskResults.map((task, taskPosition) => ({
        skillSlug: slug,
        version,
        taskPosition,
        name: task.name,
        score: task.score,
      }))
    );

    const taskFindings = taskResults.flatMap((task, taskPosition) =>
      (Array.isArray(task.findings) ? task.findings : []).map((finding, position) => ({
        skillSlug: slug,
        version,
        taskPosition,
        position,
        findingId: finding.id ?? `evaluation_task_finding_${taskPosition}_${position}`,
        taskName: finding.task ?? task.name,
        severity: finding.severity,
        message: finding.message,
        recommendation: finding.recommendation,
      }))
    );

    if (taskFindings.length) {
      await db.insert(schema.skillEvaluationTaskFindings).values(taskFindings);
    }
  }
}

export class PostgresRegistryStore extends JsonRegistryStore {
  private readonly pool: pg.Pool;
  private db!: DB;
  private schemaReady?: Promise<void>;

  constructor(databaseUrl: string, options: PostgresRegistryStoreOptions = {}) {
    super(options.artifactStore);
    this.pool = new pg.Pool({ connectionString: databaseUrl });
    this.db = drizzle(this.pool, { schema });
  }

  // ==================== Read Operations ====================

  async search(query = "", categories: string[] = []): Promise<SkillSearchResult[]> {
    return this.queryPublishedSkills(query, categories, { excludeRejected: true });
  }

  async listAuditSkills(query = ""): Promise<SkillSearchResult[]> {
    return this.queryPublishedSkills(query, [], { excludeRejected: false });
  }

  private async queryPublishedSkills(
    query: string,
    categories: string[],
    options: { excludeRejected: boolean }
  ): Promise<SkillSearchResult[]> {
    await this.ensureSchema();
    const q = query.trim();
    const selectedCategories = normalizeCategoryFilters(categories);
    const searchPattern = q ? `%${q}%` : "%";

    const rows = await this.db
      .select({
        slug: schema.skills.slug,
        name: schema.skills.name,
        description: schema.skills.description,
        latestVersion: schema.skills.latestVersion,
        inspectionStatus: schema.skills.inspectionStatus,
        status: schema.skillVersions.status,
        categories: schema.skillVersions.categories,
        qualityScore: schema.skillInspections.qualityScore,
        securityScore: schema.skillInspections.securityScore,
        reliabilityScore: schema.skillInspections.reliabilityScore,
        averageRating: schema.skills.averageRating,
        ratingCount: schema.skills.ratingCount,
        totalDownloads: sql<number>`coalesce(sum(${schema.skillVersions.downloads}), 0)`.mapWith(Number),
        updatedAt: schema.skills.updatedAt,
        latestVersionCreatedAt: schema.skillVersions.createdAt,
        openIssues: sql<number>`(
          select count(*) from ${schema.skillIssues}
          where ${schema.skillIssues.skillSlug} = ${schema.skills.slug}
          and ${schema.skillIssues.status} != 'closed'
        )`.mapWith(Number),
      })
      .from(schema.skills)
      .innerJoin(
        schema.skillVersions,
        and(
          eq(schema.skillVersions.skillSlug, schema.skills.slug),
          eq(schema.skillVersions.version, schema.skills.latestVersion)
        )
      )
      .innerJoin(
        schema.skillInspections,
        and(
          eq(schema.skillInspections.skillSlug, schema.skills.slug),
          eq(schema.skillInspections.version, schema.skills.latestVersion)
        )
      )
      .where(
        and(
          isNull(schema.skills.deletedAt),
          eq(schema.skills.published, true),
          eq(schema.skills.inspectionStatus, "completed"),
          options.excludeRejected ? ne(schema.skillVersions.status, "rejected") : undefined,
          q
            ? or(
                ilike(schema.skills.slug, searchPattern),
                ilike(schema.skills.name, searchPattern),
                ilike(schema.skills.description, searchPattern)
              )
            : undefined,
          selectedCategories.length > 0
            ? sql`${schema.skillVersions.categories} && ARRAY[${sql.join(
                selectedCategories.map((item) => sql`${item}`),
                sql`, `
              )}]::text[]`
            : undefined
        )
      )
      .groupBy(
        schema.skills.slug, schema.skills.name, schema.skills.description,
        schema.skills.latestVersion, schema.skills.inspectionStatus, schema.skillVersions.status, schema.skillVersions.categories,
        schema.skillInspections.qualityScore, schema.skillInspections.securityScore,
        schema.skillInspections.reliabilityScore, schema.skills.averageRating,
        schema.skills.ratingCount, schema.skills.updatedAt, schema.skillVersions.createdAt
      )
      .orderBy(desc(schema.skillVersions.createdAt));

    const slugs = rows.map((r) => r.slug);
    if (slugs.length === 0) return [];

    // 批量查 contributors
    const allContributors = await this.db
      .select()
      .from(schema.skillContributors)
      .where(inArray(schema.skillContributors.skillSlug, slugs));

    const contributorsMap = new Map<string, SkillSearchResult["contributors"]>();
    for (const c of allContributors) {
      const list = contributorsMap.get(c.skillSlug) ?? [];
      list.push(mapContributorRow(c));
      contributorsMap.set(c.skillSlug, list);
    }

    return rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      description: r.description,
      latestVersion: r.latestVersion,
      inspectionStatus: parseSkillInspectionStatus(r.inspectionStatus),
      status: r.status as SkillSearchResult["status"],
      scores: {
        qualityScore: Number(r.qualityScore),
        securityScore: Number(r.securityScore),
        reliabilityScore: Number(r.reliabilityScore),
      },
      categories: r.categories ?? [],
      averageRating: Number(r.averageRating),
      ratingCount: Number(r.ratingCount),
      openIssues: r.openIssues,
      contributors: contributorsMap.get(r.slug) ?? [],
      downloads: r.totalDownloads,
      updatedAt: toIsoTimestampString(r.updatedAt),
      latestVersionCreatedAt: toIsoTimestampString(r.latestVersionCreatedAt),
      published: true,
    }));
  }

  async listUnpublishedSkillsForOwner(ownerUserId: string): Promise<SkillSearchResult[]> {
    await this.ensureSchema();
    const ownerMatch = or(
      eq(schema.skills.ownerUserId, ownerUserId),
      sql`exists (
        select 1 from ${schema.skillContributors} sc
        where sc.skill_slug = ${schema.skills.slug}
        and sc.role = 'owner'
        and sc.user_id = ${ownerUserId}
      )`
    );

    const rows = await this.db
      .select({
        slug: schema.skills.slug,
        name: schema.skills.name,
        description: schema.skills.description,
        latestVersion: schema.skills.latestVersion,
        inspectionStatus: schema.skills.inspectionStatus,
        status: schema.skillVersions.status,
        categories: schema.skillVersions.categories,
        qualityScore: schema.skillInspections.qualityScore,
        securityScore: schema.skillInspections.securityScore,
        reliabilityScore: schema.skillInspections.reliabilityScore,
        averageRating: schema.skills.averageRating,
        ratingCount: schema.skills.ratingCount,
        totalDownloads: sql<number>`coalesce(sum(${schema.skillVersions.downloads}), 0)`.mapWith(Number),
        updatedAt: schema.skills.updatedAt,
        latestVersionCreatedAt: schema.skillVersions.createdAt,
        openIssues: sql<number>`(
          select count(*) from ${schema.skillIssues}
          where ${schema.skillIssues.skillSlug} = ${schema.skills.slug}
          and ${schema.skillIssues.status} != 'closed'
        )`.mapWith(Number),
      })
      .from(schema.skills)
      .innerJoin(
        schema.skillVersions,
        and(
          eq(schema.skillVersions.skillSlug, schema.skills.slug),
          eq(schema.skillVersions.version, schema.skills.latestVersion)
        )
      )
      .innerJoin(
        schema.skillInspections,
        and(
          eq(schema.skillInspections.skillSlug, schema.skills.slug),
          eq(schema.skillInspections.version, schema.skills.latestVersion)
        )
      )
      .where(and(isNull(schema.skills.deletedAt), eq(schema.skills.published, false), ownerMatch))
      .groupBy(
        schema.skills.slug,
        schema.skills.name,
        schema.skills.description,
        schema.skills.latestVersion,
        schema.skills.inspectionStatus,
        schema.skillVersions.status,
        schema.skillVersions.categories,
        schema.skillInspections.qualityScore,
        schema.skillInspections.securityScore,
        schema.skillInspections.reliabilityScore,
        schema.skills.averageRating,
        schema.skills.ratingCount,
        schema.skills.updatedAt,
        schema.skillVersions.createdAt
      )
      .orderBy(desc(schema.skillVersions.createdAt));

    const slugs = rows.map((r) => r.slug);
    if (slugs.length === 0) return [];

    const allContributors = await this.db
      .select()
      .from(schema.skillContributors)
      .where(inArray(schema.skillContributors.skillSlug, slugs));

    const contributorsMap = new Map<string, SkillSearchResult["contributors"]>();
    for (const c of allContributors) {
      const list = contributorsMap.get(c.skillSlug) ?? [];
      list.push(mapContributorRow(c));
      contributorsMap.set(c.skillSlug, list);
    }

    return rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      description: r.description,
      latestVersion: r.latestVersion,
      inspectionStatus: parseSkillInspectionStatus(r.inspectionStatus),
      status: r.status as SkillSearchResult["status"],
      scores: {
        qualityScore: Number(r.qualityScore),
        securityScore: Number(r.securityScore),
        reliabilityScore: Number(r.reliabilityScore),
      },
      categories: r.categories ?? [],
      averageRating: Number(r.averageRating),
      ratingCount: Number(r.ratingCount),
      openIssues: r.openIssues,
      contributors: contributorsMap.get(r.slug) ?? [],
      downloads: r.totalDownloads,
      updatedAt: toIsoTimestampString(r.updatedAt),
      latestVersionCreatedAt: toIsoTimestampString(r.latestVersionCreatedAt),
      published: false,
    }));
  }

  async listRejectedSkillsForOwner(ownerUserId: string): Promise<SkillSearchResult[]> {
    await this.ensureSchema();
    const ownerMatch = or(
      eq(schema.skills.ownerUserId, ownerUserId),
      sql`exists (
        select 1 from ${schema.skillContributors} sc
        where sc.skill_slug = ${schema.skills.slug}
        and sc.role = 'owner'
        and sc.user_id = ${ownerUserId}
      )`
    );

    const rows = await this.db
      .select({
        slug: schema.skills.slug,
        name: schema.skills.name,
        description: schema.skills.description,
        latestVersion: schema.skills.latestVersion,
        inspectionStatus: schema.skills.inspectionStatus,
        published: schema.skills.published,
        status: schema.skillVersions.status,
        categories: schema.skillVersions.categories,
        qualityScore: schema.skillInspections.qualityScore,
        securityScore: schema.skillInspections.securityScore,
        reliabilityScore: schema.skillInspections.reliabilityScore,
        averageRating: schema.skills.averageRating,
        ratingCount: schema.skills.ratingCount,
        totalDownloads: sql<number>`coalesce(sum(${schema.skillVersions.downloads}), 0)`.mapWith(Number),
        updatedAt: schema.skills.updatedAt,
        latestVersionCreatedAt: schema.skillVersions.createdAt,
        openIssues: sql<number>`(
          select count(*) from ${schema.skillIssues}
          where ${schema.skillIssues.skillSlug} = ${schema.skills.slug}
          and ${schema.skillIssues.status} != 'closed'
        )`.mapWith(Number),
      })
      .from(schema.skills)
      .innerJoin(
        schema.skillVersions,
        and(
          eq(schema.skillVersions.skillSlug, schema.skills.slug),
          eq(schema.skillVersions.version, schema.skills.latestVersion)
        )
      )
      .innerJoin(
        schema.skillInspections,
        and(
          eq(schema.skillInspections.skillSlug, schema.skills.slug),
          eq(schema.skillInspections.version, schema.skills.latestVersion)
        )
      )
      .where(and(isNull(schema.skills.deletedAt), eq(schema.skillVersions.status, "rejected"), ownerMatch))
      .groupBy(
        schema.skills.slug,
        schema.skills.name,
        schema.skills.description,
        schema.skills.latestVersion,
        schema.skills.inspectionStatus,
        schema.skills.published,
        schema.skillVersions.status,
        schema.skillVersions.categories,
        schema.skillInspections.qualityScore,
        schema.skillInspections.securityScore,
        schema.skillInspections.reliabilityScore,
        schema.skills.averageRating,
        schema.skills.ratingCount,
        schema.skills.updatedAt,
        schema.skillVersions.createdAt
      )
      .orderBy(desc(schema.skillVersions.createdAt));

    const slugs = rows.map((r) => r.slug);
    if (slugs.length === 0) return [];

    const allContributors = await this.db
      .select()
      .from(schema.skillContributors)
      .where(inArray(schema.skillContributors.skillSlug, slugs));

    const contributorsMap = new Map<string, SkillSearchResult["contributors"]>();
    for (const c of allContributors) {
      const list = contributorsMap.get(c.skillSlug) ?? [];
      list.push(mapContributorRow(c));
      contributorsMap.set(c.skillSlug, list);
    }

    return rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      description: r.description,
      latestVersion: r.latestVersion,
      inspectionStatus: parseSkillInspectionStatus(r.inspectionStatus),
      status: r.status as SkillSearchResult["status"],
      scores: {
        qualityScore: Number(r.qualityScore),
        securityScore: Number(r.securityScore),
        reliabilityScore: Number(r.reliabilityScore),
      },
      categories: r.categories ?? [],
      averageRating: Number(r.averageRating),
      ratingCount: Number(r.ratingCount),
      openIssues: r.openIssues,
      contributors: contributorsMap.get(r.slug) ?? [],
      downloads: r.totalDownloads,
      updatedAt: toIsoTimestampString(r.updatedAt),
      latestVersionCreatedAt: toIsoTimestampString(r.latestVersionCreatedAt),
      published: r.published !== false && r.status !== "rejected",
    }));
  }

  async getSkillSlugAvailability(slug: string): Promise<SkillSlugAvailability> {
    await this.ensureSchema();
    const [row] = await this.db
      .select({
        slug: schema.skills.slug,
        name: schema.skills.name,
        latestVersion: schema.skills.latestVersion,
        published: schema.skills.published,
        deletedAt: schema.skills.deletedAt,
      })
      .from(schema.skills)
      .where(eq(schema.skills.slug, slug))
      .limit(1);

    if (!row) {
      return { status: "available" };
    }

    if (row.deletedAt) {
      const deletedAt = new Date(row.deletedAt);
      return {
        status: "recycle_bin",
        slug: row.slug,
        name: row.name,
        deletedAt: String(row.deletedAt),
        purgeAt: skillRecyclePurgeAt(deletedAt).toISOString(),
      };
    }

    return {
      status: "active",
      slug: row.slug,
      name: row.name,
      latestVersion: row.latestVersion,
      published: row.published !== false,
    };
  }

  async getSkill(slug: string): Promise<RegistrySkill | undefined> {
    await this.ensureSchema();
    const [row] = await this.db
      .select()
      .from(schema.skills)
      .where(eq(schema.skills.slug, slug))
      .limit(1);

    if (!row) return undefined;

    const versions = await this.db
      .select()
      .from(schema.skillVersions)
      .where(eq(schema.skillVersions.skillSlug, slug))
      .orderBy(desc(schema.skillVersions.createdAt));

    const contributors = await this.db
      .select()
      .from(schema.skillContributors)
      .where(eq(schema.skillContributors.skillSlug, slug));

    const issues = await this.db
      .select()
      .from(schema.skillIssues)
      .where(eq(schema.skillIssues.skillSlug, slug));

    const ratings = await this.db
      .select()
      .from(schema.skillRatings)
      .where(eq(schema.skillRatings.skillSlug, slug));

    // Load each version's details
    const versionMap: Record<string, RegistryVersion> = {};
    for (const v of versions) {
      const tags = await this.db.select({ tag: schema.skillVersionTags.tag })
        .from(schema.skillVersionTags)
        .where(and(eq(schema.skillVersionTags.skillSlug, slug), eq(schema.skillVersionTags.version, v.version)))
        .orderBy(schema.skillVersionTags.position);

      const files = await this.db.select()
        .from(schema.skillVersionFiles)
        .where(and(eq(schema.skillVersionFiles.skillSlug, slug), eq(schema.skillVersionFiles.version, v.version)))
        .orderBy(schema.skillVersionFiles.path);
      const artifact = artifactDescriptorFromRow(v, slug, v.version);
      if (artifact && artifact.contentHash !== v.contentHash) {
        throw new Error(`Artifact content hash does not match PostgreSQL for ${slug}@${v.version}`);
      }

      const artifactSnapshot = artifact && this.artifactStore
        ? await this.artifactStore.getSnapshot(artifact)
        : undefined;
      if (artifactSnapshot && artifactSnapshot.contentHash !== v.contentHash) {
        throw new Error(`Artifact content hash does not match PostgreSQL for ${slug}@${v.version}`);
      }

      const snapshotFiles = artifactSnapshot
        ? hydrateFilesFromArtifact(files, artifactSnapshot, slug, v.version)
        : databaseFilesToSnapshotFiles(files, slug, v.version);
      const parsedManifest = artifactSnapshot?.manifest ?? parseManifestFromDatabaseFiles(files);

      const [review] = await this.db.select()
        .from(schema.skillInspections)
        .where(and(eq(schema.skillInspections.skillSlug, slug), eq(schema.skillInspections.version, v.version)));

      const findings = review
        ? await this.db.select().from(schema.skillInspectionFindings)
            .where(and(eq(schema.skillInspectionFindings.skillSlug, slug), eq(schema.skillInspectionFindings.version, v.version)))
            .orderBy(schema.skillInspectionFindings.position)
        : [];

      const [evaluation] = await this.db.select()
        .from(schema.skillEvaluations)
        .where(and(eq(schema.skillEvaluations.skillSlug, slug), eq(schema.skillEvaluations.version, v.version)));

      const evaluationTasks = evaluation
        ? await this.db.select().from(schema.skillEvaluationTasks)
            .where(and(
              eq(schema.skillEvaluationTasks.skillSlug, slug),
              eq(schema.skillEvaluationTasks.version, v.version)
            ))
            .orderBy(schema.skillEvaluationTasks.taskPosition)
        : [];

      const evaluationReportFindings = evaluation
        ? await this.db.select().from(schema.skillEvaluationReportFindings)
            .where(and(
              eq(schema.skillEvaluationReportFindings.skillSlug, slug),
              eq(schema.skillEvaluationReportFindings.version, v.version)
            ))
            .orderBy(schema.skillEvaluationReportFindings.position)
        : [];

      const evaluationTaskFindings = evaluation
        ? await this.db.select().from(schema.skillEvaluationTaskFindings)
            .where(and(
              eq(schema.skillEvaluationTaskFindings.skillSlug, slug),
              eq(schema.skillEvaluationTaskFindings.version, v.version)
            ))
            .orderBy(schema.skillEvaluationTaskFindings.taskPosition, schema.skillEvaluationTaskFindings.position)
        : [];

      const taskFindingsByPosition = new Map<number, FunctionalEvaluationFinding[]>();
      for (const finding of evaluationTaskFindings) {
        const taskFindings = taskFindingsByPosition.get(finding.taskPosition) ?? [];
        taskFindings.push(toFunctionalEvaluationFinding(finding));
        taskFindingsByPosition.set(finding.taskPosition, taskFindings);
      }

      const hydratedEvaluation: FunctionalEvaluationReport | undefined = evaluation
        ? {
            id: evaluation.evaluationId,
            provider: evaluation.provider as FunctionalEvaluationReport["provider"],
            status: evaluation.status as FunctionalEvaluationReport["status"],
            score: Number(evaluation.score),
            tasksTotal: Number(evaluation.tasksTotal),
            tasksPassed: Number(evaluation.tasksPassed),
            taskResults: evaluationTasks.map(
              (task): FunctionalEvaluationTaskResult => ({
                name: task.name,
                score: Number(task.score),
                findings: taskFindingsByPosition.get(task.taskPosition) ?? [],
              })
            ),
            findings: evaluationReportFindings.map(toFunctionalEvaluationFinding),
            haluCatchReport: parseHaluCatchReport(evaluation.haluCatchReport),
            createdAt: String(evaluation.createdAt),
          }
        : undefined;

      const manifest = {
        slug,
        name: v.manifestName,
        description: v.manifestDescription,
        version: v.manifestVersion ?? undefined,
        author: v.manifestAuthor ?? undefined,
        license: v.manifestLicense ?? undefined,
        tags: tags.map((t) => t.tag),
        ...(v.supportedAgentsDefined
          ? { supportedAgents: v.supportedAgents }
          : parsedManifest?.supportedAgents ? { supportedAgents: parsedManifest.supportedAgents } : {}),
        ...(v.allowedToolsDefined
          ? { "allowed-tools": v.allowedToolsIsScalar ? v.allowedTools[0] : v.allowedTools }
          : parsedManifest?.["allowed-tools"] !== undefined
            ? { "allowed-tools": parsedManifest["allowed-tools"] }
            : {}),
        ...(v.disallowedToolsDefined
          ? { "disallowed-tools": v.disallowedToolsIsScalar ? v.disallowedTools[0] : v.disallowedTools }
          : parsedManifest?.["disallowed-tools"] !== undefined
            ? { "disallowed-tools": parsedManifest["disallowed-tools"] }
            : {}),
        categories: v.categories,
        topics: v.topics,
        "release-tags": v.releaseTags,
      } as RegistryVersion["manifest"];

      const skillSpectorSummary = review ? parseSkillSpectorInspectionRow(review) : undefined;
      const virusTotalSummary = review ? parseVirusTotalInspectionRow(review) : undefined;

      versionMap[v.version] = {
        version: v.version,
        manifest,
        contentHash: v.contentHash,
        snapshot: {
          manifest,
          readme: artifactSnapshot?.readme ?? v.readme,
          files: snapshotFiles,
          contentHash: v.contentHash,
          createdAt: String(v.snapshotCreatedAt),
          entryPath: artifactSnapshot?.entryPath,
        },
        artifact,
        inspection: review ? {
          id: review.inspectionId, skillSlug: slug, skillName: v.manifestName,
          version: review.reportVersion, contentHash: review.contentHash,
          verdict: review.verdict as RegistryVersion["status"],
          scores: {
            qualityScore: Number(review.qualityScore),
            securityScore: Number(review.securityScore),
            reliabilityScore: Number(review.reliabilityScore),
          },
          findings: findings.map((f) => ({
            id: f.findingId, category: f.category as InspectionFinding["category"], severity: f.severity as InspectionFinding["severity"],
            title: f.title, message: f.message, path: f.path ?? undefined,
            evidence: f.evidence ?? undefined, recommendation: f.recommendation,
            ...(f.confidence != null && Number.isFinite(Number(f.confidence))
              ? { confidence: Number(f.confidence) }
              : {}),
          })),
          ...(skillSpectorSummary ? { skillSpector: skillSpectorSummary } : {}),
          ...(virusTotalSummary ? { virusTotal: virusTotalSummary } : {}),
          createdAt: String(review.createdAt),
        } : {} as RegistryVersion["inspection"],
        evaluation: hydratedEvaluation,
        status: v.status as RegistryVersion["status"],
        releaseTags: v.releaseTags, changelog: v.changelog ?? undefined, downloads: Number(v.downloads),
        published: v.published,
        uploadedAt: mapOptionalTimestamp(v.uploadedAt),
        inspectionStartedAt: mapOptionalTimestamp(v.inspectionStartedAt),
        inspectionEndedAt: mapOptionalTimestamp(v.inspectionEndedAt),
        inspectionCompletedStages: parseSkillInspectionStages(v.inspectionCompletedStages),
        inspectionStatus: parseSkillInspectionStatus(v.inspectionStatus),
        inspectionFailure: mapReviewFailureFromRow(
          parseSkillInspectionStatus(v.inspectionStatus),
          v.inspectionFailedStages,
          v.inspectionFailedMessage
        ),
        createdAt: String(v.createdAt), updatedAt: String(v.updatedAt),
      };
    }

    return {
      slug: row.slug, name: row.name, description: row.description,
      ownerUserId: row.ownerUserId ?? undefined, latestVersion: row.latestVersion,
      inspectionStatus: parseSkillInspectionStatus(row.inspectionStatus),
      inspectionFailure: mapReviewFailureFromRow(
        parseSkillInspectionStatus(row.inspectionStatus),
        row.inspectionFailedStages,
        row.inspectionFailedMessage
      ),
      inspectionCompletedStages: parseSkillInspectionStages(row.inspectionCompletedStages),
      uploadedAt: mapOptionalTimestamp(row.uploadedAt),
      inspectionStartedAt: mapOptionalTimestamp(row.inspectionStartedAt),
      inspectionEndedAt: mapOptionalTimestamp(row.inspectionEndedAt),
      versions: versionMap,
      contributors: contributors.map((c) => mapContributorRow(c)),
      issues: issues.map((i) => ({
        id: i.id, type: i.type as IssueType, status: i.status as IssueStatus,
        severity: i.severity as IssueSeverity, title: i.title, body: i.body ?? undefined,
        createdBy: i.createdBy ?? undefined, createdAt: String(i.createdAt), updatedAt: String(i.updatedAt),
      })),
      ratings: ratings.map((r) => ({
        id: r.id, version: r.version ?? undefined, user: r.userName,
        score: r.score, comment: r.comment ?? undefined, createdAt: String(r.createdAt),
      })),
      averageRating: Number(row.averageRating), ratingCount: Number(row.ratingCount),
      published: row.published,
      deletedAt: row.deletedAt ? String(row.deletedAt) : undefined,
      createdAt: String(row.createdAt), updatedAt: String(row.updatedAt),
    };
  }

  // --- 写操作：增量 Drizzle，不走 load/save ---

  async addRating(slug: string, rating: { version?: string; user: string; score: number; comment?: string }): Promise<RegistryRating> {
    await this.ensureSchema();
    if (rating.score < 1 || rating.score > 5) throw new Error("Rating score must be between 1 and 5");

    const [skillRow] = await this.db
      .select({ slug: schema.skills.slug, latestVersion: schema.skills.latestVersion })
      .from(schema.skills)
      .where(eq(schema.skills.slug, slug))
      .limit(1);
    if (!skillRow) {
      throw new Error(`Skill not found: ${slug}`);
    }

    const version = rating.version?.trim() || skillRow.latestVersion;
    const [versionRow] = await this.db
      .select({ version: schema.skillVersions.version })
      .from(schema.skillVersions)
      .where(and(eq(schema.skillVersions.skillSlug, slug), eq(schema.skillVersions.version, version)))
      .limit(1);
    if (!versionRow) {
      throw new Error(`Version not found: ${version}`);
    }

    const [existing] = await this.db
      .select({ id: schema.skillRatings.id })
      .from(schema.skillRatings)
      .where(
        and(
          eq(schema.skillRatings.skillSlug, slug),
          eq(schema.skillRatings.version, version),
          sql`lower(${schema.skillRatings.userName}) = lower(${rating.user})`
        )
      )
      .limit(1);
    if (existing) {
      throw new Error("rating_already_submitted");
    }

    const id = `rating_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date();

    await this.db.insert(schema.skillRatings).values({
      id, skillSlug: slug, version,
      userName: rating.user, score: rating.score, comment: rating.comment ?? null, createdAt,
    });

    const [agg] = await this.db
      .select({
        count: sql<number>`cast(count(*) as integer)`.mapWith(Number),
        avg: sql<number>`round(avg(${schema.skillRatings.score})::numeric, 1)`.mapWith(Number),
      })
      .from(schema.skillRatings)
      .where(eq(schema.skillRatings.skillSlug, slug));

    const now = new Date();
    await this.db.update(schema.skills)
      .set({ averageRating: String(agg?.avg ?? 0), ratingCount: agg?.count ?? 0, updatedAt: now })
      .where(eq(schema.skills.slug, slug));

    return { id, version, user: rating.user, score: rating.score, comment: rating.comment, createdAt: createdAt.toISOString() };
  }

  async createIssue(slug: string, issue: { type: string; severity?: string; title: string; body?: string; createdBy?: string }): Promise<RegistryIssue> {
    await this.ensureSchema();
    const id = `issue_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date();

    await this.db.insert(schema.skillIssues).values({
      id, skillSlug: slug,
      type: issue.type as IssueType, status: "open" as IssueStatus, severity: (issue.severity ?? "medium") as IssueSeverity,
      title: issue.title, body: issue.body ?? null, createdBy: issue.createdBy ?? null,
      createdAt, updatedAt: createdAt,
    });

    return {
      id, type: issue.type as IssueType, status: "open" as IssueStatus, severity: (issue.severity ?? "medium") as IssueSeverity,
      title: issue.title, body: issue.body, createdBy: issue.createdBy,
      createdAt: createdAt.toISOString(), updatedAt: createdAt.toISOString(),
    };
  }

  async addContributor(slug: string, contributor: { userId?: string; username?: string; name: string; role: string }): Promise<RegistryContributor> {
    await this.ensureSchema();
    const role = assertAssignableContributorRole(contributor.role);
    const addedAt = new Date();
    const id = `contributor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const [existing] = await this.db.select()
      .from(schema.skillContributors)
      .where(and(eq(schema.skillContributors.skillSlug, slug), eq(schema.skillContributors.name, contributor.name)))
      .limit(1);

    if (existing) {
      if (normalizeContributorRole(existing.role) === "owner") {
        throw new Error("cannot_modify_owner_contributor");
      }
      throw new Error("contributor_already_exists");
    }

    await this.db.insert(schema.skillContributors).values({
      id, skillSlug: slug, userId: contributor.userId ?? null,
      username: contributor.username ?? null, name: contributor.name,
      role, addedAt,
    });

    return {
      id,
      userId: contributor.userId,
      username: contributor.username,
      name: contributor.name,
      role,
      addedAt: addedAt.toISOString(),
    };
  }

  async removeContributor(slug: string, contributorId: string): Promise<void> {
    await this.ensureSchema();

    const [existing] = await this.db
      .select()
      .from(schema.skillContributors)
      .where(and(eq(schema.skillContributors.skillSlug, slug), eq(schema.skillContributors.id, contributorId)))
      .limit(1);

    if (!existing) {
      throw new Error("contributor_not_found");
    }
    if (normalizeContributorRole(existing.role) === "owner") {
      throw new Error("cannot_modify_owner_contributor");
    }

    await this.db
      .delete(schema.skillContributors)
      .where(and(eq(schema.skillContributors.skillSlug, slug), eq(schema.skillContributors.id, contributorId)));
  }

  async downloadSnapshot(slug: string, version = "latest"): Promise<SkillSnapshot | undefined> {
    await this.ensureSchema();
    const resolved = await this.resolveStoredSnapshotVersion(slug, version);
    if (!resolved) {
      return undefined;
    }

    await this.db.update(schema.skillVersions)
      .set({ downloads: sql`${schema.skillVersions.downloads} + 1`, updatedAt: new Date() })
      .where(and(eq(schema.skillVersions.skillSlug, slug), eq(schema.skillVersions.version, resolved)));

    return this.loadStoredSnapshot(slug, resolved);
  }

  async loadStoredSnapshot(slug: string, version: string): Promise<SkillSnapshot | undefined> {
    await this.ensureSchema();
    const resolved = await this.resolveStoredSnapshotVersion(slug, version);
    if (!resolved) {
      return undefined;
    }

    const [v] = await this.db.select()
      .from(schema.skillVersions)
      .where(and(eq(schema.skillVersions.skillSlug, slug), eq(schema.skillVersions.version, resolved)))
      .limit(1);
    if (!v) {
      return undefined;
    }

    const artifact = artifactDescriptorFromRow(v, slug, resolved);
    if (artifact && artifact.contentHash !== v.contentHash) {
      throw new Error(`Artifact content hash does not match PostgreSQL for ${slug}@${resolved}`);
    }

    if (artifact && this.artifactStore) {
      const snapshot = await this.artifactStore.getSnapshot(artifact);
      if (snapshot.contentHash !== v.contentHash) {
        throw new Error(`Artifact content hash does not match PostgreSQL for ${slug}@${resolved}`);
      }
      return snapshot;
    }

    const files = await this.db.select()
      .from(schema.skillVersionFiles)
      .where(and(eq(schema.skillVersionFiles.skillSlug, slug), eq(schema.skillVersionFiles.version, resolved)))
      .orderBy(schema.skillVersionFiles.path);

    if (files.length === 0) {
      return undefined;
    }

    const tags = await this.db.select({ tag: schema.skillVersionTags.tag })
      .from(schema.skillVersionTags)
      .where(and(eq(schema.skillVersionTags.skillSlug, slug), eq(schema.skillVersionTags.version, resolved)))
      .orderBy(schema.skillVersionTags.position);

    return {
      manifest: {
        slug,
        name: v.manifestName,
        description: v.manifestDescription ?? undefined,
        version: v.manifestVersion ?? resolved,
        author: v.manifestAuthor ?? undefined,
        license: v.manifestLicense ?? undefined,
        tags: tags.map((t) => t.tag),
        categories: v.categories ?? [],
        topics: v.topics ?? [],
        supportedAgents: v.supportedAgents ?? undefined,
        "allowed-tools": v.allowedToolsDefined ? (v.allowedToolsIsScalar ? v.allowedTools[0] : v.allowedTools) : undefined,
        "disallowed-tools": v.disallowedToolsDefined ? (v.disallowedToolsIsScalar ? v.disallowedTools[0] : v.disallowedTools) : undefined,
        "release-tags": v.releaseTags ?? undefined,
      },
      readme: v.readme ?? undefined,
      files: databaseFilesToSnapshotFiles(files, slug, resolved),
      contentHash: v.contentHash,
      createdAt: String(v.snapshotCreatedAt),
    };
  }

  private async resolveStoredSnapshotVersion(slug: string, version: string): Promise<string | undefined> {
    const skill = await this.getSkill(slug);
    if (!skill) {
      return undefined;
    }
    return resolveVersionReference(skill, version) ?? undefined;
  }

  async upsertInspection(
    slug: string,
    version: string,
    inspection: InspectionReport,
    options: { finalize?: boolean } = {}
  ): Promise<RegistryVersion> {
    await this.ensureSchema();
    const createdAt = new Date();
    const finalize = options.finalize ?? true;

    const skillSpectorCols = skillSpectorInspectionColumns(inspection.skillSpector);
    const virusTotalCols = virusTotalInspectionColumns(inspection.virusTotal);

    await this.db.insert(schema.skillInspections).values({
      skillSlug: slug, version, inspectionId: inspection.id, reportVersion: inspection.version ?? "1.0",
      contentHash: inspection.contentHash ?? "", verdict: inspection.verdict,
      qualityScore: inspection.scores.qualityScore,
      securityScore: inspection.scores.securityScore,
      reliabilityScore: inspection.scores.reliabilityScore,
      ...skillSpectorCols,
      ...virusTotalCols,
      createdAt,
    }).onConflictDoUpdate({
      target: [schema.skillInspections.skillSlug, schema.skillInspections.version],
      set: {
        inspectionId: inspection.id, reportVersion: inspection.version ?? "1.0",
        contentHash: inspection.contentHash ?? "", verdict: inspection.verdict,
        qualityScore: inspection.scores.qualityScore,
        securityScore: inspection.scores.securityScore,
        reliabilityScore: inspection.scores.reliabilityScore,
        ...skillSpectorCols,
        ...virusTotalCols,
      },
    });

    // Delete old findings and re-insert
    await this.db.delete(schema.skillInspectionFindings)
      .where(and(eq(schema.skillInspectionFindings.skillSlug, slug), eq(schema.skillInspectionFindings.version, version)));

    if (inspection.findings?.length) {
      await this.db.insert(schema.skillInspectionFindings).values(
        inspection.findings.map((f, i) => ({
          skillSlug: slug, version, position: i,
          findingId: f.id ?? `finding_${i}`,
          category: f.category, severity: f.severity,
          title: f.title, message: f.message,
          path: f.path ?? null, evidence: f.evidence ?? null,
          recommendation: f.recommendation,
          confidence: typeof f.confidence === "number" && Number.isFinite(f.confidence) ? f.confidence : null,
        }))
      );
    }

    if (finalize) {
      await this.db.update(schema.skillVersions)
        .set({
          status: inspection.verdict,
          inspectionStatus: "completed",
          inspectionFailedStages: [],
          inspectionFailedMessage: null,
          updatedAt: new Date(),
        })
        .where(and(eq(schema.skillVersions.skillSlug, slug), eq(schema.skillVersions.version, version)));
      await this.syncSkillInspectionDenormFromLatest(slug);
    }

    return (await this.getSkill(slug))?.versions[version] as RegistryVersion;
  }

  async persistInspectionStageResults(
    slug: string,
    version: string,
    inspection: InspectionReport,
    evaluation: FunctionalEvaluationReport | undefined,
    options: PersistInspectionStageResultsOptions
  ): Promise<void> {
    await this.ensureSchema();
    const completedStages = [...new Set(options.completedStages)];
    const finalize = options.finalize ?? false;

    await this.upsertInspection(slug, version, inspection, { finalize: false });
    if (evaluation) {
      await this.upsertEvaluation(slug, version, evaluation);
    }

    await this.db.update(schema.skillVersions)
      .set({
        inspectionCompletedStages: completedStages,
        updatedAt: new Date(),
        ...(finalize
          ? {
              inspectionStatus: "completed" as const,
              inspectionFailedStages: [],
              inspectionFailedMessage: null,
            }
          : {}),
      })
      .where(and(eq(schema.skillVersions.skillSlug, slug), eq(schema.skillVersions.version, version)));

    await this.syncSkillInspectionDenormFromLatest(slug);
  }

  private async syncSkillInspectionDenormFromLatest(slug: string): Promise<void> {
    const [skillRow] = await this.db
      .select({ latestVersion: schema.skills.latestVersion })
      .from(schema.skills)
      .where(eq(schema.skills.slug, slug))
      .limit(1);
    if (!skillRow?.latestVersion) {
      return;
    }

    const [versionRow] = await this.db
      .select({
        inspectionStatus: schema.skillVersions.inspectionStatus,
        inspectionFailedStages: schema.skillVersions.inspectionFailedStages,
        inspectionFailedMessage: schema.skillVersions.inspectionFailedMessage,
        inspectionCompletedStages: schema.skillVersions.inspectionCompletedStages,
        inspectionStartedAt: schema.skillVersions.inspectionStartedAt,
        inspectionEndedAt: schema.skillVersions.inspectionEndedAt,
      })
      .from(schema.skillVersions)
      .where(
        and(
          eq(schema.skillVersions.skillSlug, slug),
          eq(schema.skillVersions.version, skillRow.latestVersion)
        )
      )
      .limit(1);
    if (!versionRow) {
      return;
    }

    const inspectionStatus = parseSkillInspectionStatus(versionRow.inspectionStatus);
    await this.db.update(schema.skills)
      .set({
        inspectionStatus,
        inspectionFailedStages: versionRow.inspectionFailedStages,
        inspectionFailedMessage: versionRow.inspectionFailedMessage,
        inspectionCompletedStages: versionRow.inspectionCompletedStages,
        inspectionStartedAt: versionRow.inspectionStartedAt,
        inspectionEndedAt: versionRow.inspectionEndedAt,
        ...(inspectionStatus === "failed" ? { published: false } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.skills.slug, slug));
  }

  async upsertEvaluation(slug: string, version: string, evaluation: FunctionalEvaluationReport): Promise<RegistryVersion> {
    await this.ensureSchema();
    const createdAt = new Date();

    await this.db.transaction(async (tx) => {
      await tx.insert(schema.skillEvaluations).values({
        skillSlug: slug, version, evaluationId: evaluation.id,
        provider: evaluation.provider, status: evaluation.status,
        score: evaluation.score, tasksTotal: evaluation.tasksTotal ?? 0,
        tasksPassed: evaluation.tasksPassed ?? 0,
        haluCatchReport: serializeHaluCatchReport(evaluation.haluCatchReport),
        createdAt,
      }).onConflictDoUpdate({
        target: [schema.skillEvaluations.skillSlug, schema.skillEvaluations.version],
        set: {
          evaluationId: evaluation.id, provider: evaluation.provider,
          status: evaluation.status, score: evaluation.score,
          tasksTotal: evaluation.tasksTotal ?? 0,
          tasksPassed: evaluation.tasksPassed ?? 0,
          haluCatchReport: serializeHaluCatchReport(evaluation.haluCatchReport),
          createdAt,
        },
      });

      await replaceEvaluationDetails(tx, slug, version, evaluation);
    });

    return (await this.getSkill(slug))?.versions[version] as RegistryVersion;
  }

  async markSkillInspectionStatus(
    slug: string,
    inspectionStatus: SkillInspectionStatus,
    options?: MarkSkillInspectionStatusOptions
  ): Promise<void> {
    await this.ensureSchema();
    const now = new Date();
    const timingPatch = skillReviewTimingPatch(inspectionStatus, now);
    const failurePatch = inspectionFailurePatch(inspectionStatus, options?.failure);
    const [existing] = await this.db
      .select({
        slug: schema.skills.slug,
        latestVersion: schema.skills.latestVersion,
      })
      .from(schema.skills)
      .where(eq(schema.skills.slug, slug))
      .limit(1);

    const targetVersion = resolveMarkReviewTargetVersion(options, existing?.latestVersion);
    const latestPointer = resolveMarkReviewLatestPointer(options);

    if (existing) {
      await this.db.update(schema.skills)
        .set({
          updatedAt: now,
          ...(latestPointer ? { latestVersion: latestPointer } : {}),
          ...(options?.name !== undefined ? { name: options.name } : {}),
          ...(options?.description !== undefined ? { description: options.description } : {}),
        })
        .where(eq(schema.skills.slug, slug));
    } else {
      if (!options?.name || options.description === undefined || !latestPointer) {
        throw new Error(`Skill not found: ${slug}`);
      }

      await this.db.insert(schema.skills).values({
        slug,
        name: options.name,
        description: options.description,
        ownerUserId: options.ownerUserId ?? null,
        latestVersion: latestPointer,
        inspectionStatus,
        ...failurePatch,
        ...timingPatch,
        published: false,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (targetVersion) {
      await this.db.update(schema.skillVersions)
        .set({
          inspectionStatus,
          ...failurePatch,
          ...timingPatch,
          ...(inspectionStatus === "inspecting" ? { inspectionCompletedStages: [] } : {}),
          ...(inspectionStatus === "failed" ? { status: "rejected" as const } : {}),
          updatedAt: now,
        })
        .where(and(eq(schema.skillVersions.skillSlug, slug), eq(schema.skillVersions.version, targetVersion)));
    }

    await this.syncSkillInspectionDenormFromLatest(slug);

    if (options?.ownerUserId && options.ownerUsername) {
      await this.ensureSkillOwnerContributor(slug, options.ownerUserId, options.ownerUsername);
    }
  }

  private async ensureSkillOwnerContributor(
    slug: string,
    userId: string,
    username: string
  ): Promise<void> {
    const [existingContributor] = await this.db
      .select({ id: schema.skillContributors.id })
      .from(schema.skillContributors)
      .where(and(eq(schema.skillContributors.skillSlug, slug), eq(schema.skillContributors.role, "owner")))
      .limit(1);

    if (existingContributor) {
      return;
    }

    await this.db.insert(schema.skillContributors).values({
      id: `contributor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      skillSlug: slug,
      userId,
      username,
      name: username,
      role: "owner",
      addedAt: new Date(),
    });
  }

  async commitInspectionResultsBeforePublish(
    snapshot: SkillSnapshot,
    inspection: InspectionReport,
    evaluation?: FunctionalEvaluationReport,
    options: CommitInspectionResultsOptions = {}
  ): Promise<void> {
    await this.ensureSchema();
    const slug = getSkillSlug(snapshot.manifest);
    const version = inspection.version;
    const releaseTags = options.releaseTags ?? snapshot.manifest["release-tags"]?.map(String) ?? ["latest"];
    const existingSkill = await this.getSkill(slug);

    assertPublishPreflight({
      slug,
      version,
      releaseTags,
      existingSkill,
      allowInspectionInProgress: true,
    });

    if (!existingSkill?.versions[version]) {
      await this.insertPendingPublishVersionStub(snapshot, inspection, releaseTags);
    }

    await this.upsertInspection(slug, version, inspection, { finalize: true });
    if (evaluation) {
      await this.upsertEvaluation(slug, version, evaluation);
    }
  }

  async stagePendingPublishSnapshot(
    snapshot: SkillSnapshot,
    version: string,
    options: StagePendingPublishSnapshotOptions = {}
  ): Promise<void> {
    await this.ensureSchema();
    const slug = getSkillSlug(snapshot.manifest);
    const now = new Date();
    const releaseTags = options.releaseTags ?? snapshot.manifest["release-tags"]?.map(String) ?? ["latest"];
    const name = snapshot.manifest.name;
    const description = snapshot.manifest.description ?? "";
    const supportedAgents = toStringList(snapshot.manifest.supportedAgents);
    const allowedTools = snapshot.manifest["allowed-tools"];
    const disallowedTools = snapshot.manifest["disallowed-tools"];

    const existingSkill = await this.getSkill(slug);
    const existingVersion = existingSkill?.versions[version];
    if (existingVersion?.published !== false) {
      if (existingVersion) {
        throw new Error(`Version already exists: ${slug}@${version}`);
      }
    }

    const artifact = await this.artifactStore?.putSnapshot(slug, version, snapshot);

    const versionWrite = {
      status: "needs-inspection" as RegistryVersion["status"],
      manifestName: name,
      manifestDescription: description,
      manifestVersion: snapshot.manifest.version ?? null,
      manifestAuthor: snapshot.manifest.author ?? null,
      manifestLicense: snapshot.manifest.license ?? null,
      tagsDefined: !!snapshot.manifest.tags?.length,
      supportedAgents,
      supportedAgentsDefined: snapshot.manifest.supportedAgents !== undefined,
      allowedTools: toStringList(allowedTools),
      allowedToolsDefined: allowedTools !== undefined,
      allowedToolsIsScalar: typeof allowedTools === "string",
      disallowedTools: toStringList(disallowedTools),
      disallowedToolsDefined: disallowedTools !== undefined,
      disallowedToolsIsScalar: typeof disallowedTools === "string",
      categories: snapshot.manifest.categories ?? [],
      topics: snapshot.manifest.topics ?? [],
      releaseTags,
      changelog: options.changelog?.trim() || null,
      contentHash: snapshot.contentHash,
      readme: snapshot.readme ?? "",
      published: false,
      artifactProvider: artifact?.provider ?? null,
      artifactBucket: artifact?.bucket ?? null,
      artifactObjectKey: artifact?.objectKey ?? null,
      artifactContentHash: artifact?.contentHash ?? null,
      artifactSize: artifact?.size ?? null,
      artifactStoredAt: artifact ? new Date(artifact.storedAt) : null,
      snapshotCreatedAt: now,
      uploadedAt: now,
      inspectionStartedAt: null,
      inspectionEndedAt: null,
      inspectionStatus: "inspecting" as const,
      inspectionFailedStages: [],
      inspectionFailedMessage: null,
      inspectionCompletedStages: [],
      updatedAt: now,
    };

    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.skillVersions)
        .set({
          inspectionStatus: "failed",
          inspectionFailedStages: [],
          inspectionFailedMessage: INSPECTION_SUPERSEDED_MESSAGE,
          inspectionEndedAt: now,
          status: "rejected",
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.skillVersions.skillSlug, slug),
            ne(schema.skillVersions.version, version),
            eq(schema.skillVersions.inspectionStatus, "inspecting")
          )
        );

      const [skillRow] = await tx
        .select({ slug: schema.skills.slug })
        .from(schema.skills)
        .where(eq(schema.skills.slug, slug))
        .limit(1);

      if (!skillRow) {
        await tx.insert(schema.skills).values({
          slug,
          name,
          description,
          ownerUserId: options.ownerUserId ?? null,
          latestVersion: version,
          published: false,
          inspectionCompletedStages: [],
          uploadedAt: now,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        await tx.update(schema.skills)
          .set({
            name,
            description,
            latestVersion: version,
            uploadedAt: now,
            updatedAt: now,
          })
          .where(eq(schema.skills.slug, slug));
      }

      if (existingVersion) {
        await tx.update(schema.skillVersions)
          .set(versionWrite)
          .where(and(eq(schema.skillVersions.skillSlug, slug), eq(schema.skillVersions.version, version)));
        await tx.delete(schema.skillVersionTags)
          .where(and(eq(schema.skillVersionTags.skillSlug, slug), eq(schema.skillVersionTags.version, version)));
        await tx.delete(schema.skillVersionFiles)
          .where(and(eq(schema.skillVersionFiles.skillSlug, slug), eq(schema.skillVersionFiles.version, version)));
      } else {
        await tx.insert(schema.skillVersions).values({
          skillSlug: slug,
          version,
          ...versionWrite,
          createdAt: now,
        });
      }

      if (snapshot.manifest.tags?.length) {
        await tx.insert(schema.skillVersionTags).values(
          snapshot.manifest.tags.map((tag: string, i: number) => ({ skillSlug: slug, version, position: i, tag }))
        );
      }

      if (snapshot.files?.length) {
        await tx.insert(schema.skillVersionFiles).values(
          snapshot.files.map((f) => ({
            skillSlug: slug,
            version,
            path: f.path,
            content: artifact ? null : f.content,
            size: f.size,
            sha256: f.sha256,
          }))
        );
      }
    });

    if (options.ownerUserId && options.ownerUsername) {
      await this.ensureSkillOwnerContributor(slug, options.ownerUserId, options.ownerUsername);
    }

    await this.syncSkillInspectionDenormFromLatest(slug);
  }

  async rollbackPendingPublishVersion(slug: string, version: string): Promise<void> {
    await this.ensureSchema();
    const skill = await this.getSkill(slug);
    const pendingVersion = skill?.versions[version];
    if (!pendingVersion || pendingVersion.published !== false) {
      return;
    }

    await this.db.transaction(async (tx) => {
      await tx.delete(schema.skillInspectionFindings)
        .where(and(eq(schema.skillInspectionFindings.skillSlug, slug), eq(schema.skillInspectionFindings.version, version)));
      await tx.delete(schema.skillInspections)
        .where(and(eq(schema.skillInspections.skillSlug, slug), eq(schema.skillInspections.version, version)));
      await tx.delete(schema.skillEvaluationReportFindings)
        .where(and(eq(schema.skillEvaluationReportFindings.skillSlug, slug), eq(schema.skillEvaluationReportFindings.version, version)));
      await tx.delete(schema.skillEvaluationTaskFindings)
        .where(and(eq(schema.skillEvaluationTaskFindings.skillSlug, slug), eq(schema.skillEvaluationTaskFindings.version, version)));
      await tx.delete(schema.skillEvaluationTasks)
        .where(and(eq(schema.skillEvaluationTasks.skillSlug, slug), eq(schema.skillEvaluationTasks.version, version)));
      await tx.delete(schema.skillEvaluations)
        .where(and(eq(schema.skillEvaluations.skillSlug, slug), eq(schema.skillEvaluations.version, version)));
      await tx.delete(schema.skillVersionFiles)
        .where(and(eq(schema.skillVersionFiles.skillSlug, slug), eq(schema.skillVersionFiles.version, version)));
      await tx.delete(schema.skillVersionTags)
        .where(and(eq(schema.skillVersionTags.skillSlug, slug), eq(schema.skillVersionTags.version, version)));
      await tx.delete(schema.skillVersions)
        .where(and(eq(schema.skillVersions.skillSlug, slug), eq(schema.skillVersions.version, version)));
    });
  }

  private async insertPendingPublishVersionStub(
    snapshot: SkillSnapshot,
    inspection: InspectionReport,
    releaseTags: string[]
  ): Promise<void> {
    const slug = getSkillSlug(snapshot.manifest);
    const version = inspection.version;
    const now = new Date();
    const name = snapshot.manifest.name;
    const description = snapshot.manifest.description ?? "";

    await this.db.insert(schema.skillVersions).values({
      skillSlug: slug,
      version,
      status: inspection.verdict,
      manifestName: name,
      manifestDescription: description,
      manifestVersion: snapshot.manifest.version ?? null,
      manifestAuthor: snapshot.manifest.author ?? null,
      manifestLicense: snapshot.manifest.license ?? null,
      tagsDefined: !!snapshot.manifest.tags?.length,
      supportedAgents: toStringList(snapshot.manifest.supportedAgents),
      supportedAgentsDefined: snapshot.manifest.supportedAgents !== undefined,
      allowedTools: toStringList(snapshot.manifest["allowed-tools"]),
      allowedToolsDefined: snapshot.manifest["allowed-tools"] !== undefined,
      allowedToolsIsScalar: typeof snapshot.manifest["allowed-tools"] === "string",
      disallowedTools: toStringList(snapshot.manifest["disallowed-tools"]),
      disallowedToolsDefined: snapshot.manifest["disallowed-tools"] !== undefined,
      disallowedToolsIsScalar: typeof snapshot.manifest["disallowed-tools"] === "string",
      categories: snapshot.manifest.categories ?? [],
      topics: snapshot.manifest.topics ?? [],
      releaseTags,
      changelog: null,
      contentHash: snapshot.contentHash,
      readme: snapshot.readme ?? "",
      published: false,
      artifactProvider: null,
      artifactBucket: null,
      artifactObjectKey: null,
      artifactContentHash: null,
      artifactSize: null,
      artifactStoredAt: null,
      snapshotCreatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  async publishSnapshot(
    snapshot: SkillSnapshot,
    inspection: InspectionReport,
    evaluation?: FunctionalEvaluationReport,
    options: PublishSnapshotOptions = {}
  ): Promise<RegistryVersion> {
    await this.ensureSchema();
    const manifest = snapshot.manifest as SkillManifest & { slug?: string };
    const slug = manifest.slug ?? getSkillSlug(snapshot.manifest);
    const version = inspection.version;
    const now = new Date();
    const releaseTags = options.releaseTags ?? manifest["release-tags"] ?? ["latest"];
    const name = manifest.name;
    const description = manifest.description ?? "";
    const supportedAgents = toStringList(snapshot.manifest.supportedAgents);
    const allowedTools = snapshot.manifest["allowed-tools"];
    const disallowedTools = snapshot.manifest["disallowed-tools"];

    const existingSkill = await this.getSkill(slug);
    assertPublishPreflight({
      slug,
      version,
      releaseTags,
      existingSkill,
      allowInspectionInProgress: options.inspectionAlreadyCommitted ?? false,
    });

    const pendingVersion = existingSkill?.versions[version];
    const finalizePendingVersion = Boolean(options.inspectionAlreadyCommitted && pendingVersion?.published === false);
    const publiclyListed = inspection.verdict !== "rejected";

    // Store the complete snapshot in MinIO first. Its descriptor is committed Its descriptor is committed
    // with the version, while skill_version_files retains only file metadata.
    const artifact = await this.artifactStore?.putSnapshot(slug, version, snapshot);

    await this.db.transaction(async (tx) => {
      if (existingSkill) {
        await tx.update(schema.skills)
          .set({
            name,
            description,
            latestVersion: releaseTags.includes("latest") ? version : existingSkill.latestVersion,
            published: publiclyListed,
            inspectionStatus: "completed",
            inspectionFailedStages: [],
            inspectionFailedMessage: null,
            inspectionEndedAt: now,
            updatedAt: now
          })
          .where(eq(schema.skills.slug, slug));
      } else {
        await tx.insert(schema.skills).values({
          slug, name, description, ownerUserId: options.owner?.userId ?? null,
          latestVersion: version, published: publiclyListed, inspectionStatus: "completed",
          inspectionFailedStages: [], inspectionFailedMessage: null,
          inspectionEndedAt: now,
          createdAt: now, updatedAt: now,
        });
      }

      if (releaseTags.includes("latest")) {
        const oldLatest = await tx.select({ v: schema.skillVersions.version, tags: schema.skillVersions.releaseTags })
          .from(schema.skillVersions)
          .where(eq(schema.skillVersions.skillSlug, slug));
        for (const ov of oldLatest) {
          if (ov.tags.includes("latest")) {
            await tx.update(schema.skillVersions)
              .set({ releaseTags: ov.tags.filter((t: string) => t !== "latest") })
              .where(and(eq(schema.skillVersions.skillSlug, slug), eq(schema.skillVersions.version, ov.v)));
          }
        }
      }

      const versionWriteBase = {
        status: inspection.verdict,
        manifestName: name,
        manifestDescription: description,
        manifestVersion: snapshot.manifest.version ?? null,
        manifestAuthor: snapshot.manifest.author ?? null,
        manifestLicense: snapshot.manifest.license ?? null,
        tagsDefined: !!snapshot.manifest.tags?.length,
        supportedAgents,
        supportedAgentsDefined: snapshot.manifest.supportedAgents !== undefined,
        allowedTools: toStringList(allowedTools),
        allowedToolsDefined: allowedTools !== undefined,
        allowedToolsIsScalar: typeof allowedTools === "string",
        disallowedTools: toStringList(disallowedTools),
        disallowedToolsDefined: disallowedTools !== undefined,
        disallowedToolsIsScalar: typeof disallowedTools === "string",
        categories: snapshot.manifest.categories ?? [],
        topics: snapshot.manifest.topics ?? [],
        releaseTags,
        changelog: options.changelog?.trim() || null,
        contentHash: snapshot.contentHash,
        readme: snapshot.readme ?? "",
        published: publiclyListed,
        artifactProvider: artifact?.provider ?? null,
        artifactBucket: artifact?.bucket ?? null,
        artifactObjectKey: artifact?.objectKey ?? null,
        artifactContentHash: artifact?.contentHash ?? null,
        artifactSize: artifact?.size ?? null,
        artifactStoredAt: artifact ? new Date(artifact.storedAt) : null,
        inspectionEndedAt: now,
        updatedAt: now,
      };

      if (finalizePendingVersion) {
        await tx.update(schema.skillVersions)
          .set(versionWriteBase)
          .where(and(eq(schema.skillVersions.skillSlug, slug), eq(schema.skillVersions.version, version)));
        await tx.delete(schema.skillVersionTags)
          .where(and(eq(schema.skillVersionTags.skillSlug, slug), eq(schema.skillVersionTags.version, version)));
        await tx.delete(schema.skillVersionFiles)
          .where(and(eq(schema.skillVersionFiles.skillSlug, slug), eq(schema.skillVersionFiles.version, version)));
      } else {
        await tx.insert(schema.skillVersions).values({
          skillSlug: slug,
          version,
          ...versionWriteBase,
          snapshotCreatedAt: now,
          uploadedAt: now,
          createdAt: now,
        });
      }

      if (snapshot.manifest.tags?.length) {
        await tx.insert(schema.skillVersionTags).values(
          snapshot.manifest.tags.map((tag: string, i: number) => ({ skillSlug: slug, version, position: i, tag }))
        );
      }

      if (snapshot.files?.length) {
        await tx.insert(schema.skillVersionFiles).values(
          snapshot.files.map((f) => ({
            skillSlug: slug,
            version,
            path: f.path,
            content: artifact ? null : f.content,
            size: f.size,
            sha256: f.sha256,
          }))
        );
      }

      if (!options.inspectionAlreadyCommitted) {
        await tx.insert(schema.skillInspections).values({
          skillSlug: slug, version, inspectionId: inspection.id ?? `inspection_${Date.now()}`,
          reportVersion: inspection.version ?? "1.0", contentHash: inspection.contentHash ?? "",
          verdict: inspection.verdict,
          qualityScore: inspection.scores.qualityScore,
          securityScore: inspection.scores.securityScore,
          reliabilityScore: inspection.scores.reliabilityScore,
          ...skillSpectorInspectionColumns(inspection.skillSpector),
          ...virusTotalInspectionColumns(inspection.virusTotal),
          createdAt: now,
        });

        if (inspection.findings?.length) {
          await tx.insert(schema.skillInspectionFindings).values(
            inspection.findings.map((f, i) => ({
              skillSlug: slug, version, position: i, findingId: f.id ?? `finding_${i}`,
              category: f.category, severity: f.severity, title: f.title, message: f.message,
              path: f.path ?? null, evidence: f.evidence ?? null, recommendation: f.recommendation,
              confidence: typeof f.confidence === "number" && Number.isFinite(f.confidence) ? f.confidence : null,
            }))
          );
        }

        if (evaluation) {
          await tx.insert(schema.skillEvaluations).values({
            skillSlug: slug, version, evaluationId: evaluation.id,
            provider: evaluation.provider, status: evaluation.status,
            score: evaluation.score, tasksTotal: evaluation.tasksTotal ?? 0,
            tasksPassed: evaluation.tasksPassed ?? 0,
            haluCatchReport: serializeHaluCatchReport(evaluation.haluCatchReport),
            createdAt: now,
          });
          await replaceEvaluationDetails(tx, slug, version, evaluation);
        }
      }

      const ownerName = options.owner?.username ?? snapshot.manifest.author ?? "unknown";
      const [existingC] = await tx.select()
        .from(schema.skillContributors)
        .where(and(eq(schema.skillContributors.skillSlug, slug), eq(schema.skillContributors.name, ownerName)))
        .limit(1);
      if (!existingC) {
        await tx.insert(schema.skillContributors).values({
          id: `contributor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          skillSlug: slug, userId: options.owner?.userId ?? null,
          username: options.owner?.username ?? null, name: ownerName, role: "owner", addedAt: now,
        });
      }
    });

    return (await this.getSkill(slug))?.versions[version] as RegistryVersion;
  }

  async inspectAll(
    pipelineFn: (
      snapshot: SkillSnapshot,
      version: string
    ) => Promise<{ inspection: InspectionReport; evaluation: FunctionalEvaluationReport }>
  ): Promise<RegistryVersion[]> {
    await this.ensureSchema();
    const versions = await this.db
      .select({ slug: schema.skillVersions.skillSlug, version: schema.skillVersions.version })
      .from(schema.skillVersions);

    const results: RegistryVersion[] = [];
    const inspectingSlugs = new Set<string>();
    for (const { slug, version } of versions) {
      const skill = await this.getSkill(slug);
      const rv = skill?.versions[version];
      if (!skill || skill.deletedAt || !rv) continue;

      if (!inspectingSlugs.has(`${slug}@${version}`)) {
        await this.markSkillInspectionStatus(slug, "inspecting", { version });
        inspectingSlugs.add(`${slug}@${version}`);
      }

      const { inspection, evaluation } = await pipelineFn(rv.snapshot, version);
      await this.upsertInspection(slug, version, inspection, { finalize: true });
      await this.upsertEvaluation(slug, version, evaluation);

      results.push((await this.getSkill(slug))!.versions[version]!);
    }
    return results;
  }

  async listInspectionPendingSkillsForOwner(memberUserId: string): Promise<SkillSearchResult[]> {
    await this.ensureSchema();
    const memberMatch = or(
      eq(schema.skills.ownerUserId, memberUserId),
      sql`exists (
        select 1 from ${schema.skillContributors} sc
        where sc.skill_slug = ${schema.skills.slug}
        and sc.user_id = ${memberUserId}
      )`
    );

    const rows = await this.db
      .select({
        slug: schema.skills.slug,
        name: schema.skills.name,
        description: schema.skills.description,
        latestVersion: schema.skills.latestVersion,
        pendingVersion: schema.skillVersions.version,
        inspectionStatus: schema.skillVersions.inspectionStatus,
        inspectionFailedStages: schema.skillVersions.inspectionFailedStages,
        inspectionFailedMessage: schema.skillVersions.inspectionFailedMessage,
        uploadedAt: schema.skillVersions.uploadedAt,
        inspectionStartedAt: schema.skillVersions.inspectionStartedAt,
        inspectionEndedAt: schema.skillVersions.inspectionEndedAt,
        published: schema.skills.published,
        averageRating: schema.skills.averageRating,
        ratingCount: schema.skills.ratingCount,
        updatedAt: schema.skillVersions.updatedAt,
        openIssues: sql<number>`(
          select count(*) from ${schema.skillIssues}
          where ${schema.skillIssues.skillSlug} = ${schema.skills.slug}
          and ${schema.skillIssues.status} != 'closed'
        )`.mapWith(Number),
      })
      .from(schema.skillVersions)
      .innerJoin(schema.skills, eq(schema.skills.slug, schema.skillVersions.skillSlug))
      .where(
        and(
          isNull(schema.skills.deletedAt),
          memberMatch,
          eq(schema.skillVersions.version, schema.skills.latestVersion),
          or(
            eq(schema.skillVersions.inspectionStatus, "inspecting"),
            eq(schema.skillVersions.inspectionStatus, "failed")
          )
        )
      )
      .orderBy(desc(schema.skillVersions.updatedAt));

    if (rows.length === 0) {
      return [];
    }

    const slugs = rows.map((row) => row.slug);
    const allContributors = await this.db
      .select()
      .from(schema.skillContributors)
      .where(inArray(schema.skillContributors.skillSlug, slugs));

    const contributorsMap = new Map<string, SkillSearchResult["contributors"]>();
    for (const contributor of allContributors) {
      const list = contributorsMap.get(contributor.skillSlug) ?? [];
      list.push(mapContributorRow(contributor));
      contributorsMap.set(contributor.skillSlug, list);
    }

    return rows.map((row) => {
      const inspectionStatus = parseSkillInspectionStatus(row.inspectionStatus);
      return {
      slug: row.slug,
      name: row.name,
      description: row.description,
      latestVersion: row.pendingVersion ?? row.latestVersion,
      inspectionStatus,
      inspectionFailure: mapReviewFailureFromRow(
        inspectionStatus,
        row.inspectionFailedStages,
        row.inspectionFailedMessage
      ),
      uploadedAt: mapOptionalTimestamp(row.uploadedAt),
      inspectionStartedAt: mapOptionalTimestamp(row.inspectionStartedAt),
      inspectionEndedAt: mapOptionalTimestamp(row.inspectionEndedAt),
      status: "needs-inspection",
      scores: {
        qualityScore: 0,
        securityScore: 0,
        reliabilityScore: 0,
      },
      categories: [],
      averageRating: Number(row.averageRating),
      ratingCount: Number(row.ratingCount),
      openIssues: row.openIssues,
      contributors: contributorsMap.get(row.slug) ?? [],
      downloads: 0,
      updatedAt: toIsoTimestampString(row.updatedAt),
      published: false,
    };
    });
  }

  async listIssues(slug: string, status?: string): Promise<RegistryIssue[]> {
    await this.ensureSchema();
    const rows = await this.db.select()
      .from(schema.skillIssues)
      .where(eq(schema.skillIssues.skillSlug, slug))
      .orderBy(schema.skillIssues.createdAt);

    return rows
      .filter((i) => !status || i.status === status)
      .map((i) => ({
        id: i.id, type: i.type as IssueType, status: i.status as IssueStatus, severity: i.severity as IssueSeverity,
        title: i.title, body: i.body ?? undefined, createdBy: i.createdBy ?? undefined,
        createdAt: String(i.createdAt), updatedAt: String(i.updatedAt),
      }));
  }

  async getVersion(slug: string, ver = "latest"): Promise<RegistryVersion | undefined> {
    const skill = await this.getSkill(slug);
    if (!skill) return undefined;
    const resolved = resolveVersionReference(skill, ver);
    return skill.versions[resolved];
  }

  async unpublishSkill(slug: string): Promise<RegistrySkill> {
    await this.ensureSchema();
    const now = new Date();
    const updated = await this.db.update(schema.skills)
      .set({ published: false, updatedAt: now })
      .where(eq(schema.skills.slug, slug))
      .returning({ slug: schema.skills.slug });

    if (updated.length === 0) {
      throw new Error(`Skill not found: ${slug}`);
    }

    const skill = await this.getSkill(slug);
    if (!skill) {
      throw new Error(`Skill not found: ${slug}`);
    }
    return skill;
  }

  async republishSkill(slug: string): Promise<RegistrySkill> {
    await this.ensureSchema();
    const skill = await this.getSkill(slug);
    if (!skill) {
      throw new Error(`Skill not found: ${slug}`);
    }
    assertSkillRepublishAllowed(skill);

    const now = new Date();
    const updated = await this.db.update(schema.skills)
      .set({ published: true, updatedAt: now })
      .where(eq(schema.skills.slug, slug))
      .returning({ slug: schema.skills.slug });

    if (updated.length === 0) {
      throw new Error(`Skill not found: ${slug}`);
    }

    const updatedSkill = await this.getSkill(slug);
    if (!updatedSkill) {
      throw new Error(`Skill not found: ${slug}`);
    }
    return updatedSkill;
  }

  async unpublishVersion(slug: string, version: string): Promise<RegistrySkill> {
    await this.ensureSchema();
    const [skillRow] = await this.db
      .select({ latestVersion: schema.skills.latestVersion })
      .from(schema.skills)
      .where(eq(schema.skills.slug, slug))
      .limit(1);

    if (!skillRow) {
      throw new Error(`Skill not found: ${slug}`);
    }
    if (skillRow.latestVersion === version) {
      throw new Error("cannot_unpublish_latest_version");
    }

    const [versionRow] = await this.db
      .select({ published: schema.skillVersions.published })
      .from(schema.skillVersions)
      .where(and(eq(schema.skillVersions.skillSlug, slug), eq(schema.skillVersions.version, version)))
      .limit(1);

    if (!versionRow) {
      throw new Error(`Version not found: ${slug}@${version}`);
    }
    if (versionRow.published === false) {
      throw new Error("version_already_unpublished");
    }

    const now = new Date();
    await this.db
      .update(schema.skillVersions)
      .set({ published: false, updatedAt: now })
      .where(and(eq(schema.skillVersions.skillSlug, slug), eq(schema.skillVersions.version, version)));
    await this.db.update(schema.skills).set({ updatedAt: now }).where(eq(schema.skills.slug, slug));

    const skill = await this.getSkill(slug);
    if (!skill) {
      throw new Error(`Skill not found: ${slug}`);
    }
    return skill;
  }

  async republishVersion(slug: string, version: string): Promise<RegistrySkill> {
    await this.ensureSchema();
    const skill = await this.getSkill(slug);
    if (!skill) {
      throw new Error(`Skill not found: ${slug}`);
    }
    assertSkillVersionRepublishAllowed(skill, version);

    const [versionRow] = await this.db
      .select({ published: schema.skillVersions.published })
      .from(schema.skillVersions)
      .where(and(eq(schema.skillVersions.skillSlug, slug), eq(schema.skillVersions.version, version)))
      .limit(1);

    if (!versionRow) {
      throw new Error(`Version not found: ${slug}@${version}`);
    }
    if (versionRow.published !== false) {
      throw new Error("version_already_published");
    }

    const now = new Date();
    await this.db
      .update(schema.skillVersions)
      .set({ published: true, updatedAt: now })
      .where(and(eq(schema.skillVersions.skillSlug, slug), eq(schema.skillVersions.version, version)));
    await this.db.update(schema.skills).set({ updatedAt: now }).where(eq(schema.skills.slug, slug));

    const updatedSkill = await this.getSkill(slug);
    if (!updatedSkill) {
      throw new Error(`Skill not found: ${slug}`);
    }
    return updatedSkill;
  }

  async deleteSkill(slug: string): Promise<void> {
    await this.ensureSchema();
    const now = new Date();
    const updated = await this.db
      .update(schema.skills)
      .set({ deletedAt: now, published: false, updatedAt: now })
      .where(and(eq(schema.skills.slug, slug), isNull(schema.skills.deletedAt)))
      .returning({ slug: schema.skills.slug });

    if (updated.length > 0) {
      return;
    }

    const [existing] = await this.db
      .select({ deletedAt: schema.skills.deletedAt })
      .from(schema.skills)
      .where(eq(schema.skills.slug, slug))
      .limit(1);
    if (!existing) {
      throw new Error(`Skill not found: ${slug}`);
    }
    if (existing.deletedAt) {
      return;
    }
    throw new Error(`Skill not found: ${slug}`);
  }

  async restoreSkill(slug: string): Promise<RegistrySkill> {
    await this.ensureSchema();
    const now = new Date();
    const updated = await this.db
      .update(schema.skills)
      .set({ deletedAt: null, updatedAt: now })
      .where(and(eq(schema.skills.slug, slug), isNotNull(schema.skills.deletedAt)))
      .returning({ slug: schema.skills.slug });

    if (updated.length === 0) {
      throw new Error(`Skill not found in recycle bin: ${slug}`);
    }

    const skill = await this.getSkill(slug);
    if (!skill) {
      throw new Error(`Skill not found in recycle bin: ${slug}`);
    }
    return skill;
  }

  async purgeRecycleBinSkill(slug: string): Promise<void> {
    await this.ensureSchema();
    const [existing] = await this.db
      .select({ deletedAt: schema.skills.deletedAt })
      .from(schema.skills)
      .where(eq(schema.skills.slug, slug))
      .limit(1);

    if (!existing) {
      throw new Error(`Skill not found: ${slug}`);
    }
    if (!existing.deletedAt) {
      throw new Error(`Skill not in recycle bin: ${slug}`);
    }

    await this.permanentlyDeleteSkill(slug);
  }

  async bookmarkSkill(userId: string, slug: string): Promise<void> {
    await this.ensureSchema();

    const [skillRow] = await this.db
      .select({ slug: schema.skills.slug })
      .from(schema.skills)
      .where(and(eq(schema.skills.slug, slug), isNull(schema.skills.deletedAt)))
      .limit(1);
    if (!skillRow) {
      throw new Error(`Skill not found: ${slug}`);
    }

    const id = `bookmark_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await this.db
      .insert(schema.skillBookmarks)
      .values({ id, userId, skillSlug: slug, createdAt: new Date() })
      .onConflictDoNothing({
        target: [schema.skillBookmarks.userId, schema.skillBookmarks.skillSlug],
      });
  }

  async unbookmarkSkill(userId: string, slug: string): Promise<void> {
    await this.ensureSchema();
    await this.db
      .delete(schema.skillBookmarks)
      .where(and(eq(schema.skillBookmarks.userId, userId), eq(schema.skillBookmarks.skillSlug, slug)));
  }

  async isSkillBookmarked(userId: string, slug: string): Promise<boolean> {
    await this.ensureSchema();
    const [row] = await this.db
      .select({ id: schema.skillBookmarks.id })
      .from(schema.skillBookmarks)
      .where(and(eq(schema.skillBookmarks.userId, userId), eq(schema.skillBookmarks.skillSlug, slug)))
      .limit(1);
    return Boolean(row);
  }

  async listBookmarkedSkills(userId: string): Promise<SkillSearchResult[]> {
    await this.ensureSchema();

    const rows = await this.db
      .select({
        slug: schema.skills.slug,
        name: schema.skills.name,
        description: schema.skills.description,
        latestVersion: schema.skills.latestVersion,
        inspectionStatus: schema.skills.inspectionStatus,
        status: schema.skillVersions.status,
        categories: schema.skillVersions.categories,
        qualityScore: schema.skillInspections.qualityScore,
        securityScore: schema.skillInspections.securityScore,
        reliabilityScore: schema.skillInspections.reliabilityScore,
        averageRating: schema.skills.averageRating,
        ratingCount: schema.skills.ratingCount,
        totalDownloads: sql<number>`coalesce(sum(${schema.skillVersions.downloads}), 0)`.mapWith(Number),
        updatedAt: schema.skills.updatedAt,
        latestVersionCreatedAt: schema.skillVersions.createdAt,
        openIssues: sql<number>`(
          select count(*) from ${schema.skillIssues}
          where ${schema.skillIssues.skillSlug} = ${schema.skills.slug}
          and ${schema.skillIssues.status} != 'closed'
        )`.mapWith(Number),
        bookmarkedAt: schema.skillBookmarks.createdAt,
      })
      .from(schema.skillBookmarks)
      .innerJoin(schema.skills, eq(schema.skillBookmarks.skillSlug, schema.skills.slug))
      .innerJoin(
        schema.skillVersions,
        and(
          eq(schema.skillVersions.skillSlug, schema.skills.slug),
          eq(schema.skillVersions.version, schema.skills.latestVersion)
        )
      )
      .innerJoin(
        schema.skillInspections,
        and(
          eq(schema.skillInspections.skillSlug, schema.skills.slug),
          eq(schema.skillInspections.version, schema.skills.latestVersion)
        )
      )
      .where(
        and(
          eq(schema.skillBookmarks.userId, userId),
          isNull(schema.skills.deletedAt),
          eq(schema.skills.published, true)
        )
      )
      .groupBy(
        schema.skills.slug,
        schema.skills.name,
        schema.skills.description,
        schema.skills.latestVersion,
        schema.skills.inspectionStatus,
        schema.skillVersions.status,
        schema.skillVersions.categories,
        schema.skillInspections.qualityScore,
        schema.skillInspections.securityScore,
        schema.skillInspections.reliabilityScore,
        schema.skills.averageRating,
        schema.skills.ratingCount,
        schema.skills.updatedAt,
        schema.skillVersions.createdAt,
        schema.skillBookmarks.createdAt
      )
      .orderBy(desc(schema.skillBookmarks.createdAt));

    const slugs = rows.map((r) => r.slug);
    if (slugs.length === 0) {
      return [];
    }

    const allContributors = await this.db
      .select()
      .from(schema.skillContributors)
      .where(inArray(schema.skillContributors.skillSlug, slugs));

    const contributorsMap = new Map<string, SkillSearchResult["contributors"]>();
    for (const c of allContributors) {
      const list = contributorsMap.get(c.skillSlug) ?? [];
      list.push(mapContributorRow(c));
      contributorsMap.set(c.skillSlug, list);
    }

    return rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      description: r.description,
      latestVersion: r.latestVersion,
      inspectionStatus: parseSkillInspectionStatus(r.inspectionStatus),
      status: r.status as SkillSearchResult["status"],
      scores: {
        qualityScore: Number(r.qualityScore),
        securityScore: Number(r.securityScore),
        reliabilityScore: Number(r.reliabilityScore),
      },
      categories: r.categories ?? [],
      averageRating: Number(r.averageRating),
      ratingCount: Number(r.ratingCount),
      openIssues: r.openIssues,
      contributors: contributorsMap.get(r.slug) ?? [],
      downloads: r.totalDownloads,
      updatedAt: toIsoTimestampString(r.updatedAt),
      latestVersionCreatedAt: toIsoTimestampString(r.latestVersionCreatedAt),
      published: true,
    }));
  }

  async listRecycleBinForOwner(ownerUserId: string): Promise<RecycleBinSkill[]> {
    await this.ensureSchema();
    const ownerMatch = or(
      eq(schema.skills.ownerUserId, ownerUserId),
      sql`exists (
        select 1 from ${schema.skillContributors} sc
        where sc.skill_slug = ${schema.skills.slug}
        and sc.role = 'owner'
        and sc.user_id = ${ownerUserId}
      )`
    );

    const rows = await this.db
      .select({
        slug: schema.skills.slug,
        name: schema.skills.name,
        description: schema.skills.description,
        latestVersion: schema.skills.latestVersion,
        deletedAt: schema.skills.deletedAt,
      })
      .from(schema.skills)
      .where(and(isNotNull(schema.skills.deletedAt), ownerMatch))
      .orderBy(desc(schema.skills.deletedAt));

    return rows
      .filter((row) => row.deletedAt)
      .map((row) => ({
        slug: row.slug,
        name: row.name,
        description: row.description,
        latestVersion: row.latestVersion,
        deletedAt: String(row.deletedAt),
        purgeAt: skillRecyclePurgeAt(new Date(row.deletedAt!)).toISOString(),
      }));
  }

  async purgeExpiredRecycleBinSkills(): Promise<number> {
    await this.ensureSchema();
    const cutoff = new Date(Date.now() - skillRecycleRetentionMs());
    const rows = await this.db
      .select({ slug: schema.skills.slug })
      .from(schema.skills)
      .where(and(isNotNull(schema.skills.deletedAt), lte(schema.skills.deletedAt, cutoff)));

    for (const row of rows) {
      await this.permanentlyDeleteSkill(row.slug);
    }
    return rows.length;
  }

  async recoverStaleInspectingSkills(options: RecoverStaleInspectingSkillsOptions = {}): Promise<number> {
    await this.ensureSchema();
    const recoverAll = options.recoverAll ?? false;
    const olderThanMs = options.olderThanMs ?? readInspectionStaleMs();
    const staleBefore = new Date(Date.now() - olderThanMs);

    const rows = await this.db
      .select({
        slug: schema.skillVersions.skillSlug,
        version: schema.skillVersions.version,
        latestVersion: schema.skills.latestVersion,
        updatedAt: schema.skillVersions.updatedAt,
      })
      .from(schema.skillVersions)
      .innerJoin(schema.skills, eq(schema.skills.slug, schema.skillVersions.skillSlug))
      .where(
        and(
          isNull(schema.skills.deletedAt),
          eq(schema.skillVersions.inspectionStatus, "inspecting")
        )
      );

    let recovered = 0;
    for (const row of rows) {
      const isLatest = row.version === row.latestVersion;
      if (!isLatest) {
        await this.markSkillInspectionStatus(row.slug, "failed", {
          version: row.version,
          failure: {
            stages: [],
            message: INSPECTION_SUPERSEDED_MESSAGE,
          },
        });
        recovered += 1;
        continue;
      }

      if (!recoverAll && row.updatedAt > staleBefore) {
        continue;
      }

      await this.markSkillInspectionStatus(row.slug, "failed", {
        version: row.version,
        failure: {
          stages: [],
          message: recoverAll ? INSPECTION_INTERRUPTED_MESSAGE : INSPECTION_STALE_MESSAGE,
        },
      });
      recovered += 1;
    }

    return recovered;
  }

  async purgeAccountData(userId: string): Promise<void> {
    await this.ensureSchema();
    const owned = await this.db
      .select({ slug: schema.skills.slug })
      .from(schema.skills)
      .where(
        or(
          eq(schema.skills.ownerUserId, userId),
          sql`exists (
            select 1 from ${schema.skillContributors} sc
            where sc.skill_slug = ${schema.skills.slug}
              and sc.user_id = ${userId}
              and sc.role = 'owner'
          )`
        )
      );

    for (const row of owned) {
      await this.permanentlyDeleteSkill(row.slug);
    }

    await this.db.delete(schema.skillContributors).where(eq(schema.skillContributors.userId, userId));
  }

  protected async permanentlyDeleteSkill(slug: string): Promise<void> {
    await this.ensureSchema();

    const versions = await this.db.select({
      artifactProvider: schema.skillVersions.artifactProvider,
      artifactBucket: schema.skillVersions.artifactBucket,
      artifactObjectKey: schema.skillVersions.artifactObjectKey,
      artifactContentHash: schema.skillVersions.artifactContentHash,
      artifactSize: schema.skillVersions.artifactSize,
      artifactStoredAt: schema.skillVersions.artifactStoredAt,
    }).from(schema.skillVersions).where(eq(schema.skillVersions.skillSlug, slug));

    const artifacts: ArtifactDescriptor[] = versions
      .filter((version) => version.artifactProvider && version.artifactObjectKey)
      .map((version) => ({
        provider: version.artifactProvider as ArtifactProvider,
        bucket: version.artifactBucket!,
        objectKey: version.artifactObjectKey!,
        contentHash: version.artifactContentHash ?? "",
        size: Number(version.artifactSize ?? 0),
        storedAt: String(version.artifactStoredAt ?? ""),
      }));

    await this.db.transaction(async (tx) => {
      await tx.delete(schema.skillEvaluationReportFindings).where(eq(schema.skillEvaluationReportFindings.skillSlug, slug));
      await tx.delete(schema.skillEvaluationTaskFindings).where(eq(schema.skillEvaluationTaskFindings.skillSlug, slug));
      await tx.delete(schema.skillEvaluationTasks).where(eq(schema.skillEvaluationTasks.skillSlug, slug));
      await tx.delete(schema.skillEvaluations).where(eq(schema.skillEvaluations.skillSlug, slug));
      await tx.delete(schema.skillInspectionFindings).where(eq(schema.skillInspectionFindings.skillSlug, slug));
      await tx.delete(schema.skillInspections).where(eq(schema.skillInspections.skillSlug, slug));
      await tx.delete(schema.skillVersionFiles).where(eq(schema.skillVersionFiles.skillSlug, slug));
      await tx.delete(schema.skillVersionManifestProperties).where(eq(schema.skillVersionManifestProperties.skillSlug, slug));
      await tx.delete(schema.skillVersionTags).where(eq(schema.skillVersionTags.skillSlug, slug));
      await tx.delete(schema.skillVersions).where(eq(schema.skillVersions.skillSlug, slug));
      await tx.delete(schema.skills).where(eq(schema.skills.slug, slug));
    });

    const artifactStore = (this as unknown as {
      artifactStore?: ArtifactStore & { removeSnapshot?: (descriptor: ArtifactDescriptor) => Promise<void> };
    }).artifactStore;
    if (artifactStore?.removeSnapshot) {
      for (const artifact of artifacts) {
        await artifactStore.removeSnapshot(artifact).catch(() => undefined);
      }
    }
  }


  // ==================== Deprecated (base class compatibility) ====================
  protected async load(): Promise<RegistryData> { throw new Error("load() is deprecated — use Drizzle methods directly"); }
  protected async save(_data: RegistryData): Promise<void> { throw new Error("save() is deprecated — use Drizzle methods directly"); }

  // ==================== Schema ====================
  private ensureSchema(): Promise<void> {
    this.schemaReady ??= (async () => {
      const { runMigrations } = await import("../migrate");
      await runMigrations(this.pool);
    })().catch((error) => {
      this.schemaReady = undefined;
      throw error;
    });
    return this.schemaReady;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
