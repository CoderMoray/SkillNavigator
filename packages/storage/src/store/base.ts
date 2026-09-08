import type { FunctionalEvaluationReport } from "@skill-platform/evaluator";
import type { InspectionReport } from "@skill-platform/inspection-engine";
import { getSkillSlug, type SkillSnapshot } from "@skill-platform/skill-spec";
import { assertPublishPreflight } from "../publish-preflight.js";
import {
  INSPECTION_INTERRUPTED_MESSAGE,
  INSPECTION_STALE_MESSAGE,
  INSPECTION_SUPERSEDED_MESSAGE,
  isInspectionFailureStatus,
  readInspectionStaleMs,
} from "../inspection-status.js";
import type {
  ArtifactStore,
  CreateIssueInput,
  CreateRatingInput,
  IssueStatus,
  LeaderboardSort,
  PublishSnapshotOptions,
  CommitInspectionResultsOptions,
  PersistInspectionStageResultsOptions,
  StagePendingPublishSnapshotOptions,
  RecoverStaleInspectingSkillsOptions,
  MarkSkillInspectionStatusOptions,
  RegistryContributor,
  RegistryData,
  RegistryIssue,
  RegistryRating,
  RegistrySkill,
  RegistryVersion,
  RegistryStore,
  SkillInspectionStatus,
  SkillSearchResult,
  RecycleBinSkill,
  SkillSlugAvailability,
} from "../types";
import { skillRecyclePurgeAt } from "../recycle-bin";
import { assertAssignableContributorRole } from "../contributors";
import {
  createId,
  createOwnerContributor,
  isSkillOwner,
  matchesContributorUser,
  normalizeCategoryFilters,
  assertSkillRepublishAllowed,
  assertSkillVersionRepublishAllowed,
  normalizeReleaseTags,
  resolveVersionReference,
  resolveVersionInspectionStatus,
  skillMatchesCategoryFilters,
  compareIsoTimestampsDesc,
  getRecentSortTimestamp,
  toSearchResult,
  updateRatingAggregate,
} from "../utils";

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

function syncSkillInspectionDenormFromLatest(skill: RegistrySkill): void {
  const latest = skill.versions[skill.latestVersion];
  if (!latest) {
    return;
  }

  const inspectionStatus = resolveVersionInspectionStatus(latest);
  skill.inspectionStatus = inspectionStatus;
  skill.inspectionFailure = isInspectionFailureStatus(inspectionStatus)
    ? (latest.inspectionFailure ?? { stages: [], message: "审查流程未完成" })
    : undefined;
  skill.inspectionCompletedStages = latest.inspectionCompletedStages;
  skill.inspectionStartedAt = latest.inspectionStartedAt;
  skill.inspectionEndedAt = latest.inspectionEndedAt;
  skill.uploadedAt = latest.uploadedAt ?? skill.uploadedAt;
  if (isInspectionFailureStatus(inspectionStatus)) {
    skill.published = false;
  }
}

export abstract class JsonRegistryStore implements RegistryStore {
  protected constructor(protected readonly artifactStore?: ArtifactStore) {}

