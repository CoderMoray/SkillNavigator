/** Resolve a `/public` asset path with optional Next.js basePath prefix. */
export function publicAssetPath(assetPath: string): string {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const normalized = assetPath.startsWith("/") ? assetPath : `/${assetPath}`;
  return `${basePath}${normalized}`;
}

export const PLATFORM_LOGO_PATH = "/branding/monoskillnavigator-logo.png";
