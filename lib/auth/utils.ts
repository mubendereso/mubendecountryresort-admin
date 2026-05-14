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