  async markSkillInspectionStatus(
    slug: string,
    inspectionStatus: SkillInspectionStatus,
    options?: MarkSkillInspectionStatusOptions
  ): Promise<void> {
    const data = await this.load();
    const existing = data.skills[slug];
    const now = new Date().toISOString();
    const targetVersion = resolveMarkReviewTargetVersion(options, existing?.latestVersion);
    const latestPointer = resolveMarkReviewLatestPointer(options);
    const failure = isInspectionFailureStatus(inspectionStatus)
      ? (options?.failure ?? { stages: [], message: "审查流程未完成" })
      : undefined;

    if (existing) {
      existing.updatedAt = now;
      if (options?.name !== undefined) {
        existing.name = options.name;
      }
      if (options?.description !== undefined) {
        existing.description = options.description;
      }
      if (latestPointer) {
        existing.latestVersion = latestPointer;
      }
      if (options?.ownerUserId && options.ownerUsername) {
        const hasOwner = existing.contributors.some((item) => item.role === "owner");
        if (!hasOwner) {
          existing.contributors.push({
            id: `contributor_${Date.now()}`,
            userId: options.ownerUserId,
            username: options.ownerUsername,
            name: options.ownerUsername,
            role: "owner",
            addedAt: now,
          });
        }
      }

      if (targetVersion) {
        const version = existing.versions[targetVersion];
        if (version) {
          version.inspectionStatus = inspectionStatus;
          version.inspectionFailure = isInspectionFailureStatus(inspectionStatus) ? failure : undefined;
          if (inspectionStatus === "inspecting") {
            version.inspectionStartedAt = now;
            version.inspectionEndedAt = undefined;
            version.inspectionCompletedStages = [];
          } else if (inspectionStatus === "completed" || isInspectionFailureStatus(inspectionStatus)) {
            version.inspectionEndedAt = now;
          }
          if (inspectionStatus === "rejected") {
            version.status = "rejected";
          }
          version.updatedAt = now;
        }
      }

      syncSkillInspectionDenormFromLatest(existing);
      await this.save(data);
      return;
    }

    if (!options?.name || options.description === undefined || !latestPointer) {
      throw new Error(`Skill not found: ${slug}`);
    }

    data.skills[slug] = {
      slug,
      name: options.name,
      description: options.description,
      ownerUserId: options.ownerUserId,
      latestVersion: latestPointer,
      inspectionStatus,
      inspectionFailure: isInspectionFailureStatus(inspectionStatus) ? failure : undefined,
      versions: {},
      contributors:
        options.ownerUserId && options.ownerUsername
          ? [
              {
                id: `contributor_${Date.now()}`,
                userId: options.ownerUserId,
                username: options.ownerUsername,
                name: options.ownerUsername,
                role: "owner",
                addedAt: now,
              },
            ]
          : [],
      issues: [],
      ratings: [],
      averageRating: 0,
      ratingCount: 0,
      published: false,
      createdAt: now,
      updatedAt: now,
    };
    await this.save(data);
  }

  async commitInspectionResultsBeforePublish(
    snapshot: SkillSnapshot,
    inspection: InspectionReport,
    evaluation?: FunctionalEvaluationReport,
    options: CommitInspectionResultsOptions = {}
  ): Promise<void> {
    const data = await this.load();
    const slug = getSkillSlug(snapshot.manifest);
    const version = inspection.version;
    const releaseTags = normalizeReleaseTags(
      options.releaseTags ?? snapshot.manifest["release-tags"] ?? ["latest"]
    );
    const existingSkill = data.skills[slug];
    assertPublishPreflight({
      slug,
      version,
      releaseTags,
      existingSkill,
      allowInspectionInProgress: true,
    });

    if (!existingSkill?.versions[version]) {
      const now = new Date().toISOString();
      if (!data.skills[slug]) {
        throw new Error(`Skill not found: ${slug}`);
      }
      data.skills[slug]!.versions[version] = {
        version,
        manifest: snapshot.manifest,
        contentHash: snapshot.contentHash,
        snapshot,
        inspection,
        evaluation,
        status: inspection.verdict,
        releaseTags,
        downloads: 0,
        published: false,
        createdAt: now,
        updatedAt: now,
      };
    } else {
      data.skills[slug]!.versions[version]!.inspection = inspection;
      data.skills[slug]!.versions[version]!.evaluation = evaluation;
      data.skills[slug]!.versions[version]!.status = inspection.verdict;
      data.skills[slug]!.versions[version]!.updatedAt = new Date().toISOString();
    }

    const skill = data.skills[slug]!;
    const registryVersion = skill.versions[version]!;
    registryVersion.inspectionStatus = "completed";
    registryVersion.inspectionFailure = undefined;
    syncSkillInspectionDenormFromLatest(skill);
    skill.updatedAt = new Date().toISOString();
    await this.save(data);
  }

  async rollbackPendingPublishVersion(slug: string, version: string): Promise<void> {
    const data = await this.load();
    const skill = data.skills[slug];
    if (!skill?.versions[version]) {
      return;
    }
    if (skill.versions[version]!.published !== false) {
      return;
    }
    delete skill.versions[version];
    skill.updatedAt = new Date().toISOString();
    await this.save(data);
  }

