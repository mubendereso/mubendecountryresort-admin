import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getSql } from "@/lib/db/client";

export type AdminRole = "staff" | "admin" | "superadmin";

export type AdminSession = {
  sessionId: string;
  userId: string;
  email: string;
  fullName: string | null;
  role: AdminRole;
};

const SESSION_COOKIE_NAME = "mcr_admin_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

type SessionRow = {
  session_id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  role: AdminRole;
};

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createAdminSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  const cookieStore = await cookies();
  const sql = getSql();

  await sql`
    insert into admin_sessions (token_hash, user_id, expires_at)
    values (${tokenHash}, ${userId}, ${expiresAt.toISOString()})
  `;

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS
  });
}

export async function getCurrentAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const sql = getSql();
  const rows = (await sql`
    select
      s.token_hash as session_id,
      u.id as user_id,
      u.email,
      u.full_name,
      u.role
    from admin_sessions s
    join admin_users u on u.id = s.user_id
    where s.token_hash = ${hashSessionToken(token)}
      and s.expires_at > now()
      and u.is_active = true
    limit 1
  `) as SessionRow[];
  const session = rows[0];

  if (!session) {
    return null;
  }

  return {
    sessionId: session.session_id,
    userId: session.user_id,
    email: session.email,
    fullName: session.full_name,
    role: session.role
  };
}

export async function destroyCurrentAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    const sql = getSql();
    await sql`
      delete from admin_sessions
      where token_hash = ${hashSessionToken(token)}
    `;
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}
