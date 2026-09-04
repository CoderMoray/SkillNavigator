import { describe, expect, it } from "vitest";
import { resolveLatestApprovedVersion, resolveVersionReference } from "@skill-platform/storage";
import type { RegistrySkill, RegistryVersion } from "@skill-platform/storage";

function version(overrides: Partial<RegistryVersion> & Pick<RegistryVersion, "version" | "status">): RegistryVersion {
  return {
    version: overrides.version,
    status: overrides.status,
    manifest: {
      slug: "demo-skill",
      name: "Demo",
      description: "Demo",
      tags: [],
      categories: [],
      topics: [],
    },
    readme: "",
    files: [],
    contentHash: "hash",
    review: {
      id: "review_1",
      version: "1.0",
      contentHash: "hash",
      verdict: overrides.status,
      scores: { qualityScore: 80, securityScore: 80, reliabilityScore: 80 },
      findings: [],
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    evaluation: {
      id: "eval_1",
      version: "1.0",
      contentHash: "hash",
      score: 80,
      tasks: [],
      findings: [],
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    releaseTags: [],
    downloads: 0,
    published: true,
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function skill(versions: Record<string, RegistryVersion>, latestVersion: string): RegistrySkill {
  return {
    slug: "demo-skill",
    name: "Demo",
    description: "Demo",
    latestVersion,
    reviewStatus: "completed",
    versions,
    contributors: [],
    issues: [],
    ratings: [],
    averageRating: 0,
    ratingCount: 0,
    published: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("resolveLatestApprovedVersion", () => {
  it("returns the highest semver among non-rejected versions", () => {
    const registry = skill(
      {
        "1.0.0": version({ version: "1.0.0", status: "published", createdAt: "2026-01-01T00:00:00.000Z" }),
        "1.1.0": version({ version: "1.1.0", status: "rejected", createdAt: "2026-02-01T00:00:00.000Z" }),
        "1.0.1": version({ version: "1.0.1", status: "needs-review", createdAt: "2026-01-15T00:00:00.000Z" }),
      },
      "1.1.0"
    );

    expect(resolveLatestApprovedVersion(registry)).toBe("1.0.1");
    expect(resolveVersionReference(registry, "latest")).toBe("1.0.1");
  });

  it("falls back to latestVersion when every version is rejected", () => {
    const registry = skill(
      {
        "1.0.0": version({ version: "1.0.0", status: "rejected" }),
      },
      "1.0.0"
    );

    expect(resolveLatestApprovedVersion(registry)).toBeUndefined();
    expect(resolveVersionReference(registry, "latest")).toBe("1.0.0");
  });

  it("keeps explicit version references unchanged", () => {
    const registry = skill(
      {
        "1.0.0": version({ version: "1.0.0", status: "published" }),
        "2.0.0": version({ version: "2.0.0", status: "rejected" }),
      },
      "2.0.0"
    );

    expect(resolveVersionReference(registry, "2.0.0")).toBe("2.0.0");
  });
});
