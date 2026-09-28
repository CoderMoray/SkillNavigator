/**
 * Post-login destination taken from the `?next=` query param.
 *
 * Opt-in by design: only pages that explicitly ask for a return trip append it,
 * so every existing entry into /login keeps landing on the default page
 * (the creator profile) after a successful sign-in.
 *
 * Only a single-slash-rooted, app-relative path is accepted — an absolute or
 * protocol-relative value would turn the login page into an open redirect.
 * The result stays basePath-relative: `router.push` adds the deployment prefix
 * itself, so callers must not pre-prefix it.
 */
export function resolveLoginNextPath(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) {
    return null;
  }
  return raw;
}

/** Login URL that returns to the app-relative `path` after signing in. */
export function buildLoginHref(path: string): string {
  return `/login?next=${encodeURIComponent(path)}`;
}

/** App-relative path of a skill detail page. */
export function skillPagePath(slug: string): string {
  return `/skills/${encodeURIComponent(slug)}`;
}