  async stagePendingPublishSnapshot(
    snapshot: SkillSnapshot,
    version: string,
    options: StagePendingPublishSnapshotOptions = {}
  ): Promise<void> {
    const data = await this.load();
    const slug = getSkillSlug(snapshot.manifest);
    const now = new Date().toISOString();
    const skill = data.skills[slug] ?? {
      slug,
      name: snapshot.manifest.name,
      description: snapshot.manifest.description ?? "",
      latestVersion: version,
      inspectionStatus: "inspecting" as const,
      versions: {},
      contributors: [],
      issues: [],
      ratings: [],
      averageRating: 0,
      ratingCount: 0,
      published: false,
      createdAt: now,
      updatedAt: now,
    };
    skill.versions[version] = {
      version,
      manifest: snapshot.manifest,
      snapshot,
      contentHash: snapshot.contentHash,
      status: "needs-inspection",
      releaseTags: options.releaseTags ?? ["latest"],
      changelog: options.changelog,
      downloads: 0,
      published: false,
      inspection: {} as RegistryVersion["inspection"],
      inspectionStatus: "inspecting",
      inspectionCompletedStages: [],
      uploadedAt: now,
      inspectionStartedAt: now,
      inspectionEndedAt: undefined,
      createdAt: now,
      updatedAt: now,
    };
    skill.uploadedAt = now;
    for (const [existingVersion, entry] of Object.entries(skill.versions)) {
      if (
        existingVersion !== version &&
        resolveVersionInspectionStatus(entry) === "inspecting"
      ) {
        entry.inspectionStatus = "interrupted";
        entry.inspectionFailure = { stages: [], message: INSPECTION_SUPERSEDED_MESSAGE };
        entry.status = "rejected";
        entry.inspectionEndedAt = now;
        entry.updatedAt = now;
      }
    }
    skill.latestVersion = version;
    skill.updatedAt = now;
    syncSkillInspectionDenormFromLatest(skill);
    if (options.ownerUserId && options.ownerUsername) {
      const hasOwner = skill.contributors.some((item) => item.role === "owner");
      if (!hasOwner) {
        skill.contributors.push({
          id: `contributor_${Date.now()}`,
          userId: options.ownerUserId,
          username: options.ownerUsername,
          name: options.ownerUsername,
          role: "owner",
          addedAt: now,
        });
      }
      skill.ownerUserId = options.ownerUserId;
    }
    data.skills[slug] = skill;
    await this.save(data);
  }

  async loadStoredSnapshot(slug: string, version: string): Promise<SkillSnapshot | undefined> {
    const skill = (await this.load()).skills[slug];
    const registryVersion = skill?.versions[version];
    return registryVersion?.snapshot;
  }

  async publishSnapshot(
    snapshot: SkillSnapshot,
    inspection: InspectionReport,
    evaluation?: FunctionalEvaluationReport,
    options: PublishSnapshotOptions = {}
  ): Promise<RegistryVersion> {
    const data = await this.load();
    const slug = getSkillSlug(snapshot.manifest);
    snapshot = { ...snapshot, manifest: { ...snapshot.manifest, slug } };
    const version = inspection.version;
    const now = new Date().toISOString();
    const existingSkill = data.skills[slug];
    const releaseTags = normalizeReleaseTags(
      options.releaseTags ?? snapshot.manifest["release-tags"] ?? ["latest"]
    );

    assertPublishPreflight({
      slug,
      version,
      releaseTags,
      existingSkill,
      allowInspectionInProgress: options.inspectionAlreadyCommitted ?? false,
    });

    const artifact = await this.artifactStore?.putSnapshot(slug, version, snapshot);
    const publiclyListed = inspection.verdict !== "rejected";
    const registryVersion: RegistryVersion = {
      version,
      manifest: snapshot.manifest,
      contentHash: snapshot.contentHash,
      snapshot,
      artifact,
      inspection,
      evaluation,
      status: inspection.verdict,
      releaseTags,
      changelog: options.changelog,
      downloads: 0,
      published: publiclyListed,
      inspectionStatus: "completed",
      inspectionFailure: undefined,
      createdAt: now,
      updatedAt: now,
    };

    const ownerContributor = createOwnerContributor(snapshot, now, options);
    const contributors = existingSkill?.contributors ?? [ownerContributor];
    if (existingSkill && options.owner && !existingSkill.ownerUserId &&
        !contributors.some((item) => matchesContributorUser(item, options.owner!.userId, options.owner!.username))) {
      contributors.push(ownerContributor);
    }

    const versions = Object.fromEntries(
      Object.entries(existingSkill?.versions ?? {}).map(([v, rv]) => [
        v,
        { ...rv, releaseTags: rv.releaseTags.filter((t) => !releaseTags.includes(t)) },
      ])
    );

    const skillRecord: RegistrySkill = {
      slug,
      name: snapshot.manifest.name,
      description: snapshot.manifest.description,
      ownerUserId: existingSkill?.ownerUserId ?? options.owner?.userId,
      latestVersion: releaseTags.includes("latest") ? version : (existingSkill?.latestVersion ?? version),
      inspectionStatus: "completed",
      versions: { ...versions, [version]: registryVersion },
      contributors,
      issues: existingSkill?.issues ?? [],
      ratings: existingSkill?.ratings ?? [],
      averageRating: existingSkill?.averageRating ?? 0,
      ratingCount: existingSkill?.ratingCount ?? 0,
      published: publiclyListed,
      createdAt: existingSkill?.createdAt ?? now,
      updatedAt: now,
    };
    syncSkillInspectionDenormFromLatest(skillRecord);
    data.skills[slug] = skillRecord;

    await this.save(data);
    return registryVersion;
  }

