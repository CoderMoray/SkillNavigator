import { describe, expect, it } from "vitest";
import { resolveSkillDisplayVerdict } from "../packages/storage/src/utils.js";

describe("resolveSkillDisplayVerdict", () => {
  it("failed review always displays as rejected", () => {
    expect(resolveSkillDisplayVerdict("failed", "published", false)).toBe("rejected");
    expect(resolveSkillDisplayVerdict("failed", "published", true)).toBe("rejected");
  });

  it("in-flight review must not display as published", () => {
    expect(resolveSkillDisplayVerdict("reviewing", "published", false)).toBe("needs-review");
    expect(resolveSkillDisplayVerdict("reviewing", "needs-review", false)).toBe("needs-review");
  });

  it("completed unpublished version must not display as published", () => {
    expect(resolveSkillDisplayVerdict("completed", "published", false)).toBe("needs-review");
    expect(resolveSkillDisplayVerdict("completed", "published", true)).toBe("published");
  });

  it("completed rejected verdict stays rejected", () => {
    expect(resolveSkillDisplayVerdict("completed", "rejected", true)).toBe("rejected");
  });
});
