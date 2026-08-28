import type { PublicUser } from "./auth";
import type { RegistryContributor, SkillSearchResult } from "./types";
import { sortSkillSearchResultsByRecent } from "./utils";

export interface CreatorSummary {
  name: string;
  handle: string;
  about: string | null;
  role: RegistryContributor["role"];
  published: number;
  downloads: number;
  ratingCount: number;
  averageRating: number;
  skills: SkillSearchResult[];
}

export function normalizeHandle(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

export function createEmptyCreatorSummary(username: string): CreatorSummary {
  const handle = normalizeHandle(username);
  return {
    name: username,
    handle,
    about: null,
    role: "contributor",
    published: 0,
    downloads: 0,
    ratingCount: 0,
    averageRating: 0,
    skills: []
  };
}

export function aggregateCreators(skills: SkillSearchResult[]): CreatorSummary[] {
  const creators = new Map<string, CreatorSummary>();

  for (const skill of skills) {
    const contributors = skill.contributors.length > 0 ? skill.contributors : [unknownContributor()];

    for (const contributor of contributors) {
      const handle = normalizeHandle(contributor.username ?? contributor.name);
      const existing = creators.get(handle);
      const summary =
        existing ??
        ({
          name: contributor.name,
          handle,
          about: null,
          role: contributor.role,
          published: 0,
          downloads: 0,
          ratingCount: 0,
          averageRating: 0,
          skills: []
        } satisfies CreatorSummary);

      summary.published += 1;
      summary.downloads += skill.downloads;
      summary.ratingCount += skill.ratingCount;
      summary.skills.push(skill);
      summary.averageRating = weightedAverage(summary.skills);
      creators.set(handle, summary);
    }
  }

  return [...creators.values()].sort((a, b) => b.downloads - a.downloads || b.published - a.published);
}

export function listCreators(skills: SkillSearchResult[], users: PublicUser[]): CreatorSummary[] {
  const byHandle = new Map(aggregateCreators(skills).map((creator) => [creator.handle, creator]));
  const userByHandle = new Map(users.map((user) => [normalizeHandle(user.username), user]));

  for (const user of users) {
    const handle = normalizeHandle(user.username);
    if (!byHandle.has(handle)) {
      byHandle.set(handle, createEmptyCreatorSummary(user.username));
    }
  }

  return [...byHandle.values()]
    .map((creator) => applyCreatorProfile(creator, userByHandle.get(creator.handle)))
    .sort(
      (a, b) => b.downloads - a.downloads || b.published - a.published || a.name.localeCompare(b.name)
    );
}

export function applyCreatorProfile(
  creator: CreatorSummary,
  user: Pick<PublicUser, "displayName" | "about"> | undefined
): CreatorSummary {
  if (!user) {
    return creator;
  }

  const displayName = user.displayName?.trim();
  const about = user.about?.trim();
  return {
    ...creator,
    name: displayName || creator.name,
    about: about || null
  };
}

function weightedAverage(skills: SkillSearchResult[]): number {
  const rated = skills.filter((skill) => skill.averageRating > 0 && skill.ratingCount > 0);
  const ratings = rated.reduce((total, skill) => total + skill.ratingCount, 0);
  if (ratings === 0) {
    return 0;
  }

  const score = rated.reduce((total, skill) => total + skill.averageRating * skill.ratingCount, 0);
  return Math.round((score / ratings) * 10) / 10;
}

/** Appends owner-only unpublished skills to a creator profile (does not change published count). */
export function mergeOwnerUnpublishedSkills(
  creator: CreatorSummary,
  unpublished: SkillSearchResult[]
): CreatorSummary {
  const existingSlugs = new Set(creator.skills.map((skill) => skill.slug));
  const extra = unpublished
    .filter((skill) => !existingSlugs.has(skill.slug))
    .map((skill) => ({ ...skill, published: false }));
  if (extra.length === 0) {
    return creator;
  }

  const skills = sortSkillSearchResultsByRecent([...creator.skills, ...extra]);
  return { ...creator, skills };
}

/** Appends owner-only rejected skills to a creator profile (does not change published count). */
export function mergeOwnerRejectedSkills(
  creator: CreatorSummary,
  rejected: SkillSearchResult[]
): CreatorSummary {
  const existingSlugs = new Set(creator.skills.map((skill) => skill.slug));
  const extra = rejected.filter((skill) => !existingSlugs.has(skill.slug));
  if (extra.length === 0) {
    return creator;
  }

  const skills = sortSkillSearchResultsByRecent([...creator.skills, ...extra]);
  return { ...creator, skills };
}

function unknownContributor(): RegistryContributor {
  return {
    id: "unknown",
    name: "unknown",
    role: "contributor",
    addedAt: new Date(0).toISOString()
  };
}
