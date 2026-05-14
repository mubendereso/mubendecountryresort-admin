import "server-only";

import { getCurrentAdminSession, type AdminRole } from "@/lib/auth/session";

const approvedAdminRoles = new Set<AdminRole>(["staff", "admin", "superadmin"]);

export class AdminAuthorizationError extends Error {
  readonly status: 401 | 403;

  constructor(message: string, status: 401 | 403) {
    super(message);
    this.name = "AdminAuthorizationError";
    this.status = status;
  }
}

export async function requireApprovedAdminRole(): Promise<{
  userId: string;
  email: string | null;
  role: AdminRole;
}> {
  const session = await getCurrentAdminSession();

  if (!session) {
    throw new AdminAuthorizationError("Unauthorized.", 401);
  }

  if (!approvedAdminRoles.has(session.role)) {
    throw new AdminAuthorizationError(
      "This account is not approved for the Mubende Country Resort admin.",
      403
    );
  }

  return {
    userId: session.userId,
    email: session.email,
    role: session.role
  };
}

const ALLOWED_REQUEST_ORIGINS = new Set<string>(
  (process.env.ADMIN_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

export function assertSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  let candidate = origin;

  if (!candidate && referer) {
    try {
      candidate = new URL(referer).origin;
    } catch {
      throw new AdminAuthorizationError("Invalid request origin.", 403);
    }
  }

  if (!candidate) {
    throw new AdminAuthorizationError("Missing request origin.", 403);
  }

  if (ALLOWED_REQUEST_ORIGINS.size === 0) {
    const host = request.headers.get("host");
    if (!host) {
      throw new AdminAuthorizationError("Missing request host.", 403);
    }

    const expected = `https://${host}`;
    const expectedHttp = `http://${host}`;
    if (candidate !== expected && candidate !== expectedHttp) {
      throw new AdminAuthorizationError("Cross-origin request rejected.", 403);
    }

    return;
  }

  if (!ALLOWED_REQUEST_ORIGINS.has(candidate)) {
    throw new AdminAuthorizationError("Cross-origin request rejected.", 403);
  }
}
