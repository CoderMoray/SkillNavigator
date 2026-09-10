import { describe, expect, test } from "vitest";
import { applyDeploymentConfig } from "../apps/web/lib/deployment-config";

describe("applyDeploymentConfig", () => {
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
});
