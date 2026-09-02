/** Resolve a `/public` asset path with optional Next.js basePath prefix. */
export function publicAssetPath(assetPath: string): string {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const normalized = assetPath.startsWith("/") ? assetPath : `/${assetPath}`;
  return `${basePath}${normalized}`;
}

/** Served from apps/web/public; source of truth: packages/MailManager/templates/msn-logo.png */
export const PLATFORM_LOGO_PATH = "/branding/msn-logo.png";
