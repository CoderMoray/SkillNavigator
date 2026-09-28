import { describe, expect, it } from "vitest";
import { SKILL_INSTALL_PROMPT_TEMPLATE } from "../apps/web/lib/generated/skill-install-prompt";
import { buildSkillInstallPrompt } from "../apps/web/lib/skill-install-prompt";

const SKILL = { slug: "demo-skill" };

describe("buildSkillInstallPrompt", () => {
  it("substitutes the slug and leaves no placeholder behind", () => {
    const prompt = buildSkillInstallPrompt({ skill: SKILL });
    expect(prompt).toContain("要安装的 Skill：demo-skill");
    expect(prompt).not.toMatch(/\{\{[a-z_]+\}\}/);
  });

  it("installs with the required --dir flag", () => {
    expect(buildSkillInstallPrompt({ skill: SKILL })).toContain(
      "skillnav install demo-skill --dir"
    );
  });

  it("checks CLI, then login, then the Registry the account points at", () => {
    const prompt = buildSkillInstallPrompt({ skill: SKILL });
    const cli = prompt.indexOf("command -v skillnav");
    const login = prompt.indexOf("skillnav whoami");
    const registry = prompt.indexOf("skillnav config connect-test");
    expect(cli).toBeGreaterThanOrEqual(0);
    expect(cli).toBeLessThan(login);
    expect(login).toBeLessThan(registry);
  });

  it("carries only the slug as skill-specific data", () => {
    const prompt = buildSkillInstallPrompt({ skill: SKILL });
    // No detail-page URL: hand-built absolute links were the basePath-less 404.
    expect(prompt).not.toContain("/skills/");
    // Everything else is the template, so two skills must differ by the slug only.
    const other = buildSkillInstallPrompt({ skill: { slug: "other-skill" } });
    expect(prompt.replaceAll("demo-skill", "SLUG")).toBe(other.replaceAll("other-skill", "SLUG"));
  });

  it("resolves every deployment placeholder at build time", () => {
    expect(SKILL_INSTALL_PROMPT_TEMPLATE).toContain("{{skill_slug}}");
    // Only {{skill_slug}} may survive the build; anything else means the template
    // used a placeholder the sync script does not know (e.g. an env var name).
    const leftovers = SKILL_INSTALL_PROMPT_TEMPLATE.match(/\{\{[^}]+\}\}/g) ?? [];
    expect([...new Set(leftovers)]).toEqual(["{{skill_slug}}"]);
  });
});
