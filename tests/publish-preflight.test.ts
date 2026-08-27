import { describe, expect, it } from "vitest";
import { assertPublishPreflight, PublishPreflightError } from "../packages/storage/src/publish-preflight.js";
import type { RegistrySkill } from "../packages/storage/src/types.js";

function skill(overrides: Partial<RegistrySkill> = {}): RegistrySkill {
  return {
    slug: "demo-skill",
    name: "Demo",
    description: "Demo skill",
    latestVersion: "1.0.0",
    versions: {
      "1.0.0": {
        version: "1.0.0",
        manifest: { name: "Demo", description: "Demo skill" },
        contentHash: "hash",
        status: "published",
        releaseTags: ["latest"],
        downloads: 0,
        published: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    },
    contributors: [{ id: "c1", name: "owner", role: "owner", addedAt: "2026-01-01T00:00:00.000Z" }],
    issues: [],
    ratings: [],
    averageRating: 0,
    ratingCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("assertPublishPreflight", () => {
  it("allows first publish with latest tag", () => {
    expect(() =>
      assertPublishPreflight({
        slug: "new-skill",
        version: "1.0.0",
        releaseTags: ["latest"],
      })
    ).not.toThrow();
  });

  it("rejects first publish without latest tag", () => {
    expect(() =>
      assertPublishPreflight({
        slug: "new-skill",
        version: "1.0.0",
        releaseTags: ["beta"],
      })
    ).toThrow(PublishPreflightError);
  });

  it("rejects duplicate version", () => {
    expect(() =>
      assertPublishPreflight({
        slug: "demo-skill",
        version: "1.0.0",
        releaseTags: ["latest"],
        existingSkill: skill(),
      })
    ).toThrow(/Version already exists/);
  });

  it("rejects semver not greater than latest", () => {
    expect(() =>
      assertPublishPreflight({
        slug: "demo-skill",
        version: "1.5.0",
        releaseTags: ["latest"],
        existingSkill: skill({
          latestVersion: "2.0.0",
          versions: {
            "1.0.0": skill().versions["1.0.0"],
            "2.0.0": { ...skill().versions["1.0.0"], version: "2.0.0" },
          },
        }),
      })
    ).toThrow(/Version must be greater than latest/);
  });

  it("rejects skill in recycle bin", () => {
    expect(() =>
      assertPublishPreflight({
        slug: "demo-skill",
        version: "1.1.0",
        releaseTags: ["latest"],
        existingSkill: skill({ deletedAt: "2026-01-02T00:00:00.000Z" }),
      })
    ).toThrow(PublishPreflightError);
  });

  it("rejects non-contributor publishing new version", () => {
    try {
      assertPublishPreflight({
        slug: "demo-skill",
        version: "1.1.0",
        releaseTags: ["latest"],
        existingSkill: skill({ ownerUserId: "owner-id" }),
        user: { id: "other-id", username: "other" },
      });
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PublishPreflightError);
      expect((error as PublishPreflightError).statusCode).toBe(403);
    }
  });
});
