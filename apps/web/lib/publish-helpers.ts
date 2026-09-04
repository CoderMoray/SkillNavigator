import type { RegistrySkill, ReviewVerdict, SkillReviewStatus, SkillSearchResult } from "./types";

export type SkillRepublishBlockReason =
  | "review_in_progress"
  | "review_failed"
  | "review_rejected";

export function getSkillRepublishBlockReason(
  skill: Pick<RegistrySkill, "reviewStatus" | "latestVersion" | "versions">
): SkillRepublishBlockReason | null {
  if (skill.reviewStatus === "reviewing") {
    return "review_in_progress";
  }
  if (skill.reviewStatus === "failed") {
    return "review_failed";
  }
  const latest = skill.versions[skill.latestVersion];
  if (latest?.status === "rejected") {
    return "review_rejected";
  }
  return null;
}

export function getVersionRepublishBlockReason(
  skill: Pick<RegistrySkill, "reviewStatus" | "latestVersion" | "versions">,
  version: string
): SkillRepublishBlockReason | null {
  const entry = skill.versions[version];
  if (entry?.status === "rejected") {
    return "review_rejected";
  }
  if (version === skill.latestVersion) {
    return getSkillRepublishBlockReason(skill);
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
  version: { version: string; status: ReviewVerdict; published?: boolean }
): ReviewVerdict {
  if (version.version === skill.latestVersion) {
    return resolveSkillDisplayVerdict(skill.reviewStatus, version.status, version.published);
  }
  if (version.status === "published" && version.published === false) {
    return "needs-review";
  }
  return version.status;
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
  hasStoredPackage?: boolean
): boolean {
  return (
    skill.reviewStatus === "failed" &&
    hasStoredPendingPackage(skill, skill.latestVersion, hasStoredPackage)
  );
}

/** Failed review may be re-uploaded with the same version when no stored package exists yet. */
export function canRepublishFailedVersion(skill: RegistrySkill, version: string): boolean {
  if (skill.reviewStatus !== "failed" || version !== skill.latestVersion) {
    return false;
  }
  if (hasStoredPendingPackage(skill, version)) {
    return false;
  }

  const pending = skill.versions[version];
  if (pending) {
    return pending.published === false;
  }

  return !Object.values(skill.versions).some((entry) => entry.published);
}
