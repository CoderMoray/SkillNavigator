import type {
  RegistrySkill,
  RegistryVersion,
  ReviewVerdict,
  SkillReviewFailureInfo,
  SkillReviewStage,
  SkillReviewStatus,
  SkillSearchResult,
} from "./types";

export type SkillRepublishBlockReason =
  | "review_in_progress"
  | "review_failed"
  | "review_rejected";

export function resolveVersionReviewStatus(
  version: Pick<RegistryVersion, "reviewStatus" | "version"> | undefined,
  skill: Pick<RegistrySkill, "reviewStatus" | "latestVersion">
): SkillReviewStatus {
  if (!version) {
    return skill.reviewStatus;
  }
  if (version.reviewStatus) {
    return version.reviewStatus;
  }
  if (version.version === skill.latestVersion) {
    return skill.reviewStatus;
  }
  return "completed";
}

export function resolveVersionReviewFailure(
  version: Pick<RegistryVersion, "reviewFailure" | "version"> | undefined,
  skill: Pick<RegistrySkill, "reviewFailure" | "latestVersion">
): SkillReviewFailureInfo | undefined {
  if (!version) {
    return skill.reviewFailure;
  }
  if (version.reviewFailure) {
    return version.reviewFailure;
  }
  if (version.version === skill.latestVersion) {
    return skill.reviewFailure;
  }
  return undefined;
}

export function resolveVersionReviewCompletedStages(
  version: Pick<RegistryVersion, "reviewCompletedStages" | "version"> | undefined,
  skill: Pick<RegistrySkill, "reviewCompletedStages" | "latestVersion">
): SkillReviewStage[] | undefined {
  if (!version) {
    return skill.reviewCompletedStages;
  }
  if (version.reviewCompletedStages?.length) {
    return version.reviewCompletedStages;
  }
  if (version.version === skill.latestVersion) {
    return skill.reviewCompletedStages;
  }
  return version.reviewCompletedStages;
}

export function getSkillRepublishBlockReason(
  skill: Pick<RegistrySkill, "reviewStatus" | "latestVersion" | "versions">
): SkillRepublishBlockReason | null {
  return getVersionRepublishBlockReason(skill, skill.latestVersion);
}

export function getVersionRepublishBlockReason(
  skill: Pick<RegistrySkill, "reviewStatus" | "latestVersion" | "versions">,
  version: string
): SkillRepublishBlockReason | null {
  const entry = skill.versions[version];
  if (!entry) {
    return null;
  }
  const reviewStatus = resolveVersionReviewStatus(entry, skill);
  if (reviewStatus === "reviewing") {
    return "review_in_progress";
  }
  if (reviewStatus === "failed") {
    return "review_failed";
  }
  if (entry.status === "rejected") {
    return "review_rejected";
  }
  return null;
}

export function isSkillUnlisted(
  skill: Pick<RegistrySkill, "published" | "reviewStatus" | "latestVersion" | "versions">
): boolean {
  if (skill.published === false) {
    return true;
  }
  return getSkillRepublishBlockReason(skill) !== null;
}

export function isSkillSearchResultUnlisted(
  skill: Pick<SkillSearchResult, "published" | "reviewStatus" | "status">
): boolean {
  if (skill.published === false) {
    return true;
  }
  if (skill.reviewStatus === "reviewing" || skill.reviewStatus === "failed") {
    return true;
  }
  if (skill.status === "rejected") {
    return true;
  }
  return false;
}

export function skillRepublishBlockedMessage(reason: SkillRepublishBlockReason): string {
  switch (reason) {
    case "review_rejected":
      return "该 Skill 在审查后被拒绝发布，无法直接上架。请修改内容后通过「发布新版本」重新提交审查。";
    case "review_failed":
      return "该 Skill 审查流程未完成或失败，无法直接上架。请使用「重新发布」或「重试失败环节」完成审查后再公开。";
    case "review_in_progress":
      return "该 Skill 仍在审查中，请等待审查完成后再尝试上架。";
  }
}

export function skillUnlistedNotice(
  skill: Pick<RegistrySkill, "published" | "reviewStatus" | "latestVersion" | "versions">
): { title: string; description: string } {
  const blockReason = getSkillRepublishBlockReason(skill);
  if (blockReason === "review_rejected") {
    return {
      title: "此 Skill 已下架（审查未通过）",
      description:
        "该版本未通过审查，已被拒绝发布，不会出现在 Skill 广场与搜索页。请修改内容后发布新版本并重新提交审查。",
    };
  }
  if (blockReason === "review_failed") {
    return {
      title: "此 Skill 已下架（审查失败）",
      description:
        "审查流程未完成或中断，当前不会公开。请使用「重新发布」或「重试失败环节」完成审查；若包已丢失，请重新上传。",
    };
  }
  if (blockReason === "review_in_progress") {
    return {
      title: "此 Skill 尚未公开（审查中）",
      description: "审查完成后，通过审查的版本才会出现在 Skill 广场与搜索页。",
    };
  }
  return {
    title: "此 Skill 已下架",
    description: "仅你可见，不会出现在 Skill 广场与搜索页。可直接上架恢复公开，或发布新版本后再上架。",
  };
}

export function resolveSkillDisplayVerdict(
  reviewStatus: SkillReviewStatus,
  versionStatus: ReviewVerdict,
  versionPublished?: boolean
): ReviewVerdict {
  if (reviewStatus === "failed") {
    return "rejected";
  }
  if (reviewStatus === "reviewing") {
    return versionStatus === "rejected" ? "rejected" : "needs-review";
  }
  if (versionStatus === "published" && versionPublished === false) {
    return "needs-review";
  }
  return versionStatus;
}

export function resolveVersionDisplayVerdict(
  skill: Pick<RegistrySkill, "reviewStatus" | "latestVersion">,
  version: Pick<RegistryVersion, "version" | "status" | "published" | "reviewStatus">
): ReviewVerdict {
  const reviewStatus = resolveVersionReviewStatus(version, skill);
  return resolveSkillDisplayVerdict(reviewStatus, version.status, version.published);
}

export function hasStoredPendingPackage(
  skill: RegistrySkill,
  version: string = skill.latestVersion,
  hasStoredPackage?: boolean
): boolean {
  if (hasStoredPackage === true) {
    return true;
  }
  if (hasStoredPackage === false) {
    return false;
  }

  const entry = skill.versions[version];
  if (!entry || entry.published !== false) {
    return false;
  }
  return (entry.snapshot?.files?.length ?? 0) > 0;
}

export function canRetryStoredReview(
  skill: RegistrySkill,
  version: string = skill.latestVersion,
  hasStoredPackage?: boolean
): boolean {
  if (version !== skill.latestVersion) {
    return false;
  }
  const entry = skill.versions[version];
  return (
    resolveVersionReviewStatus(entry, skill) === "failed" &&
    hasStoredPendingPackage(skill, version, hasStoredPackage)
  );
}

/** Failed review may be re-uploaded with the same version when no stored package exists yet. */
export function canRepublishFailedVersion(skill: RegistrySkill, version: string): boolean {
  const entry = skill.versions[version];
  if (!entry || resolveVersionReviewStatus(entry, skill) !== "failed") {
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
