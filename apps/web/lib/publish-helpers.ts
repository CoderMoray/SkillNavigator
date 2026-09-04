import type { RegistrySkill } from "./types";

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
