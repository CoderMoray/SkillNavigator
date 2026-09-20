import { describe, expect, it } from "vitest";
import {
  hasPubliclyListedVersion,
  isSkillUnlisted,
  isUserDelisted,
  isVersionPubliclyListed,
  recomputeSkillPublishedFlag,
  resolveLatestApprovedVersion,
  resolvePublicSearchSortTimestamp,
  resolveSkillPublishedFlag,
  toIsoTimestampString,
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

  it("keeps skill listed when latest version is rejected but an older version is public", () => {
    const registry = skill({
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

    expect(resolveSkillPublishedFlag(registry)).toBe(true);
    expect(toSearchResult(registry).published).toBe(true);
    expect(toSearchResult(registry).latestVersion).toBe("1.0.0");
  });

  it("leaves brand-new skill unlisted when its only version is rejected", () => {
    const registry = skill({
      published: false,
      versions: {
        "1.0.0": version({
          version: "1.0.0",
          status: "rejected",
          published: false,
          inspectionStatus: "rejected",
        }),
      },
    });

    expect(resolveSkillPublishedFlag(registry)).toBe(false);
    expect(toSearchResult(registry).published).toBe(false);
  });

  it("honors owner unpublish even when a version row remains listable", () => {
    const registry = skill({
      published: false,
      versions: {
        "1.0.0": version({ version: "1.0.0", published: true, inspectionStatus: "completed" }),
      },
    });

    expect(resolveSkillPublishedFlag(registry)).toBe(false);
    expect(toSearchResult(registry).published).toBe(false);
  });

  it("treats legacy finalized version rows as publicly listed", () => {
    expect(
      isVersionPubliclyListed(
        version({
          version: "0.1.4",
          published: true,
          status: "published",
          inspectionStatus: "inspecting",
          inspectionEndedAt: "2026-09-20T06:38:59.680Z",
        })
      )
    ).toBe(true);
  });

  it("identifies owner delist separately from never-listed skills", () => {
    const delisted = skill({
      published: false,
      versions: { "1.0.0": version({ version: "1.0.0" }) },
    });
    const neverListed = skill({
      published: false,
      versions: {
        "1.0.0": version({ version: "1.0.0", published: false, inspectionStatus: "rejected", status: "rejected" }),
      },
    });

    expect(isUserDelisted(delisted)).toBe(true);
    expect(isUserDelisted(neverListed)).toBe(false);
  });

  it("falls back to skill updatedAt for sort when no public version exists", () => {
    const registry = skill({
      published: false,
      updatedAt: "2026-03-15T12:00:00.000Z",
      versions: {
        "1.0.0": version({
          version: "1.0.0",
          published: false,
          inspectionStatus: "rejected",
          status: "rejected",
        }),
      },
    });

    expect(resolvePublicSearchSortTimestamp(registry)).toBe("2026-03-15T12:00:00.000Z");
  });

  it("normalizes search result updatedAt to ISO", () => {
    const legacyUpdatedAt = "Sun Sep 20 2026 14:38:59 GMT+0800 (China Standard Time)";
    const registry = skill({ updatedAt: legacyUpdatedAt });

    expect(toSearchResult(registry).updatedAt).toBe(toIsoTimestampString(legacyUpdatedAt));
    expect(toSearchResult(registry).updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
  });
});
