/** Default platform display name when BRAND_NAME is unset. */
export const DEFAULT_BRAND_NAME = "SkillNavigator";

export const BRAND_NAME_PLACEHOLDER = "{{brand_name}}";

export function getBrandName(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.BRAND_NAME?.trim() ||
    env.NEXT_PUBLIC_BRAND_NAME?.trim() ||
    DEFAULT_BRAND_NAME
  );
}

/** Replace `{{brand_name}}` placeholders in user-facing copy. */
export function applyBrandName(
  content: string,
  brandName = getBrandName()
): string {
  return content.replaceAll(BRAND_NAME_PLACEHOLDER, brandName);
}
