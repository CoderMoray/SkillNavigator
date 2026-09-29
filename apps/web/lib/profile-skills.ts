import type { SkillSearchResult } from "./types";

export type ProfileSkillSort = "recent" | "downloads" | "rating";

export const PROFILE_SKILL_SORT_OPTIONS: Array<{ value: ProfileSkillSort; label: string }> = [
  { value: "downloads", label: "下载量" },
  { value: "rating", label: "用户评分" },
  { value: "recent", label: "最近更新" }
];

function recentTimestamp(skill: SkillSearchResult): string {
  return skill.latestVersionCreatedAt ?? skill.updatedAt;
}

export function filterProfileSkills(skills: SkillSearchResult[], query: string): SkillSearchResult[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return skills;
  }

  return skills.filter(
    (skill) =>
      skill.name.toLowerCase().includes(normalized) ||
      skill.slug.toLowerCase().includes(normalized) ||
      skill.description.toLowerCase().includes(normalized)
  );
}

export function sortProfileSkills(skills: SkillSearchResult[], sort: ProfileSkillSort): SkillSearchResult[] {
  return [...skills].sort((a, b) => {
    switch (sort) {
      case "recent":
        return recentTimestamp(b).localeCompare(recentTimestamp(a));
      case "downloads":
        return b.downloads - a.downloads || recentTimestamp(b).localeCompare(recentTimestamp(a));
      case "rating":
        return (
          b.averageRating - a.averageRating ||
          b.ratingCount - a.ratingCount ||
          recentTimestamp(b).localeCompare(recentTimestamp(a))
        );
      default:
        return 0;
    }
  });
}

export function listProfileSkills(
  skills: SkillSearchResult[],
  query: string,
  sort: ProfileSkillSort
): SkillSearchResult[] {
  return sortProfileSkills(filterProfileSkills(skills, query), sort);
}