  async upsertInspection(
    slug: string,
    version: string,
    inspection: InspectionReport,
    options: { finalize?: boolean } = {}
  ): Promise<RegistryVersion> {
    const data = await this.load();
    const registryVersion = data.skills[slug]?.versions[version];
    if (!registryVersion) throw new Error(`Version not found: ${slug}@${version}`);
    registryVersion.inspection = inspection;
    if (options.finalize !== false) {
      registryVersion.status = inspection.verdict;
    }
    registryVersion.updatedAt = new Date().toISOString();
    if (options.finalize !== false) {
      registryVersion.inspectionStatus = "completed";
      registryVersion.inspectionFailure = undefined;
      syncSkillInspectionDenormFromLatest(data.skills[slug]!);
    }
    data.skills[slug]!.updatedAt = registryVersion.updatedAt;
    await this.save(data);
    return registryVersion;
  }

  async persistInspectionStageResults(
    slug: string,
    version: string,
    inspection: InspectionReport,
    evaluation: FunctionalEvaluationReport | undefined,
    options: PersistInspectionStageResultsOptions
  ): Promise<void> {
    await this.upsertInspection(slug, version, inspection, { finalize: options.finalize ?? false });
    if (evaluation) {
      await this.upsertEvaluation(slug, version, evaluation);
    }
    const data = await this.load();
    const skill = data.skills[slug];
    if (!skill) {
      return;
    }
    const registryVersion = skill.versions[version];
    if (!registryVersion) {
      return;
    }
    registryVersion.inspectionCompletedStages = [...new Set(options.completedStages)];
    if (options.finalize) {
      registryVersion.inspectionStatus = "completed";
      registryVersion.inspectionFailure = undefined;
    }
    syncSkillInspectionDenormFromLatest(skill);
    skill.updatedAt = new Date().toISOString();
    await this.save(data);
  }

  async upsertEvaluation(slug: string, version: string, evaluation: FunctionalEvaluationReport): Promise<RegistryVersion> {
    const data = await this.load();
    const registryVersion = data.skills[slug]?.versions[version];
    if (!registryVersion) throw new Error(`Version not found: ${slug}@${version}`);
    registryVersion.evaluation = evaluation;
    registryVersion.updatedAt = new Date().toISOString();
    data.skills[slug]!.updatedAt = registryVersion.updatedAt;
    await this.save(data);
    return registryVersion;
  }

  async addContributor(slug: string, contributor: Omit<RegistryContributor, "id" | "addedAt">): Promise<RegistryContributor> {
    const data = await this.load();
    const skill = data.skills[slug];
    if (!skill) throw new Error(`Skill not found: ${slug}`);
    const role = assertAssignableContributorRole(contributor.role);
    const existing = skill.contributors.find((item) => item.name.toLowerCase() === contributor.name.toLowerCase());
    const now = new Date().toISOString();
    if (existing) {
      if (existing.role === "owner") {
        throw new Error("cannot_modify_owner_contributor");
      }
      throw new Error("contributor_already_exists");
    }
    const created: RegistryContributor = { id: createId("contributor"), ...contributor, role, addedAt: now };
    skill.contributors.push(created);
    skill.updatedAt = now;
    await this.save(data);
    return created;
  }

