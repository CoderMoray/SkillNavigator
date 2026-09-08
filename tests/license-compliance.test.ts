import { describe, expect, test } from "vitest";
import {
  collectSkillLicenseFindings,
  isSkillLicenseValidationEnabled
} from "@skill-platform/inspection-engine";

describe("skill license validation", () => {
  test("is disabled by default on this platform", () => {
    const previous = process.env.SKILL_LICENSE_VALIDATION_ENABLED;
    delete process.env.SKILL_LICENSE_VALIDATION_ENABLED;
    expect(isSkillLicenseValidationEnabled()).toBe(false);
    if (previous !== undefined) {
      process.env.SKILL_LICENSE_VALIDATION_ENABLED = previous;
    }
  });

  test("collectSkillLicenseFindings reports missing and non-MIT licenses when enabled", () => {
    expect(collectSkillLicenseFindings({ name: "a", description: "b", license: "Apache-2.0" })).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "license-not-mit0" })])
    );
    expect(collectSkillLicenseFindings({ name: "a", description: "b" })).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "license-missing" })])
    );
    expect(collectSkillLicenseFindings({ name: "a", description: "b", license: "MIT-0" })).toHaveLength(0);
  });
});
