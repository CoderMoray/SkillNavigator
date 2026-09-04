import { describe, expect, test } from "vitest";
import {
  createEmptyCreatorSummary,
  mergeOwnerRejectedSkills,
  mergeOwnerUnpublishedSkills,
  type CreatorSummary
} from "@skill-platform/storage";
import type { SkillSearchResult } from "@skill-platform/storage";

function skill(overrides: Partial<SkillSearchResult> & Pick<SkillSearchResult, "slug">): SkillSearchResult {
  return {
    name: overrides.slug,
    description: "",
    reviewStatus: "completed",
    latestVersion: "1.0.0",
    status: "published",
    scores: { qualityScore: 0, securityScore: 0, reliabilityScore: 0 },
    categories: [],
    averageRating: 0,
    ratingCount: 0,
    openIssues: 0,
    contributors: [],
    downloads: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
    published: true,
    ...overrides
  };
}

describe("owner profile skill merges", () => {
  test("mergeOwnerRejectedSkills appends rejected skills without duplicating slugs", () => {
    const creator: CreatorSummary = {
      ...createEmptyCreatorSummary("alice"),
      published: 1,
      skills: [skill({ slug: "visible-skill", status: "published" })]
    };

    const merged = mergeOwnerRejectedSkills(creator, [
      skill({ slug: "rejected-skill", status: "rejected", updatedAt: "2026-02-01T00:00:00.000Z" }),
      skill({ slug: "visible-skill", status: "rejected" })
    ]);

    expect(merged.skills.map((item) => item.slug)).toEqual(["rejected-skill", "visible-skill"]);
    expect(merged.published).toBe(1);
  });

  test("mergeOwnerUnpublishedSkills and mergeOwnerRejectedSkills compose for owner-only lists", () => {
    const creator = createEmptyCreatorSummary("alice");
    const withUnpublished = mergeOwnerUnpublishedSkills(creator, [
      skill({ slug: "draft", published: false, status: "needs-review" })
    ]);
    const withRejected = mergeOwnerRejectedSkills(withUnpublished, [
      skill({ slug: "blocked", status: "rejected", updatedAt: "2026-03-01T00:00:00.000Z" })
    ]);

    expect(withRejected.skills.map((item) => item.slug)).toEqual(["blocked", "draft"]);
  });
});
