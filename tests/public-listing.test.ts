import { describe, expect, it } from "vitest";
import {
  hasPubliclyListedVersion,
  isSkillUnlisted,
  isVersionPubliclyListed,
  recomputeSkillPublishedFlag,
  resolveLatestApprovedVersion,
  resolvePublicSearchSortTimestamp,
  toSearchResult,
} from "../packages/storage/src/utils.js";
import type { RegistrySkill, RegistryVersion } from "../packages/storage/src/types.js";

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

function skill(overrides: Partial<RegistrySkill> = {}): RegistrySkill {
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

describe("public listing helpers", () => {
  it("treats only completed non-rejected published versions as public", () => {
    expect(
      isVersionPubliclyListed(
        version({ version: "1.0.0", published: true, inspectionStatus: "completed", status: "published" })
      )
    ).toBe(true);
    expect(
      isVersionPubliclyListed(
        version({ version: "1.0.0", published: false, inspectionStatus: "completed", status: "published" })
      )
    ).toBe(false);
    expect(
      isVersionPubliclyListed(
        version({ version: "1.0.0", published: true, inspectionStatus: "interrupted", status: "published" })
      )
    ).toBe(false);
  });

  it("keeps skill searchable while latest version is reviewing", () => {
    const registry = skill({
      latestVersion: "1.1.0",
      inspectionStatus: "inspecting",
      published: false,
      versions: {
        "1.0.0": version({ version: "1.0.0", published: true, inspectionStatus: "completed" }),
        "1.1.0": version({
          version: "1.1.0",
          published: false,
          inspectionStatus: "inspecting",
          status: "needs-inspection",
        }),
      },
    });

    expect(hasPubliclyListedVersion(registry)).toBe(true);
    expect(recomputeSkillPublishedFlag(registry)).toBe(true);
    expect(isSkillUnlisted(registry)).toBe(false);
    expect(resolveLatestApprovedVersion(registry)).toBe("1.0.0");
  });

  it("search facade uses latest publicly listed version metadata", () => {
    const registry = skill({
      latestVersion: "1.1.0",
      inspectionStatus: "inspecting",
      published: true,
      versions: {
        "1.0.0": version({ version: "1.0.0", published: true, inspectionStatus: "completed" }),
        "1.1.0": version({
          version: "1.1.0",
          published: false,
          inspectionStatus: "inspecting",
          status: "needs-inspection",
        }),
      },
    });

    const row = toSearchResult(registry);
    expect(row.latestVersion).toBe("1.0.0");
    expect(row.inspectionStatus).toBe("completed");
    expect(row.published).toBe(true);
    expect(row.status).toBe("published");
  });

  it("sorts public search by latest publicly listed version publish time", () => {
    const registry = skill({
      latestVersion: "1.1.0",
      inspectionStatus: "completed",
      published: true,
      versions: {
        "1.0.0": version({
          version: "1.0.0",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
        "1.1.0": version({
          version: "1.1.0",
          createdAt: "2026-02-01T00:00:00.000Z",
          updatedAt: "2026-02-01T00:00:00.000Z",
          inspectionEndedAt: "2026-09-20T10:00:00.000Z",
          inspectionStatus: "inspecting",
        }),
      },
    });

    expect(resolveLatestApprovedVersion(registry)).toBe("1.1.0");
    expect(resolvePublicSearchSortTimestamp(registry)).toBe("2026-09-20T10:00:00.000Z");
    expect(toSearchResult(registry).latestVersionCreatedAt).toBe("2026-09-20T10:00:00.000Z");
  });
});
