import { describe, expect, it } from "vitest";
import {
  canAccessSkillDetail,
  canAccessUnpublishedVersion,
  isInspectionPendingSkillStatus,
  type RegistrySkill,
} from "@skill-platform/storage";

function skill(overrides: Partial<RegistrySkill> & Pick<RegistrySkill, "slug">): RegistrySkill {
  return {
    name: overrides.slug,
    description: "",
    latestVersion: "1.0.0",
    inspectionStatus: "completed",
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
    expect(isInspectionPendingSkillStatus("inspecting")).toBe(true);
    expect(isInspectionPendingSkillStatus("interrupted")).toBe(true);
    expect(isInspectionPendingSkillStatus("rejected")).toBe(true);
    expect(isInspectionPendingSkillStatus("completed")).toBe(false);
  });

  it("allows public access to published completed skills", () => {
    const published = skill({ slug: "demo", published: true, inspectionStatus: "completed" });
    expect(canAccessSkillDetail(published, undefined)).toBe(true);
    expect(canAccessSkillDetail(published, stranger)).toBe(true);
  });

  it("allows owner and contributor to view inspecting or failed skills", () => {
    const inspecting = skill({
      slug: "pending",
      published: false,
      inspectionStatus: "inspecting",
      ownerUserId: owner.id,
      contributors: [
        { id: "c1", name: "owner", username: "owner", role: "owner", userId: owner.id, addedAt: "2026-01-01T00:00:00.000Z" },
        { id: "c2", name: "contrib", username: "contrib", role: "contributor", userId: contributor.id, addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    });

    expect(canAccessSkillDetail(inspecting, undefined)).toBe(false);
    expect(canAccessSkillDetail(inspecting, stranger)).toBe(false);
    expect(canAccessSkillDetail(inspecting, owner)).toBe(true);
    expect(canAccessSkillDetail(inspecting, contributor)).toBe(true);
  });

  it("keeps manually unpublished skills owner-only", () => {
    const unpublished = skill({
      slug: "hidden",
      published: false,
      inspectionStatus: "completed",
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
    const inspecting = skill({
      slug: "pending",
      published: false,
      inspectionStatus: "interrupted",
      ownerUserId: owner.id,
      contributors: [
        { id: "c2", name: "contrib", username: "contrib", role: "contributor", userId: contributor.id, addedAt: "2026-01-01T00:00:00.000Z" },
      ],
    });

    expect(canAccessUnpublishedVersion(inspecting, { published: false, inspectionStatus: "interrupted" }, contributor)).toBe(true);
    expect(canAccessUnpublishedVersion(inspecting, { published: false, inspectionStatus: "interrupted" }, stranger)).toBe(false);
  });
});
