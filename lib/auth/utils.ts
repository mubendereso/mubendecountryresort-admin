/**
 * Sanitize an attacker-controllable `next` redirect target so it can only ever
 * point at an internal path on this origin. Anything that could leave the site
 * (absolute URLs, scheme-relative `//host`, backslash tricks, embedded schemes)
 * falls back to `/dashboard`. Mitigates the open-redirect class (MCR-SEC-01).
 */
export function sanitizeNextPath(nextPath?: string | null): string {
  const fallback = "/dashboard";

  if (!nextPath) {
    return fallback;
  }

  const value = nextPath.trim();

  // Must be a single-slash-rooted path. Reject scheme-relative `//evil.com`,
  // backslash variants (`/\evil.com`, browsers normalise `\` to `/`), and any
  // value carrying a scheme (`https:`, `javascript:`, `mailto:` …).
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\") ||
    value.includes(":") ||
    value.includes("\\")
  ) {
    return fallback;
  }

  return value;
}

export function buildLoginRedirect(nextPath?: string | null, message?: string | null) {
  const params = new URLSearchParams();

  if (nextPath) {
    params.set("next", nextPath);
  }

  if (message) {
    params.set("message", message);
  }

  const query = params.toString();
  return query.length > 0 ? `/login?${query}` : "/login";
}