  async removeContributor(slug: string, contributorId: string): Promise<void> {
    const data = await this.load();
    const skill = data.skills[slug];
    if (!skill) {
      throw new Error(`Skill not found: ${slug}`);
    }

    const index = skill.contributors.findIndex((item) => item.id === contributorId);
    if (index === -1) {
      throw new Error("contributor_not_found");
    }
    if (skill.contributors[index]!.role === "owner") {
      throw new Error("cannot_modify_owner_contributor");
    }

    skill.contributors.splice(index, 1);
    skill.updatedAt = new Date().toISOString();
    await this.save(data);
  }

  async createIssue(slug: string, issue: CreateIssueInput): Promise<RegistryIssue> {
    const data = await this.load();
    const skill = data.skills[slug];
    if (!skill) throw new Error(`Skill not found: ${slug}`);
    const now = new Date().toISOString();
    const created: RegistryIssue = {
      id: createId("issue"), type: issue.type, status: "open",
      severity: issue.severity ?? "medium", title: issue.title, body: issue.body,
      createdBy: issue.createdBy, createdAt: now, updatedAt: now,
    };
    skill.issues.push(created);
    skill.updatedAt = now;
    await this.save(data);
    return created;
  }

  async listIssues(slug: string, status?: IssueStatus): Promise<RegistryIssue[]> {
    const data = await this.load();
    const issues = data.skills[slug]?.issues ?? [];
    return status ? issues.filter((i) => i.status === status) : issues;
  }

  async addRating(slug: string, rating: CreateRatingInput): Promise<RegistryRating> {
    if (rating.score < 1 || rating.score > 5) throw new Error("Rating score must be between 1 and 5");
    const data = await this.load();
    const skill = data.skills[slug];
    if (!skill) throw new Error(`Skill not found: ${slug}`);
    const version = rating.version?.trim() || skill.latestVersion;
    if (!skill.versions[version]) throw new Error(`Version not found: ${version}`);
    const normalizedUser = rating.user.trim().toLowerCase();
    if (
      skill.ratings.some(
        (existing) =>
          existing.user.trim().toLowerCase() === normalizedUser && (existing.version ?? skill.latestVersion) === version
      )
    ) {
      throw new Error("rating_already_submitted");
    }
    const created: RegistryRating = {
      id: createId("rating"), version, user: rating.user,
      score: rating.score, comment: rating.comment, createdAt: new Date().toISOString(),
    };
    skill.ratings.push(created);
    updateRatingAggregate(skill);
    skill.updatedAt = created.createdAt;
    await this.save(data);
    return created;
  }

