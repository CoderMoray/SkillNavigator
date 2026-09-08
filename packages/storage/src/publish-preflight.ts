import { compareSemver } from "@skill-platform/skill-spec/skill-format";
import type { RegistrySkill } from "./types.js";
import { canRepublishFailedVersion, isSkillContributor, resolveVersionReviewStatus } from "./utils.js";

export class PublishPreflightError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "PublishPreflightError";
    this.statusCode = statusCode;
  }
}

export interface PublishPreflightInput {
  slug: string;
  version: string;
  releaseTags: string[];
  existingSkill?: RegistrySkill;
  user?: { id: string; username: string; role?: string };
  /** Internal publishSnapshot path: completing an in-flight review may persist while status is still reviewing. */
  allowReviewInProgress?: boolean;
  /** Retry publish for a failed review using the staged pending version. */
  allowFailedReviewRetry?: boolean;
}

export function assertPublishPreflight(input: PublishPreflightInput): void {
  const { slug, version, releaseTags, existingSkill, user, allowReviewInProgress, allowFailedReviewRetry } = input;

  if (existingSkill?.deletedAt) {
    throw new PublishPreflightError("skill_in_recycle_bin", 409);
  }

  const targetVersion = existingSkill?.versions[version];
  const targetReviewStatus = targetVersion ? resolveVersionReviewStatus(targetVersion) : null;
  const latestEntry = existingSkill?.versions[existingSkill.latestVersion];
  const latestReviewStatus = latestEntry ? resolveVersionReviewStatus(latestEntry) : null;

  if (
    targetReviewStatus === "reviewing" &&
    !allowReviewInProgress &&
    !allowFailedReviewRetry
  ) {
    throw new PublishPreflightError("skill_review_in_progress", 409);
  }

  if (
    existingSkill &&
    latestReviewStatus === "reviewing" &&
    !allowReviewInProgress &&
    !allowFailedReviewRetry
  ) {
    const compared = compareSemver(version, existingSkill.latestVersion);
    if (compared !== null && compared <= 0) {
      throw new PublishPreflightError("skill_review_in_progress", 409);
    }
  }

  if (existingSkill && user && !isSkillContributor(existingSkill, user)) {
    throw new PublishPreflightError("Only skill contributors can publish new versions", 403);
  }

  const pendingVersion = existingSkill?.versions[version];
  const republishingFailedVersion =
    existingSkill !== undefined && canRepublishFailedVersion(existingSkill, version);
  const allowPendingVersion =
    pendingVersion?.published === false &&
    (allowReviewInProgress ||
      republishingFailedVersion ||
      (allowFailedReviewRetry && targetReviewStatus === "failed"));

  if (existingSkill?.versions[version] && !allowPendingVersion) {
    throw new PublishPreflightError(`Version already exists: ${slug}@${version}`, 409);
  }

  if (existingSkill?.versions[existingSkill.latestVersion]) {
    const finalizingPendingVersion =
      allowReviewInProgress && pendingVersion?.published === false && version === existingSkill.latestVersion;
    const retryingFailedVersion =
      allowFailedReviewRetry &&
      targetReviewStatus === "failed" &&
      pendingVersion?.published === false &&
      version === existingSkill.latestVersion;
    const compared = compareSemver(version, existingSkill.latestVersion);
    if (
      !finalizingPendingVersion &&
      !retryingFailedVersion &&
      !republishingFailedVersion &&
      compared !== null &&
      compared <= 0
    ) {
      throw new PublishPreflightError(
        `Version must be greater than latest: ${slug}@${existingSkill.latestVersion}, got ${version}`,
        400
      );
    }
  }

  if (!existingSkill && !releaseTags.includes("latest")) {
    throw new PublishPreflightError("First version must include latest tag", 400);
  }
}
