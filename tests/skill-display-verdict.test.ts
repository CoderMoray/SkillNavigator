import { describe, expect, it } from "vitest";
import { resolveSkillDisplayVerdict } from "../packages/storage/src/utils.js";

describe("resolveSkillDisplayVerdict", () => {
  it("failed review always displays as rejected", () => {
    expect(resolveSkillDisplayVerdict("interrupted", "published", false)).toBe("needs-inspection");
    expect(resolveSkillDisplayVerdict("rejected", "published", false)).toBe("rejected");
    expect(resolveSkillDisplayVerdict("rejected", "published", true)).toBe("rejected");
  });

  it("in-flight review must not display as published", () => {
    expect(resolveSkillDisplayVerdict("inspecting", "published", false)).toBe("needs-inspection");
    expect(resolveSkillDisplayVerdict("inspecting", "needs-inspection", false)).toBe("needs-inspection");
  });

  it("completed unpublished version must not display as published", () => {
    expect(resolveSkillDisplayVerdict("completed", "published", false)).toBe("needs-inspection");
    expect(resolveSkillDisplayVerdict("completed", "published", true)).toBe("published");
  });

  it("completed rejected verdict stays rejected", () => {
    expect(resolveSkillDisplayVerdict("completed", "rejected", true)).toBe("rejected");
  });
});
