import { publicAssetPath } from "./public-asset";

export const REGISTRY_INSTALL_GUIDE_ASSET = "/usage/monoskillnavigator.md";

export function registryInstallGuidePath(): string {
  return publicAssetPath(REGISTRY_INSTALL_GUIDE_ASSET);
}

export function buildRegistryInstallGuideUrl(origin: string): string {
  const normalizedOrigin = origin.replace(/\/$/, "");
  return `${normalizedOrigin}${registryInstallGuidePath()}`;
}

/** One-line prompt copied from the homepage (SkillHub-style). */
export function buildRegistryStoreInstallPrompt(installGuideUrl: string): string {
  return `根据 ${installGuideUrl} 安装 MonoSkillNavigator 平台。`;
}

export const DEFAULT_WEB_ORIGIN =
  process.env.NEXT_PUBLIC_WEB_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:3001";
