import { describe, expect, it } from "vitest";
import {
  hasPubliclyListedVersion,
  isSkillSearchResultUnlisted,
  isSkillUnlisted,
} from "../apps/web/lib/publish-helpers.js";
import type { RegistrySkill, RegistryVersion, SkillSearchResult } from "../apps/web/lib/types.js";

function version(overrides: Partial<RegistryVersion> & Pick<RegistryVersion, "version">): RegistryVersion {
  return {
    manifest: { slug: "demo", name: "Demo", description: "Demo" },
    contentHash: "hash",
    status: "published",
    releaseTags: ["latest"],
    downloads: 0,
    published: true,
    inspectionStatus: "completed",
    inspection: {
      id: "inspection_1",
      version: overrides.version,
      contentHash: "hash",
      verdict: "published",
      scores: { qualityScore: 1, securityScore: 1, reliabilityScore: 1 },
      findings: [],
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function registrySkill(overrides: Partial<RegistrySkill> = {}): RegistrySkill {
  return {
    slug: "demo-skill",
    name: "Demo",
    description: "Demo skill",
    latestVersion: "1.0.0",
    inspectionStatus: "completed",
    versions: { "1.0.0": version({ version: "1.0.0" }) },
    contributors: [],
    issues: [],
    ratings: [],
    averageRating: 0,
    ratingCount: 0,
    published: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function searchRow(overrides: Partial<SkillSearchResult> & Pick<SkillSearchResult, "slug">): SkillSearchResult {
  return {
    name: overrides.slug,
    description: "",
    latestVersion: "1.0.0",
    inspectionStatus: "completed",
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
    ...overrides,
  };
}

describe("web publish-helpers listing", () => {
  it("does not treat in-review search rows as unlisted when published is true", () => {
    const row = searchRow({
      slug: "demo-skill",
      inspectionStatus: "inspecting",
      published: true,
      status: "published",
    });

    expect(isSkillSearchResultUnlisted(row)).toBe(false);
  });

  it("marks search rows unlisted only for published false or rejected display status", () => {
    expect(isSkillSearchResultUnlisted(searchRow({ slug: "a", published: false }))).toBe(true);
    expect(isSkillSearchResultUnlisted(searchRow({ slug: "b", status: "rejected" }))).toBe(true);
    expect(
      isSkillSearchResultUnlisted(
        searchRow({ slug: "c", inspectionStatus: "interrupted", published: true, status: "published" })
      )
    ).toBe(false);
  });

  it("matches storage listing rules for owner delist and multi-version reject", () => {
    const ownerDelisted = registrySkill({
      published: false,
      ownerUnlisted: true,
      versions: {
        "1.0.0": version({ version: "1.0.0", published: true, inspectionStatus: "completed" }),
      },
    });
    expect(hasPubliclyListedVersion(ownerDelisted)).toBe(true);
    expect(isSkillUnlisted(ownerDelisted)).toBe(true);

    const latestRejected = registrySkill({
      latestVersion: "1.1.0",
      published: true,
      versions: {
        "1.0.0": version({ version: "1.0.0", published: true, inspectionStatus: "completed" }),
        "1.1.0": version({
          version: "1.1.0",
          status: "rejected",
          published: false,
          inspectionStatus: "rejected",
        }),
      },
    });
    expect(isSkillUnlisted(latestRejected)).toBe(false);
  });
});