  async search(query = "", categories: string[] = []): Promise<SkillSearchResult[]> {
    const data = await this.load();
    const q = query.trim().toLowerCase();
    const selectedCategories = normalizeCategoryFilters(categories);
    return Object.values(data.skills)
      .filter((s) => s.published !== false)
      .filter((s) => !s.deletedAt)
      .filter((s) => s.versions[s.latestVersion]?.status !== "rejected")
      .filter((s) => !q || s.slug.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
      .filter((s) => {
        const latest = s.versions[s.latestVersion];
        return skillMatchesCategoryFilters(latest?.manifest.categories, selectedCategories);
      })
      .map(toSearchResult)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async listAuditSkills(query = ""): Promise<SkillSearchResult[]> {
    const data = await this.load();
    const q = query.trim().toLowerCase();
    return Object.values(data.skills)
      .filter((s) => s.published !== false)
      .filter((s) => !s.deletedAt)
      .filter((s) => !q || s.slug.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
      .map(toSearchResult)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async listUnpublishedSkillsForOwner(ownerUserId: string): Promise<SkillSearchResult[]> {
    const data = await this.load();
    return Object.values(data.skills)
      .filter((skill) => skill.published === false && !skill.deletedAt && isSkillOwner(skill, { id: ownerUserId, username: "" }))
      .map((skill) => ({ ...toSearchResult(skill), published: false }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async listRejectedSkillsForOwner(ownerUserId: string): Promise<SkillSearchResult[]> {
    const data = await this.load();
    return Object.values(data.skills)
      .filter((skill) => !skill.deletedAt && isSkillOwner(skill, { id: ownerUserId, username: "" }))
      .filter((skill) => skill.versions[skill.latestVersion]?.status === "rejected")
      .map((skill) => ({ ...toSearchResult(skill), published: skill.published !== false }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async listInspectionPendingSkillsForOwner(_ownerUserId: string): Promise<SkillSearchResult[]> {
    return [];
  }

  async getSkill(slug: string): Promise<RegistrySkill | undefined> {
    return (await this.load()).skills[slug];
  }

  async getSkillSlugAvailability(slug: string): Promise<SkillSlugAvailability> {
    const skill = (await this.load()).skills[slug];
    if (!skill) {
      return { status: "available" };
    }
    if (skill.deletedAt) {
      const deletedAt = new Date(skill.deletedAt);
      return {
        status: "recycle_bin",
        slug: skill.slug,
        name: skill.name,
        deletedAt: skill.deletedAt,
        purgeAt: skillRecyclePurgeAt(deletedAt).toISOString(),
      };
    }
    return {
      status: "active",
      slug: skill.slug,
      name: skill.name,
      latestVersion: skill.latestVersion,
      published: skill.published !== false,
    };
  }

  async getVersion(slug: string, version = "latest"): Promise<RegistryVersion | undefined> {
    const skill = (await this.load()).skills[slug];
    if (!skill) return undefined;
    return skill.versions[resolveVersionReference(skill, version)];
  }

  async leaderboard(sort: LeaderboardSort = "downloads", limit = 20, categories: string[] = []): Promise<SkillSearchResult[]> {
    const items = await this.search("", categories);
    return items.sort((a, b) => {
      switch (sort) {
        case "rating": return b.averageRating - a.averageRating || b.ratingCount - a.ratingCount;
        case "quality": return b.scores.qualityScore - a.scores.qualityScore;
        case "security": return b.scores.securityScore - a.scores.securityScore;
        case "reliability": return b.scores.reliabilityScore - a.scores.reliabilityScore;
        case "recent":
          return compareIsoTimestampsDesc(getRecentSortTimestamp(a), getRecentSortTimestamp(b));
        default: return b.downloads - a.downloads;
      }
    }).slice(0, Math.max(1, Math.min(limit, 100)));
  }

  async downloadSnapshot(slug: string, version = "latest"): Promise<SkillSnapshot | undefined> {
    const data = await this.load();
    const skill = data.skills[slug];
    if (!skill) return undefined;
    const resolved = resolveVersionReference(skill, version);
    const rv = skill.versions[resolved];
    if (!rv) return undefined;
    const snapshot = rv.artifact && this.artifactStore
      ? await this.artifactStore.getSnapshot(rv.artifact)
      : rv.snapshot;
    rv.downloads += 1;
    rv.updatedAt = new Date().toISOString();
    await this.save(data);
    return snapshot;
  }

  async unpublishSkill(slug: string): Promise<RegistrySkill> {
    const data = await this.load();
    const skill = data.skills[slug];
    if (!skill) {
      throw new Error(`Skill not found: ${slug}`);
    }

    const now = new Date().toISOString();
    skill.published = false;
    skill.updatedAt = now;
    await this.save(data);
    return skill;
  }

  async republishSkill(slug: string): Promise<RegistrySkill> {
    const data = await this.load();
    const skill = data.skills[slug];
    if (!skill) {
      throw new Error(`Skill not found: ${slug}`);
    }
    assertSkillRepublishAllowed(skill);

    const now = new Date().toISOString();
    skill.published = true;
    skill.updatedAt = now;
    await this.save(data);
    return skill;
  }

  async unpublishVersion(slug: string, version: string): Promise<RegistrySkill> {
    const data = await this.load();
    const skill = data.skills[slug];
    if (!skill) {
      throw new Error(`Skill not found: ${slug}`);
    }
    if (skill.latestVersion === version) {
      throw new Error("cannot_unpublish_latest_version");
    }

    const registryVersion = skill.versions[version];
    if (!registryVersion) {
      throw new Error(`Version not found: ${slug}@${version}`);
    }
    if (registryVersion.published === false) {
      throw new Error("version_already_unpublished");
    }

    const now = new Date().toISOString();
    registryVersion.published = false;
    registryVersion.updatedAt = now;
    skill.updatedAt = now;
    await this.save(data);
    return skill;
  }

  async republishVersion(slug: string, version: string): Promise<RegistrySkill> {
    const data = await this.load();
    const skill = data.skills[slug];
    if (!skill) {
      throw new Error(`Skill not found: ${slug}`);
    }
    assertSkillVersionRepublishAllowed(skill, version);

    const registryVersion = skill.versions[version];
    if (!registryVersion) {
      throw new Error(`Version not found: ${slug}@${version}`);
    }
    if (registryVersion.published !== false) {
      throw new Error("version_already_published");
    }

    const now = new Date().toISOString();
    registryVersion.published = true;
    registryVersion.updatedAt = now;
    skill.updatedAt = now;
    await this.save(data);
    return skill;
  }

  async deleteSkill(slug: string): Promise<void> {
    const data = await this.load();
    const skill = data.skills[slug];
    if (!skill) {
      throw new Error(`Skill not found: ${slug}`);
    }
    if (skill.deletedAt) {
      return;
    }

    const now = new Date().toISOString();
    skill.deletedAt = now;
    skill.published = false;
    skill.updatedAt = now;
    await this.save(data);
  }

  async restoreSkill(slug: string): Promise<RegistrySkill> {
    const data = await this.load();
    const skill = data.skills[slug];
    if (!skill || !skill.deletedAt) {
      throw new Error(`Skill not found in recycle bin: ${slug}`);
    }

    skill.deletedAt = undefined;
    skill.updatedAt = new Date().toISOString();
    await this.save(data);
    return skill;
  }

  async purgeRecycleBinSkill(slug: string): Promise<void> {
    const data = await this.load();
    const skill = data.skills[slug];
    if (!skill) {
      throw new Error(`Skill not found: ${slug}`);
    }
    if (!skill.deletedAt) {
      throw new Error(`Skill not in recycle bin: ${slug}`);
    }
    await this.permanentlyDeleteSkill(slug);
  }

  async listRecycleBinForOwner(ownerUserId: string): Promise<RecycleBinSkill[]> {
    const { skillRecyclePurgeAt } = await import("../recycle-bin");
    const data = await this.load();
    return Object.values(data.skills)
      .filter((skill) => Boolean(skill.deletedAt) && isSkillOwner(skill, { id: ownerUserId, username: "" }))
      .map((skill) => {
        const deletedAt = new Date(skill.deletedAt!);
        return {
          slug: skill.slug,
          name: skill.name,
          description: skill.description,
          latestVersion: skill.latestVersion,
          deletedAt: skill.deletedAt!,
          purgeAt: skillRecyclePurgeAt(deletedAt).toISOString(),
        };
      })
      .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  }

  async bookmarkSkill(_userId: string, _slug: string): Promise<void> {
    throw new Error("Bookmark storage requires PostgreSQL");
  }

  async unbookmarkSkill(_userId: string, _slug: string): Promise<void> {
    throw new Error("Bookmark storage requires PostgreSQL");
  }

  async listBookmarkedSkills(_userId: string): Promise<SkillSearchResult[]> {
    return [];
  }

  async isSkillBookmarked(_userId: string, _slug: string): Promise<boolean> {
    return false;
  }

  async purgeExpiredRecycleBinSkills(): Promise<number> {
    const { skillRecycleRetentionMs } = await import("../recycle-bin");
    const data = await this.load();
    const cutoff = Date.now() - skillRecycleRetentionMs();
    let purged = 0;

    for (const skill of Object.values(data.skills)) {
      if (!skill.deletedAt) {
        continue;
      }
      if (new Date(skill.deletedAt).getTime() > cutoff) {
        continue;
      }
      await this.permanentlyDeleteSkill(skill.slug);
      purged += 1;
    }

    return purged;
  }

  async recoverStaleInspectingSkills(options: RecoverStaleInspectingSkillsOptions = {}): Promise<number> {
    const data = await this.load();
    const recoverAll = options.recoverAll ?? false;
    const olderThanMs = options.olderThanMs ?? readInspectionStaleMs();
    const cutoff = Date.now() - olderThanMs;
    let recovered = 0;

    for (const skill of Object.values(data.skills)) {
      if (skill.deletedAt) {
        continue;
      }

      for (const version of Object.values(skill.versions)) {
        if (resolveVersionInspectionStatus(version) !== "inspecting") {
          continue;
        }

        const isLatest = version.version === skill.latestVersion;
        if (!isLatest) {
          version.inspectionStatus = "interrupted";
          version.inspectionFailure = {
            stages: [],
            message: INSPECTION_SUPERSEDED_MESSAGE,
          };
          version.status = "rejected";
          version.inspectionEndedAt = new Date().toISOString();
          version.updatedAt = version.inspectionEndedAt;
          recovered += 1;
          continue;
        }

        if (!recoverAll && new Date(version.updatedAt).getTime() > cutoff) {
          continue;
        }

        version.inspectionStatus = "interrupted";
        version.inspectionFailure = {
          stages: [],
          message: recoverAll ? INSPECTION_INTERRUPTED_MESSAGE : INSPECTION_STALE_MESSAGE,
        };
        version.status = "rejected";
        version.inspectionEndedAt = new Date().toISOString();
        version.updatedAt = version.inspectionEndedAt;
        recovered += 1;
      }

      syncSkillInspectionDenormFromLatest(skill);
      skill.updatedAt = new Date().toISOString();
    }

    if (recovered > 0) {
      await this.save(data);
    }
    return recovered;
  }

  async purgeAccountData(userId: string): Promise<void> {
    const data = await this.load();
    const ownedSlugs = Object.values(data.skills)
      .filter(
        (skill) =>
          skill.ownerUserId === userId ||
          skill.contributors?.some((contributor) => contributor.userId === userId && contributor.role === "owner")
      )
      .map((skill) => skill.slug);

    for (const slug of ownedSlugs) {
      await this.permanentlyDeleteSkill(slug);
    }

    for (const skill of Object.values(data.skills)) {
      if (!skill.contributors?.length) {
        continue;
      }
      skill.contributors = skill.contributors.filter((contributor) => contributor.userId !== userId);
    }

    await this.save(data);
  }

  protected async permanentlyDeleteSkill(slug: string): Promise<void> {
    const data = await this.load();
    const skill = data.skills[slug];
    if (!skill) {
      throw new Error(`Skill not found: ${slug}`);
    }

    if (this.artifactStore) {
      for (const version of Object.values(skill.versions)) {
        if (version.artifact && "removeSnapshot" in this.artifactStore) {
          await (this.artifactStore as ArtifactStore & { removeSnapshot: (d: typeof version.artifact) => Promise<void> })
            .removeSnapshot(version.artifact)
            .catch(() => undefined);
        }
      }
    }

    delete data.skills[slug];
    await this.save(data);
  }

  async inspectAll(
    pipelineFn: (
      snapshot: SkillSnapshot,
      version: string
    ) => Promise<{ inspection: InspectionReport; evaluation: FunctionalEvaluationReport }>
  ): Promise<RegistryVersion[]> {
    const data = await this.load();
    const reviewed: RegistryVersion[] = [];
    for (const skill of Object.values(data.skills)) {
      if (skill.deletedAt) {
        continue;
      }
      for (const rv of Object.values(skill.versions)) {
        const snapshot = rv.artifact && this.artifactStore
          ? await this.artifactStore.getSnapshot(rv.artifact)
          : rv.snapshot;
        rv.snapshot = snapshot;
        const { inspection, evaluation } = await pipelineFn(snapshot, rv.version);
        rv.inspection = inspection;
        rv.evaluation = evaluation;
        rv.status = rv.inspection.verdict;
        rv.updatedAt = new Date().toISOString();
        reviewed.push(rv);
      }
      skill.updatedAt = new Date().toISOString();
    }
    await this.save(data);
    return reviewed;
  }

  protected abstract load(): Promise<RegistryData>;
  protected abstract save(data: RegistryData): Promise<void>;
}
