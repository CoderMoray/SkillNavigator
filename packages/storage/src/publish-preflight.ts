import { compareSemver } from "@skill-platform/skill-spec/skill-format";
import type { RegistrySkill } from "./types.js";
import { isSkillContributor } from "./utils.js";

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
}

export function assertPublishPreflight(input: PublishPreflightInput): void {
  const { slug, version, releaseTags, existingSkill, user } = input;

  if (existingSkill?.deletedAt) {
    throw new PublishPreflightError("skill_in_recycle_bin", 409);
  }

  if (existingSkill && user && !isSkillContributor(existingSkill, user)) {
    throw new PublishPreflightError("Only skill contributors can publish new versions", 403);
  }

  if (existingSkill?.versions[version]) {
    throw new PublishPreflightError(`Version already exists: ${slug}@${version}`, 409);
  }

  if (existingSkill) {
    const compared = compareSemver(version, existingSkill.latestVersion);
    if (compared !== null && compared <= 0) {
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
