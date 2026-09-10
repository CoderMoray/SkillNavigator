import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { applyDeploymentConfig, resolveDeploymentConfig } from "../apps/web/lib/deployment-config";

describe("applyDeploymentConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("replaces brand and deployment placeholders", () => {
    const result = applyDeploymentConfig(
      "# {{brand_name}}\nRegistry: {{registry_api_url}}\nWeb: {{web_url}}\nPIP: {{pip_index_url}}",
      {
        brandName: "MonoSkillNavigator",
        registryApiUrl: "https://example.com/api",
        webUrl: "https://example.com",
        pipIndexUrl: "https://pypi.example/simple",
      }
    );

    expect(result).toBe(
      "# MonoSkillNavigator\nRegistry: https://example.com/api\nWeb: https://example.com\nPIP: https://pypi.example/simple"
    );
  });

  test("replaces every brand placeholder in doc-like content", () => {
    const result = applyDeploymentConfig(
      "# {{brand_name}} 介绍\n\n{{brand_name}} 是 Agent Skill 平台。",
      {
        brandName: "DemoBrand",
        registryApiUrl: "https://example.com/api",
        webUrl: "https://example.com",
        pipIndexUrl: "https://pypi.example/simple",
      }
    );

    expect(result).toBe("# DemoBrand 介绍\n\nDemoBrand 是 Agent Skill 平台。");
    expect(result).not.toContain("{{brand_name}}");
  });

  test("resolveDeploymentConfig uses BRAND_NAME from env", () => {
    vi.stubEnv("BRAND_NAME", "MonoSkillNavigator");
    vi.stubEnv("NEXT_PUBLIC_REGISTRY_API_URL", "https://registry.example/api");
    vi.stubEnv("NEXT_PUBLIC_WEB_URL", "https://web.example");

    expect(resolveDeploymentConfig()).toEqual({
      brandName: "MonoSkillNavigator",
      registryApiUrl: "https://registry.example/api",
      webUrl: "https://web.example",
      pipIndexUrl: "https://pypi.org/simple",
    });
  });

  test("renders shipped doc markdown without brand placeholders", async () => {
    const source = await readFile(
      path.join(process.cwd(), "apps/web/content/docs/skill-navigator.md"),
      "utf8"
    );

    const rendered = applyDeploymentConfig(source, {
      brandName: "MonoSkillNavigator",
      registryApiUrl: "https://example.com/api",
      webUrl: "https://example.com",
      pipIndexUrl: "https://pypi.example/simple",
    });

    expect(source).toContain("{{brand_name}}");
    expect(rendered).toContain("# MonoSkillNavigator 介绍");
    expect(rendered).not.toContain("{{brand_name}}");
  });
});
