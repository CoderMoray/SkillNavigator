import { afterEach, describe, expect, test, vi } from "vitest";
import { applyBrandName, resolveBrandName } from "../apps/web/lib/brand-name";
import { getBrandName } from "../packages/storage/src/brand-name";

describe("brand-name", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("defaults to SkillNavigator when env is unset", () => {
    vi.stubEnv("BRAND_NAME", "");
    vi.stubEnv("NEXT_PUBLIC_BRAND_NAME", "");
    expect(resolveBrandName()).toBe("SkillNavigator");
    expect(getBrandName()).toBe("SkillNavigator");
  });

  test("prefers BRAND_NAME over NEXT_PUBLIC_BRAND_NAME", () => {
    vi.stubEnv("BRAND_NAME", "MonoSkillNavigator");
    vi.stubEnv("NEXT_PUBLIC_BRAND_NAME", "Other");
    expect(resolveBrandName()).toBe("MonoSkillNavigator");
  });

  test("replaces {{brand_name}} placeholders", () => {
    expect(applyBrandName("Welcome to {{brand_name}}.", "DemoBrand")).toBe(
      "Welcome to DemoBrand."
    );
  });
});
