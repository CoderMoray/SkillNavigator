import { resolveBrandName } from "./brand-name";

import { publicAssetPath } from "./public-asset";

export const REGISTRY_INSTALL_GUIDE_ASSET = "/usage/skillnavigator.md";

const DEV_WEB_ORIGIN = "http://127.0.0.1:3001";

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

/**
 * Web origin from NEXT_PUBLIC_WEB_URL, optional client origin, or — in
 * development only — the local dev default. Production builds without a
 * configured URL resolve to null instead of a silently wrong dev address.
 */
export function resolveWebOrigin(clientOrigin?: string): string | null {
  const fromEnv = process.env.NEXT_PUBLIC_WEB_URL?.trim();
  if (fromEnv) {
    return normalizeOrigin(fromEnv);
  }
  if (clientOrigin) {
    return normalizeOrigin(clientOrigin);
  }
  return process.env.NODE_ENV === "development" ? DEV_WEB_ORIGIN : null;
}

/**
 * Install guide URL for the homepage copy prompt, or null when the deployment
 * has no configured URL and no client origin is available (SSR of an
 * unconfigured production build) — callers render an explicit notice instead.
 * Priority: NEXT_PUBLIC_REGISTRY_INSTALL_GUIDE_URL > NEXT_PUBLIC_WEB_URL + path
 * > client origin + path > (dev only) local default + path.
 */
export function resolveRegistryInstallGuideUrl(clientOrigin?: string): string | null {
  const fullUrl = process.env.NEXT_PUBLIC_REGISTRY_INSTALL_GUIDE_URL?.trim();
  if (fullUrl) {
    return fullUrl;
  }
  const origin = resolveWebOrigin(clientOrigin);
  return origin ? buildRegistryInstallGuideUrl(origin) : null;
}

export function resolveRegistryStoreInstallPrompt(clientOrigin?: string): string {
  const url = resolveRegistryInstallGuideUrl(clientOrigin);
  return url
    ? buildRegistryStoreInstallPrompt(url)
    : "本实例未配置安装引导地址——请联系平台维护者在部署配置（.env）中设置 NEXT_PUBLIC_WEB_URL。";
}
