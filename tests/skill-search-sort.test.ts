import { describe, expect, test } from "vitest";
import {
  compareIsoTimestampsDesc,
  getRecentSortTimestamp,
  sortSkillSearchResultsByRecent,
  toIsoTimestampString,
} from "@skill-platform/storage";
import type { SkillSearchResult } from "@skill-platform/storage";

function skill(overrides: Partial<SkillSearchResult> & Pick<SkillSearchResult, "slug">): SkillSearchResult {
  return {
    name: overrides.slug,
    description: "",
    inspectionStatus: "completed",
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
    ...overrides
  };
}

describe("skill search recent sort helpers", () => {
  test("toIsoTimestampString normalizes Date values for lexicographic sort", () => {
    const newer = new Date("2026-08-11T10:00:00.000Z");
    const older = new Date("2026-01-01T00:00:00.000Z");

    expect(toIsoTimestampString(newer).startsWith("2026-08-11")).toBe(true);
    expect(compareIsoTimestampsDesc(toIsoTimestampString(newer), toIsoTimestampString(older))).toBeLessThan(0);
    expect(compareIsoTimestampsDesc(toIsoTimestampString(older), toIsoTimestampString(newer))).toBeGreaterThan(0);
  });

  test("String(Date) is not used for ordering (regression guard)", () => {
    const monday = new Date("2026-08-10T10:00:00.000Z");
    const wednesday = new Date("2026-08-12T10:00:00.000Z");
    expect(String(monday).localeCompare(String(wednesday))).not.toBe(
      compareIsoTimestampsDesc(toIsoTimestampString(monday), toIsoTimestampString(wednesday))
    );
  });

  test("recent sort prefers latestVersionCreatedAt over skill updatedAt", () => {
    const items = sortSkillSearchResultsByRecent([
      skill({
        slug: "stale-skill-updated-recently",
        updatedAt: "2026-08-11T12:00:00.000Z",
        latestVersionCreatedAt: "2026-01-01T00:00:00.000Z"
      }),
      skill({
        slug: "new-release",
        updatedAt: "2026-01-01T00:00:00.000Z",
        latestVersionCreatedAt: "2026-08-11T08:00:00.000Z"
      })
    ]);

    expect(items.map((item) => item.slug)).toEqual(["new-release", "stale-skill-updated-recently"]);
    expect(getRecentSortTimestamp(items[0]!)).toBe("2026-08-11T08:00:00.000Z");
  });
});
