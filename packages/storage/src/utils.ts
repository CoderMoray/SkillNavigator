import type { InspectionVerdict } from "@skill-platform/inspection-engine";
import type { SkillSnapshot } from "@skill-platform/skill-spec";
import { compareSemver } from "@skill-platform/skill-spec/skill-format";
import {
  DEFAULT_SKILL_INSPECTION_STATUS,
  isInspectionFailureStatus,
  isInspectionPendingSkillStatus,
  normalizeSkillInspectionStatus,
  type SkillInspectionStatus,
} from "./inspection-status";
import {
  type RegistryContributor,
  type RegistryData,
  type RegistryRating,
  type RegistrySkill,
  type RegistryVersion,
  type SkillSearchResult,
  type PublishSnapshotOptions,
} from "./types";

export const emptyRegistry: RegistryData = { skills: {} };

export function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeRegistryData(data: RegistryData): RegistryData {
  for (const skill of Object.values(data.skills ?? {})) {
    skill.slug ??= skill.name;
    skill.ownerUserId ??= skill.contributors?.find((c) => c.role === "owner")?.userId;
    skill.contributors ??= [];
    skill.issues ??= [];
    skill.ratings ??= [];
    skill.ratingCount ??= skill.ratings.length;
    skill.published ??= true;
    skill.deletedAt ??= undefined;
    skill.averageRating ??= calculateAverageRating(skill.ratings);
    updateRatingAggregate(skill);

    for (const version of Object.values(skill.versions ?? {})) {
      version.downloads ??= 0;
      version.releaseTags ??= ["latest"];
    }
  }

  return { skills: data.skills ?? {} };
}

export function updateRatingAggregate(skill: RegistrySkill): void {
  skill.ratingCount = skill.ratings.length;
  skill.averageRating = calculateAverageRating(skill.ratings);
}

export function calculateAverageRating(ratings: RegistryRating[]): number {
  if (ratings.length === 0) return 0;
  const total = ratings.reduce((sum, r) => sum + r.score, 0);
  return Math.round((total / ratings.length) * 10) / 10;
}

export function createOwnerContributor(
  snapshot: SkillSnapshot,
  addedAt: string,
  options: PublishSnapshotOptions
): RegistryContributor {
  if (options.owner) {
    return {
      id: createId("contributor"),
      userId: options.owner.userId,
      username: options.owner.username,
      name: options.owner.username,
      role: "owner",
      addedAt,
    };
  }
  return {
    id: createId("contributor"),
    name: snapshot.manifest.author ?? "unknown",
    role: "owner",
    addedAt,
  };
}

export function matchesContributorUser(
  contributor: RegistryContributor,
  userId: string,
  username: string
): boolean {
  return (
    contributor.userId === userId ||
    contributor.username?.toLowerCase() === username.toLowerCase() ||
    contributor.name.toLowerCase() === username.toLowerCase()
  );
}

export function safeObjectSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "ENOENT";
}

export function normalizeCategoryFilters(categories: string | string[] | undefined): string[] {
  const raw = categories === undefined ? [] : Array.isArray(categories) ? categories : [categories];
  return [...new Set(raw.flatMap((item) => item.split(",")).map((item) => item.trim()).filter(Boolean))];
}

export function skillMatchesCategoryFilters(skillCategories: string[] | undefined, selectedCategories: string[]): boolean {
  if (selectedCategories.length === 0) {
    return true;
  }

  const normalizedSelected = selectedCategories.map((item) => item.trim().toLowerCase());
  const normalizedSkill = (skillCategories ?? []).map((item) => item.trim().toLowerCase());
  return normalizedSelected.some((item) => normalizedSkill.includes(item));
}

export function toIsoTimestampString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    return value;
  }
  return String(value);
}

export function getRecentSortTimestamp(result: Pick<SkillSearchResult, "latestVersionCreatedAt" | "updatedAt">): string {
  return result.latestVersionCreatedAt ?? result.updatedAt;
}

export function compareIsoTimestampsDesc(a: string, b: string): number {
  return b.localeCompare(a);
}

export function sortSkillSearchResultsByRecent(skills: SkillSearchResult[]): SkillSearchResult[] {
  return [...skills].sort((a, b) =>
    compareIsoTimestampsDesc(getRecentSortTimestamp(a), getRecentSortTimestamp(b))
  );
}

