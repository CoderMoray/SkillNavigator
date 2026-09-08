import { describe, expect, it } from "vitest";
import { listProfileSkills } from "../apps/web/lib/profile-skills";
import type { SkillSearchResult } from "../apps/web/lib/types";

function skill(overrides: Partial<SkillSearchResult> & Pick<SkillSearchResult, "slug" | "name">): SkillSearchResult {
  return {
    description: overrides.description ?? overrides.name,
    inspectionStatus: "completed",
    latestVersion: "1.0.0",
    status: "published",
    scores: { qualityScore: 80, securityScore: 80, reliabilityScore: 80 },
    categories: [],
    averageRating: 0,
    ratingCount: 0,
    openIssues: 0,
    contributors: [],
    downloads: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

describe("listProfileSkills", () => {
  const items = [
    skill({
      slug: "alpha",
      name: "Alpha Tool",
      downloads: 10,
      averageRating: 4.5,
      ratingCount: 2,
      latestVersionCreatedAt: "2026-03-01T00:00:00.000Z"
    }),
    skill({
      slug: "beta-search",
      name: "Beta Search",
      description: "Find things fast",
      downloads: 100,
      averageRating: 3.0,
      ratingCount: 5,
      latestVersionCreatedAt: "2026-02-01T00:00:00.000Z"
    }),
    skill({
      slug: "gamma",
      name: "Gamma",
      downloads: 50,
      averageRating: 4.8,
      ratingCount: 10,
      latestVersionCreatedAt: "2026-01-01T00:00:00.000Z"
    })
  ];

  it("filters by name, slug, and description", () => {
    expect(listProfileSkills(items, "search", "recent").map((item) => item.slug)).toEqual(["beta-search"]);
    expect(listProfileSkills(items, "gamma", "recent").map((item) => item.slug)).toEqual(["gamma"]);
  });

  it("sorts by recent, downloads, and rating", () => {
    expect(listProfileSkills(items, "", "recent").map((item) => item.slug)).toEqual(["alpha", "beta-search", "gamma"]);
    expect(listProfileSkills(items, "", "downloads").map((item) => item.slug)).toEqual(["beta-search", "gamma", "alpha"]);
    expect(listProfileSkills(items, "", "rating").map((item) => item.slug)).toEqual(["gamma", "alpha", "beta-search"]);
  });
});
