import { resolveBrandName } from "./brand-name";

export const REGISTRY_API_URL_PLACEHOLDER = "{{registry_api_url}}";
export const WEB_URL_PLACEHOLDER = "{{web_url}}";
export const PIP_INDEX_URL_PLACEHOLDER = "{{pip_index_url}}";

/** Rendered when the deployment env is not configured (Option B: explicit
 * "ask the maintainer" notice instead of a silently wrong dev URL). */
const UNSET_REGISTRY_API_URL = "（部署方未配置 Registry API 地址——请向平台维护者索取）";
const UNSET_WEB_URL = "（部署方未配置对外 Web 地址——请向平台维护者索取）";
const DEFAULT_PIP_INDEX_URL = "https://pypi.org/simple";

export interface DeploymentConfig {
  brandName: string;
  registryApiUrl: string;
  webUrl: string;
  pipIndexUrl: string;
}

/**
 * Instance-level deployment configuration for user-facing guides.
 * Unset values render as explicit notices — never as 127.0.0.1 dev defaults.
 */
export function resolveDeploymentConfig(): DeploymentConfig {
  return {
    brandName: resolveBrandName(),
    registryApiUrl: process.env.NEXT_PUBLIC_REGISTRY_API_URL?.trim() || UNSET_REGISTRY_API_URL,
    webUrl:
      process.env.NEXT_PUBLIC_WEB_URL?.trim() ||
      process.env.WEB_PUBLIC_URL?.trim() ||
      UNSET_WEB_URL,
    pipIndexUrl: process.env.NEXT_PUBLIC_PIP_INDEX_URL?.trim() || DEFAULT_PIP_INDEX_URL,
  };
}

/** Inject deployment values into guide/prompt templates ({{...}} placeholders). */
export function applyDeploymentConfig(content: string, config = resolveDeploymentConfig()): string {
  return content
    .replaceAll(REGISTRY_API_URL_PLACEHOLDER, config.registryApiUrl)
    .replaceAll(WEB_URL_PLACEHOLDER, config.webUrl)
    .replaceAll(PIP_INDEX_URL_PLACEHOLDER, config.pipIndexUrl);
}