export function resolveSkillDisplayVerdict(
  inspectionStatus: SkillInspectionStatus,
  versionStatus: InspectionVerdict,
  versionPublished?: boolean
): InspectionVerdict {
  if (isInspectionFailureStatus(inspectionStatus)) {
    return inspectionStatus === "rejected" ? "rejected" : "needs-inspection";
  }
  if (inspectionStatus === "inspecting") {
    return versionStatus === "rejected" ? "rejected" : "needs-inspection";
  }
  if (versionStatus === "published" && versionPublished === false) {
    return "needs-inspection";
  }
  return versionStatus;
}

export type SkillRepublishBlockReason =
  | "inspection_in_progress"
  | "inspection_failed"
  | "inspection_rejected";

export function resolveVersionInspectionStatus(
  version: Pick<RegistryVersion, "inspectionStatus">
): SkillInspectionStatus {
  return normalizeSkillInspectionStatus(version.inspectionStatus);
}

export function isLatestReviewTarget(
  skill: Pick<RegistrySkill, "latestVersion">,
  version: string
): boolean {
  return skill.latestVersion === version;
}

export function canRetryVersionReview(
  skill: RegistrySkill,
  version: string
): boolean {
  const entry = skill.versions[version];
  if (!entry || !isLatestReviewTarget(skill, version)) {
    return false;
  }
  return isInspectionFailureStatus(resolveVersionInspectionStatus(entry));
}

export function getVersionRepublishBlockReason(
  skill: Pick<RegistrySkill, "latestVersion" | "versions">,
  version: string
): SkillRepublishBlockReason | null {
  const entry = skill.versions[version];
  if (!entry) {
    return null;
  }
  const inspectionStatus = resolveVersionInspectionStatus(entry);
  if (inspectionStatus === "inspecting") {
    return "inspection_in_progress";
  }
  if (isInspectionFailureStatus(inspectionStatus)) {
    return inspectionStatus === "rejected" ? "inspection_rejected" : "inspection_failed";
  }
  if (entry.status === "rejected") {
    return "inspection_rejected";
  }
  return null;
}

export function getSkillRepublishBlockReason(
  skill: Pick<RegistrySkill, "inspectionStatus" | "latestVersion" | "versions">
): SkillRepublishBlockReason | null {
  return getVersionRepublishBlockReason(skill, skill.latestVersion);
}

export function isSkillUnlisted(
  skill: Pick<RegistrySkill, "published" | "inspectionStatus" | "latestVersion" | "versions">
): boolean {
  if (skill.published === false) {
    return true;
  }
  return getSkillRepublishBlockReason(skill) !== null;
}

export function assertSkillRepublishAllowed(
  skill: Pick<RegistrySkill, "inspectionStatus" | "latestVersion" | "versions">
): void {
  const reason = getSkillRepublishBlockReason(skill);
  if (reason === "inspection_in_progress") {
    throw new Error("skill_republish_blocked_inspection_in_progress");
  }
  if (reason === "inspection_failed") {
    throw new Error("skill_republish_blocked_inspection_failed");
  }
  if (reason === "inspection_rejected") {
    throw new Error("skill_republish_blocked_inspection_rejected");
  }
}

export function assertSkillVersionRepublishAllowed(
  skill: Pick<RegistrySkill, "inspectionStatus" | "latestVersion" | "versions">,
  version: string
): void {
  const registryVersion = skill.versions[version];
  if (!registryVersion) {
    throw new Error(`Version not found: ${version}`);
  }
  if (registryVersion.status === "rejected") {
    throw new Error("skill_republish_blocked_inspection_rejected");
  }
  if (version === skill.latestVersion) {
    assertSkillRepublishAllowed(skill);
  }
}

export function toSearchResult(skill: RegistrySkill): SkillSearchResult {
  const latest = skill.versions[skill.latestVersion];
  if (!latest) {
    throw new Error(`Registry is corrupt: missing latest version for ${skill.slug}`);
  }
  return {
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    latestVersion: skill.latestVersion,
    inspectionStatus: resolveVersionInspectionStatus(latest),
    inspectionFailure: latest.inspectionFailure ?? skill.inspectionFailure,
    uploadedAt: skill.uploadedAt ?? latest.uploadedAt,
    inspectionStartedAt: skill.inspectionStartedAt ?? latest.inspectionStartedAt,
    inspectionEndedAt: skill.inspectionEndedAt ?? latest.inspectionEndedAt,
    status: resolveSkillDisplayVerdict(
      resolveVersionInspectionStatus(latest),
      latest.status,
      latest.published
    ),
    scores: latest.inspection.scores,
    categories: latest.manifest.categories ?? [],
    averageRating: skill.averageRating,
    ratingCount: skill.ratingCount,
    openIssues: skill.issues.filter((i) => i.status !== "closed").length,
    contributors: skill.contributors,
    downloads: Object.values(skill.versions).reduce((t, v) => t + v.downloads, 0),
    updatedAt: skill.updatedAt,
    latestVersionCreatedAt: latest.createdAt,
    published: isSkillUnlisted(skill) ? false : skill.published !== false,
  };
}

