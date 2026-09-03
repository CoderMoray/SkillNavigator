import { resolveBrandName } from "./brand-name";

import { publicAssetPath } from "./public-asset";

export const REGISTRY_INSTALL_GUIDE_ASSET = "/usage/skillnavigator.md";

const DEFAULT_WEB_ORIGIN = "http://127.0.0.1:3001";

export function registryInstallGuidePath(): string {
  return publicAssetPath(REGISTRY_INSTALL_GUIDE_ASSET);
}

export function buildRegistryInstallGuideUrl(origin: string): string {
  const normalizedOrigin = origin.replace(/\/$/, "");
  return `${normalizedOrigin}${registryInstallGuidePath()}`;
}

/** One-line prompt copied from the homepage (SkillHub-style). */
export function buildRegistryStoreInstallPrompt(installGuideUrl: string): string {
  return `根据 ${installGuideUrl} 安装 ${resolveBrandName()} 平台。`;
}

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/$/, "");
}

/** Web origin from NEXT_PUBLIC_WEB_URL, optional client origin, or local default. */
export function resolveWebOrigin(clientOrigin?: string): string {
  const fromEnv = process.env.NEXT_PUBLIC_WEB_URL?.trim();
  if (fromEnv) {
    return normalizeOrigin(fromEnv);
  }
  if (clientOrigin) {
    return normalizeOrigin(clientOrigin);
  }
  return DEFAULT_WEB_ORIGIN;
}

/**
 * Install guide URL for the homepage copy prompt.
 * Priority: NEXT_PUBLIC_REGISTRY_INSTALL_GUIDE_URL > NEXT_PUBLIC_WEB_URL + path > client origin + path.
 */
export function resolveRegistryInstallGuideUrl(clientOrigin?: string): string {
  const fullUrl = process.env.NEXT_PUBLIC_REGISTRY_INSTALL_GUIDE_URL?.trim();
  if (fullUrl) {
    return fullUrl;
  }
  return buildRegistryInstallGuideUrl(resolveWebOrigin(clientOrigin));
}

export function resolveRegistryStoreInstallPrompt(clientOrigin?: string): string {
  return buildRegistryStoreInstallPrompt(resolveRegistryInstallGuideUrl(clientOrigin));
}
