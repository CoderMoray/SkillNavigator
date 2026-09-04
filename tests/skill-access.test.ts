import { describe, expect, it } from "vitest";
import {
  canAccessSkillDetail,
  canAccessUnpublishedVersion,
  isReviewPendingSkillStatus,
  type RegistrySkill,
} from "@skill-platform/storage";

function skill(overrides: Partial<RegistrySkill> & Pick<RegistrySkill, "slug">): RegistrySkill {
  return {
    name: overrides.slug,
    description: "",
    latestVersion: "1.0.0",
    reviewStatus: "completed",
    versions: {},
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

const owner = { id: "user_owner", username: "owner" };
const contributor = { id: "user_contrib", username: "contrib" };
const stranger = { id: "user_other", username: "other" };

describe("skill access helpers", () => {
  it("detects review pending statuses", () => {
    expect(isReviewPendingSkillStatus("reviewing")).toBe(true);
    expect(isReviewPendingSkillStatus("failed")).toBe(true);
    expect(isReviewPendingSkillStatus("completed")).toBe(false);
  });

  it("allows public access to published completed skills", () => {
    const published = skill({ slug: "demo", published: true, reviewStatus: "completed" });
    expect(canAccessSkillDetail(published, undefined)).toBe(true);
    expect(canAccessSkillDetail(published, stranger)).toBe(true);
  });

  it("allows owner and contributor to view reviewing or failed skills", () => {
    const reviewing = skill({
      slug: "pending",
      published: false,
      reviewStatus: "reviewing",
      ownerUserId: owner.id,
      contributors: [
        { id: "c1", name: "owner", username: "owner", role: "owner", userId: owner.id, addedAt: "2026-01-01T00:00:00.000Z" },
        { id: "c2", name: "contrib", username: "contrib", role: "contributor", userId: contributor.id, addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    });

    expect(canAccessSkillDetail(reviewing, undefined)).toBe(false);
    expect(canAccessSkillDetail(reviewing, stranger)).toBe(false);
    expect(canAccessSkillDetail(reviewing, owner)).toBe(true);
    expect(canAccessSkillDetail(reviewing, contributor)).toBe(true);
  });

  it("keeps manually unpublished skills owner-only", () => {
    const unpublished = skill({
      slug: "hidden",
      published: false,
      reviewStatus: "completed",
      ownerUserId: owner.id,
      contributors: [
        { id: "c1", name: "owner", username: "owner", role: "owner", userId: owner.id, addedAt: "2026-01-01T00:00:00.000Z" },
        { id: "c2", name: "contrib", username: "contrib", role: "contributor", userId: contributor.id, addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    });

    expect(canAccessSkillDetail(unpublished, contributor)).toBe(false);
    expect(canAccessSkillDetail(unpublished, owner)).toBe(true);
  });

  it("allows contributors to read unpublished versions during review", () => {
    const reviewing = skill({
      slug: "pending",
      published: false,
      reviewStatus: "failed",
      ownerUserId: owner.id,
      contributors: [
        { id: "c2", name: "contrib", username: "contrib", role: "contributor", userId: contributor.id, addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    });

    expect(canAccessUnpublishedVersion(reviewing, { published: false }, contributor)).toBe(true);
    expect(canAccessUnpublishedVersion(reviewing, { published: false }, stranger)).toBe(false);
  });
});