export function normalizeReleaseTags(tags: unknown): string[] {
  if (!tags) return ["latest"];
  if (Array.isArray(tags)) {
    const normalized = tags.map(String).filter(Boolean);
    return normalized.length > 0 ? normalized : ["latest"];
  }
  if (typeof tags === "string") {
    const trimmed = tags.trim();
    if (!trimmed) return ["latest"];
    return [trimmed];
  }
  return ["latest"];
}

export function resolveLatestApprovedVersion(skill: RegistrySkill): string | undefined {
  const candidates = Object.values(skill.versions)
    .filter((version) => version.status !== "rejected")
    .sort((a, b) => {
      const compared = compareSemver(b.version, a.version);
      if (compared !== null && compared !== 0) {
        return compared;
      }
      return b.createdAt.localeCompare(a.createdAt);
    });

  return candidates[0]?.version;
}

export function resolveVersionReference(skill: RegistrySkill, version: string): string {
  if (version === "latest") {
    return resolveLatestApprovedVersion(skill) ?? skill.latestVersion;
  }
  for (const [versionKey, registryVersion] of Object.entries(skill.versions)) {
    if (registryVersion.releaseTags.includes(version)) return versionKey;
  }
  return version;
}

/** Failed review may be retried with the same version when no published version exists yet. */
export function hasStoredPendingPackage(skill: RegistrySkill, version: string = skill.latestVersion): boolean {
  const entry = skill.versions[version];
  if (!entry || entry.published !== false) {
    return false;
  }
  if ("artifact" in entry && entry.artifact) {
    return true;
  }
  return (entry.snapshot?.files?.length ?? 0) > 0;
}

/** Failed review may be retried with the same version when no published version exists yet. */
export function canRepublishFailedVersion(skill: RegistrySkill, version: string): boolean {
  const entry = skill.versions[version];
  if (!entry || !isInspectionFailureStatus(resolveVersionInspectionStatus(entry))) {
    return false;
  }
  if (hasStoredPendingPackage(skill, version)) {
    return false;
  }

  if (entry.published === false) {
    return true;
  }

  return !Object.values(skill.versions).some((item) => item.published);
}

export function isSkillOwner(
  skill: RegistrySkill,
  user: { id: string; username: string }
): boolean {
  if (skill.ownerUserId && skill.ownerUserId === user.id) {
    return true;
  }

  return skill.contributors.some(
    (contributor) => contributor.role === "owner" && matchesContributorUser(contributor, user.id, user.username)
  );
}

export function isSkillContributor(
  skill: RegistrySkill,
  user: { id: string; username: string; role?: string }
): boolean {
  if (user.role === "admin") return true;
  if (skill.ownerUserId && skill.ownerUserId === user.id) return true;
  return skill.contributors.some((c) => matchesContributorUser(c, user.id, user.username));
}

type SkillDetailAccessSubject = Pick<
  RegistrySkill,
  "published" | "inspectionStatus" | "ownerUserId" | "contributors" | "deletedAt"
>;

export function canAccessSkillDetail(
  skill: SkillDetailAccessSubject,
  user: { id: string; username: string; role?: string } | undefined
): boolean {
  if (skill.deletedAt) {
    return false;
  }
  if (skill.published !== false && skill.inspectionStatus === "completed") {
    return true;
  }
  if (!user) {
    return false;
  }
  if (isInspectionPendingSkillStatus(skill.inspectionStatus)) {
    return isSkillContributor(skill as RegistrySkill, user);
  }
  if (skill.published === false) {
    return isSkillOwner(skill as RegistrySkill, user);
  }
  return true;
}

export function canAccessUnpublishedVersion(
  skill: RegistrySkill,
  version: { published?: boolean; inspectionStatus?: SkillInspectionStatus },
  user: { id: string; username: string; role?: string } | undefined
): boolean {
  if (version.published !== false) {
    return true;
  }
  if (!user) {
    return false;
  }
  if (isInspectionPendingSkillStatus(version.inspectionStatus ?? DEFAULT_SKILL_INSPECTION_STATUS)) {
    return isSkillContributor(skill, user);
  }
  return isSkillOwner(skill, user);
}
