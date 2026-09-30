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
 *
 * Known, deliberate gap: the email-verification hop does not carry this param,
 * so verification still lands on the creator profile. See docs/roadmap.md
 * 「明确的非目标」for why it is not worth threading it through the email.
 */
export function resolveLoginNextPath(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) {
    return null;
  }
  return raw;
}

/**
 * Append an opt-in `?next=` return path. Returns `target` untouched when there
 * is no return path, so the default destination of every auth page survives.
 */
export function withNextParam(target: string, nextPath: string | null | undefined): string {
  return nextPath ? `${target}?next=${encodeURIComponent(nextPath)}` : target;
}

/** Login URL that returns to the app-relative `path` after signing in. */
export function buildLoginHref(path: string): string {
  return withNextParam("/login", path);
}

/** App-relative path of a skill detail page. */
export function skillPagePath(slug: string): string {
  return `/skills/${encodeURIComponent(slug)}`;
}
