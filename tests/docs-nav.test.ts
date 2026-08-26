import { afterEach, describe, expect, test, vi } from "vitest";
import { resolveDocImageSrc } from "../apps/web/lib/docs-nav";

describe("resolveDocImageSrc", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("rewrites relative tutorial paths for Next.js public assets", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "");
    expect(resolveDocImageSrc("../../public/docs/tutorial/01-home-and-navigation.png")).toBe(
      "/docs/tutorial/01-home-and-navigation.png"
    );
  });

  test("prefixes absolute tutorial paths with basePath", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/MonoSkillNavigator");
    expect(resolveDocImageSrc("/docs/tutorial/02-register.png")).toBe(
      "/MonoSkillNavigator/docs/tutorial/02-register.png"
    );
  });

  test("leaves external URLs unchanged", () => {
    expect(resolveDocImageSrc("https://example.com/image.png")).toBe("https://example.com/image.png");
  });
});
