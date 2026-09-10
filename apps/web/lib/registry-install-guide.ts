import { resolveBrandName } from "./brand-name";

export const REGISTRY_INSTALL_GUIDE_ASSET = "/usage/skillnavigator.md";

const DEV_WEB_ORIGIN = "http://127.0.0.1:3001";

function normalizeTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function normalizedBasePath(): string {
  const raw = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? "";
  if (!raw) {
    return "";
  }
  const withLeading = raw.startsWith("/") ? raw : `/${raw}`;
  return normalizeTrailingSlash(withLeading);
}

function configuredPublicWebUrl(): string | null {
  return process.env.NEXT_PUBLIC_WEB_URL?.trim() || null;
}

/**
 * Next.js app root URL for user-facing links (install guide, etc.).
 * Accepts either a bare origin or a full entry URL that already includes
 * NEXT_PUBLIC_BASE_PATH — never duplicates the base path segment.
 */
export function resolveWebAppRoot(clientOrigin?: string): string | null {
  const basePath = normalizedBasePath();
  const fromEnv = configuredPublicWebUrl();
  const raw =
    fromEnv ||
    (clientOrigin ? normalizeTrailingSlash(clientOrigin) : null) ||
    (process.env.NODE_ENV === "development" ? DEV_WEB_ORIGIN : null);

  if (!raw) {
    return null;
  }

  const root = normalizeTrailingSlash(raw);
  if (!basePath) {
    return root;
  }
  if (root.endsWith(basePath)) {
    return root;
  }
  return `${root}${basePath}`;
}

/** @deprecated Prefer resolveWebAppRoot; kept for tests and legacy callers. */
export function resolveWebOrigin(clientOrigin?: string): string | null {
  const fromEnv = configuredPublicWebUrl();
  if (fromEnv) {
    return normalizeTrailingSlash(fromEnv);
  }
  if (clientOrigin) {
    return normalizeTrailingSlash(clientOrigin);
  }
  return process.env.NODE_ENV === "development" ? DEV_WEB_ORIGIN : null;
}

export function buildRegistryInstallGuideUrl(appRoot: string): string {
  const normalizedRoot = normalizeTrailingSlash(appRoot);
  const assetPath = REGISTRY_INSTALL_GUIDE_ASSET.startsWith("/")
    ? REGISTRY_INSTALL_GUIDE_ASSET
    : `/${REGISTRY_INSTALL_GUIDE_ASSET}`;
  return `${normalizedRoot}${assetPath}`;
}

/** One-line prompt copied from the homepage (SkillHub-style). */
export function buildRegistryStoreInstallPrompt(installGuideUrl: string): string {
  return `根据 ${installGuideUrl} 安装 ${resolveBrandName()} 平台。`;
}

/**
 * Install guide URL for the homepage copy prompt, or null when the deployment
 * has no configured URL and no client origin is available (SSR of an
 * unconfigured production build) — callers render an explicit notice instead.
 * Priority: NEXT_PUBLIC_REGISTRY_INSTALL_GUIDE_URL > resolveWebAppRoot + asset path
 * > (dev only) local default + asset path.
 */
export function resolveRegistryInstallGuideUrl(clientOrigin?: string): string | null {
  const fullUrl = process.env.NEXT_PUBLIC_REGISTRY_INSTALL_GUIDE_URL?.trim();
  if (fullUrl) {
    return fullUrl;
  }
  const appRoot = resolveWebAppRoot(clientOrigin);
  return appRoot ? buildRegistryInstallGuideUrl(appRoot) : null;
}

export function resolveRegistryStoreInstallPrompt(clientOrigin?: string): string {
  const url = resolveRegistryInstallGuideUrl(clientOrigin);
  return url
    ? buildRegistryStoreInstallPrompt(url)
    : "本实例未配置安装引导地址——请联系平台维护者在部署配置（.env）中设置 NEXT_PUBLIC_WEB_URL。";
}
