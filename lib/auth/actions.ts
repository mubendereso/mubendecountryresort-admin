"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { buildLoginRedirect, sanitizeNextPath } from "@/lib/auth/utils";
import { getSql } from "@/lib/db/client";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "@/lib/auth/password";
import { createAdminSession, destroyCurrentAdminSession } from "@/lib/auth/session";
import { consumeRateLimit, getClientIp } from "@/lib/rate-limit";

// Login throttle (MCR-SEC-02). Two independent fixed-window limiters guard
// the internet-facing login: one per source IP (kills single-host brute
// force) and one per email (kills distributed brute force against one
// account). Thresholds are generous enough that a real admin retyping a
// password will not trip them. Both fail-open if the DB is unreachable.
const LOGIN_IP_MAX_ATTEMPTS = 12;
const LOGIN_IP_WINDOW_SECONDS = 600; // 10 minutes
const LOGIN_EMAIL_MAX_ATTEMPTS = 8;
const LOGIN_EMAIL_WINDOW_SECONDS = 900; // 15 minutes

const TOO_MANY_ATTEMPTS_MESSAGE =
  "Too many sign-in attempts. Please wait a few minutes and try again.";

type AdminUserCredentials = {
  id: string;
  email: string;
  password_hash: string;
  is_active: boolean;
};

function requiredEmail(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email) {
    throw new Error("Email is required.");
  }

  return email;
}

function requiredPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");

  if (!password) {
    throw new Error("Password is required.");
  }

  return password;
}

export async function signInWithPasswordAction(formData: FormData) {
  const email = requiredEmail(formData);
  const password = requiredPassword(formData);
  const nextPath = sanitizeNextPath(String(formData.get("next") ?? ""));

  // Throttle before touching credentials. Consume both limiters so a single
  // attempt counts against the IP and the targeted email simultaneously.
  const clientIp = getClientIp(await headers());
  const [ipAllowed, emailAllowed] = await Promise.all([
    consumeRateLimit(`login:ip:${clientIp}`, LOGIN_IP_MAX_ATTEMPTS, LOGIN_IP_WINDOW_SECONDS),
    consumeRateLimit(`login:email:${email}`, LOGIN_EMAIL_MAX_ATTEMPTS, LOGIN_EMAIL_WINDOW_SECONDS)
  ]);

  if (!ipAllowed || !emailAllowed) {
    redirect(buildLoginRedirect(nextPath, TOO_MANY_ATTEMPTS_MESSAGE));
  }

  const sql = getSql();
  const users = (await sql`
    select id, email, password_hash, is_active
    from admin_users
    where lower(email) = lower(${email})
    limit 1
  `) as AdminUserCredentials[];
  const user = users[0];

  // Always run a PBKDF2 verification — against the real hash if the user
  // exists, otherwise a dummy — so a missing/inactive account cannot be
  // distinguished by response timing (MCR-SEC-04).
  const passwordValid = await verifyPassword(password, user?.password_hash ?? DUMMY_PASSWORD_HASH);

  if (!user || !user.is_active || !passwordValid) {
    redirect(buildLoginRedirect(nextPath, "Unable to sign in with those credentials."));
  }

  await sql`
    update admin_users
    set last_signed_in_at = now()
    where id = ${user.id}
  `;
  await createAdminSession(user.id);

  redirect(nextPath);
}

export async function signOutAction() {
  await destroyCurrentAdminSession();
  redirect("/login?message=Signed out.");
}
