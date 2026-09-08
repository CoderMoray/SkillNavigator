import { describe, expect, it } from "vitest";
import {
  assertSkillRepublishAllowed,
  assertSkillVersionRepublishAllowed,
  canRetryVersionReview,
  getSkillRepublishBlockReason,
  isSkillUnlisted,
} from "../packages/storage/src/utils.js";
import type { RegistrySkill, RegistryVersion } from "../packages/storage/src/types.js";

function version(overrides: Partial<RegistryVersion> = {}): RegistryVersion {
  return {
    version: "1.0.0",
    manifest: { slug: "demo", name: "Demo", description: "Demo" },
    contentHash: "hash",
    status: "published",
    releaseTags: ["latest"],
    downloads: 0,
    published: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    inspection: {
      id: "inspection_1",
      version: "1.0.0",
      contentHash: "hash",
      verdict: "published",
      scores: { qualityScore: 1, securityScore: 1, reliabilityScore: 1 },
      findings: [],
      createdAt: "2026-01-01T00:00:00.000Z",
    },
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
    versions: {
      "1.0.0": version(),
    },
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

describe("skill republish policy", () => {
  it("treats review-rejected latest version as unlisted", () => {
    const rejected = skill({
      published: true,
      versions: {
        "1.0.0": version({ status: "rejected", inspection: { ...version().inspection!, verdict: "rejected" } }),
      },
    });

    expect(isSkillUnlisted(rejected)).toBe(true);
    expect(getSkillRepublishBlockReason(rejected)).toBe("inspection_rejected");
    expect(() => assertSkillRepublishAllowed(rejected)).toThrow("skill_republish_blocked_inspection_rejected");
  });

  it("treats failed review as unlisted and blocks republish", () => {
    const failed = skill({
      inspectionStatus: "failed",
      published: false,
      versions: {
        "1.0.0": version({ inspectionStatus: "failed", published: false }),
      },
    });
    expect(isSkillUnlisted(failed)).toBe(true);
    expect(() => assertSkillRepublishAllowed(failed)).toThrow("skill_republish_blocked_inspection_failed");
  });

  it("allows republish for manually unpublished completed skills", () => {
    const unpublished = skill({ published: false });
    expect(isSkillUnlisted(unpublished)).toBe(true);
    expect(getSkillRepublishBlockReason(unpublished)).toBeNull();
    expect(() => assertSkillRepublishAllowed(unpublished)).not.toThrow();
  });

  it("only allows retry review on latest failed version", () => {
    const multiVersion = skill({
      latestVersion: "1.1.0",
      inspectionStatus: "failed",
      published: false,
      versions: {
        "1.0.0": version({ version: "1.0.0", inspectionStatus: "failed", published: false }),
        "1.1.0": version({ version: "1.1.0", inspectionStatus: "failed", published: false }),
      },
    });

    expect(canRetryVersionReview(multiVersion, "1.1.0")).toBe(true);
    expect(canRetryVersionReview(multiVersion, "1.0.0")).toBe(false);
  });

  it("blocks republish for rejected version rows", () => {
    const rejectedVersion = skill({
      versions: {
        "1.0.0": version({ version: "1.0.0", status: "rejected" }),
        "0.9.0": version({ version: "0.9.0", status: "published", releaseTags: [] }),
      },
      latestVersion: "1.0.0",
    });

    expect(() => assertSkillVersionRepublishAllowed(rejectedVersion, "1.0.0")).toThrow(
      "skill_republish_blocked_inspection_rejected"
    );
    expect(() => assertSkillVersionRepublishAllowed(rejectedVersion, "0.9.0")).not.toThrow();
  });
});
