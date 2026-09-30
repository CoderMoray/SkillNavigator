import { describe, expect, it } from "vitest";
import {
  buildLoginHref,
  resolveLoginNextPath,
  skillPagePath,
  withNextParam,
} from "../apps/web/lib/login-redirect";

describe("resolveLoginNextPath", () => {
  it("keeps an app-relative path", () => {
    expect(resolveLoginNextPath("/skills/demo-skill")).toBe("/skills/demo-skill");
    expect(resolveLoginNextPath("  /skills/demo-skill?x=1  ")).toBe("/skills/demo-skill?x=1");
  });

  it("ignores anything that is not app-relative (open redirect)", () => {
    expect(resolveLoginNextPath(null)).toBeNull();
    expect(resolveLoginNextPath("")).toBeNull();
    expect(resolveLoginNextPath("   ")).toBeNull();
    expect(resolveLoginNextPath("https://evil.example/login")).toBeNull();
    expect(resolveLoginNextPath("//evil.example/login")).toBeNull();
    expect(resolveLoginNextPath("/\\evil.example")).toBeNull();
    expect(resolveLoginNextPath("skills/demo-skill")).toBeNull();
  });
});

describe("buildLoginHref", () => {
  it("returns to the skill page it was given", () => {
    expect(buildLoginHref(skillPagePath("demo-skill"))).toBe("/login?next=%2Fskills%2Fdemo-skill");
    expect(resolveLoginNextPath(new URLSearchParams("next=%2Fskills%2Fdemo-skill").get("next"))).toBe(
      "/skills/demo-skill"
    );
  });

  it("encodes a slug with a slash instead of splitting the path", () => {
    expect(skillPagePath("a/b")).toBe("/skills/a%2Fb");
  });
});

describe("withNextParam", () => {
  it("appends the return path only when there is one", () => {
    expect(withNextParam("/register", "/skills/demo-skill")).toBe(
      "/register?next=%2Fskills%2Fdemo-skill"
    );
    expect(withNextParam("/register", null)).toBe("/register");
    expect(withNextParam("/register", undefined)).toBe("/register");
  });
});
