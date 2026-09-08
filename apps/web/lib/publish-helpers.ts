import type {
  RegistrySkill,
  RegistryVersion,
  InspectionVerdict,
  SkillInspectionFailureInfo,
  SkillInspectionStage,
  SkillInspectionStatus,
  SkillSearchResult,
} from "./types";

export type SkillRepublishBlockReason =
  | "inspection_in_progress"
  | "inspection_failed"
  | "inspection_rejected";

export function normalizeSkillInspectionStatus(
  status: SkillInspectionStatus | "failed" | undefined
): SkillInspectionStatus {
  if (status === "failed") {
    return "interrupted";
  }
  if (status === "inspecting" || status === "completed" || status === "interrupted" || status === "rejected") {
    return status;
  }
  return "completed";
}

export function isInspectionFailureStatus(
  status: SkillInspectionStatus | "failed" | undefined
): status is "interrupted" | "rejected" {
  const normalized = normalizeSkillInspectionStatus(status);
  return normalized === "interrupted" || normalized === "rejected";
}

export function resolveVersionInspectionStatus(
  version: Pick<RegistryVersion, "inspectionStatus" | "version"> | undefined,
  skill: Pick<RegistrySkill, "inspectionStatus" | "latestVersion">
): SkillInspectionStatus {
  if (!version) {
    return normalizeSkillInspectionStatus(skill.inspectionStatus);
  }
  if (version.inspectionStatus) {
    return normalizeSkillInspectionStatus(version.inspectionStatus);
  }
  if (version.version === skill.latestVersion) {
    return normalizeSkillInspectionStatus(skill.inspectionStatus);
  }
  return "completed";
}

export function resolveVersionInspectionFailure(
  version: Pick<RegistryVersion, "inspectionFailure" | "version"> | undefined,
  skill: Pick<RegistrySkill, "inspectionFailure" | "latestVersion">
): SkillInspectionFailureInfo | undefined {
  if (!version) {
    return skill.inspectionFailure;
  }
  if (version.inspectionFailure) {
    return version.inspectionFailure;
  }
  if (version.version === skill.latestVersion) {
    return skill.inspectionFailure;
  }
  return undefined;
}

export function resolveVersionInspectionCompletedStages(
  version: Pick<RegistryVersion, "inspectionCompletedStages" | "version"> | undefined,
  skill: Pick<RegistrySkill, "inspectionCompletedStages" | "latestVersion">
): SkillInspectionStage[] | undefined {
  if (!version) {
    return skill.inspectionCompletedStages;
  }
  if (version.inspectionCompletedStages?.length) {
    return version.inspectionCompletedStages;
  }
  if (version.version === skill.latestVersion) {
    return skill.inspectionCompletedStages;
  }
  return version.inspectionCompletedStages;
}

export function getSkillRepublishBlockReason(
  skill: Pick<RegistrySkill, "inspectionStatus" | "latestVersion" | "versions">
): SkillRepublishBlockReason | null {
  return getVersionRepublishBlockReason(skill, skill.latestVersion);
}

export function getVersionRepublishBlockReason(
  skill: Pick<RegistrySkill, "inspectionStatus" | "latestVersion" | "versions">,
  version: string
): SkillRepublishBlockReason | null {
  const entry = skill.versions[version];
  if (!entry) {
    return null;
  }
  const inspectionStatus = resolveVersionInspectionStatus(entry, skill);
  if (inspectionStatus === "inspecting") {
    return "inspection_in_progress";
  }
  if (inspectionStatus === "interrupted") {
    return "inspection_failed";
  }
  if (inspectionStatus === "rejected") {
    return "inspection_rejected";
  }
  return null;
}

export function isSkillUnlisted(
  skill: Pick<RegistrySkill, "published" | "inspectionStatus" | "latestVersion" | "versions">
): boolean {
  if (skill.published === false) {
    return true;
  }
  return getSkillRepublishBlockReason(skill) !== null;
}

export function isSkillSearchResultUnlisted(
  skill: Pick<SkillSearchResult, "published" | "inspectionStatus" | "status">
): boolean {
  if (skill.published === false) {
    return true;
  }
  if (skill.inspectionStatus === "inspecting" || isInspectionFailureStatus(skill.inspectionStatus)) {
    return true;
  }
  if (skill.status === "rejected") {
    return true;
  }
  return false;
}

export function skillRepublishBlockedMessage(reason: SkillRepublishBlockReason): string {
  switch (reason) {
    case "inspection_rejected":
      return "该 Skill 在审查后被拒绝发布，无法直接上架。请修改内容后通过「发布新版本」重新提交审查。";
    case "inspection_failed":
      return "该 Skill 审查流程未完成或失败，无法直接上架。请使用「重新发布」或「重试失败环节」完成审查后再公开。";
    case "inspection_in_progress":
      return "该 Skill 仍在审查中，请等待审查完成后再尝试上架。";
  }
}

export function skillUnlistedNotice(
  skill: Pick<RegistrySkill, "published" | "inspectionStatus" | "latestVersion" | "versions">
): { title: string; description: string } {
  const blockReason = getSkillRepublishBlockReason(skill);
  if (blockReason === "inspection_rejected") {
    return {
      title: "此 Skill 已下架（审查未通过）",
      description:
        "该版本未通过审查，已被拒绝发布，不会出现在 Skill 广场与搜索页。请修改内容后发布新版本并重新提交审查。",
    };
  }
  if (blockReason === "inspection_failed") {
    return {
      title: "此 Skill 已下架（审查失败）",
      description:
        "审查流程未完成或中断，当前不会公开。请使用「重新发布」或「重试失败环节」完成审查；若包已丢失，请重新上传。",
    };
  }
  if (blockReason === "inspection_in_progress") {
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

export function resolveVersionDisplayVerdict(
  skill: Pick<RegistrySkill, "inspectionStatus" | "latestVersion">,
  version: Pick<RegistryVersion, "version" | "status" | "published" | "inspectionStatus">
): InspectionVerdict {
  const inspectionStatus = resolveVersionInspectionStatus(version, skill);
  return resolveSkillDisplayVerdict(inspectionStatus, version.status, version.published);
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

export function canRetryStoredInspection(
  skill: RegistrySkill,
  version: string = skill.latestVersion,
  hasStoredPackage?: boolean
): boolean {
  if (version !== skill.latestVersion) {
    return false;
  }
  const entry = skill.versions[version];
  return (
    isInspectionFailureStatus(resolveVersionInspectionStatus(entry, skill)) &&
    hasStoredPendingPackage(skill, version, hasStoredPackage)
  );
}

/** Failed inspection may be re-uploaded with the same version when no stored package exists yet. */
export function canRepublishFailedVersion(skill: RegistrySkill, version: string): boolean {
  const entry = skill.versions[version];
  if (!entry || !isInspectionFailureStatus(resolveVersionInspectionStatus(entry, skill))) {
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
