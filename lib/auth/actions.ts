"use server";

import { redirect } from "next/navigation";
import { buildLoginRedirect } from "@/lib/auth/utils";
import { getSql } from "@/lib/db/client";
import { verifyPassword } from "@/lib/auth/password";
import { createAdminSession, destroyCurrentAdminSession } from "@/lib/auth/session";

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
  const nextPath = String(formData.get("next") ?? "/dashboard").trim() || "/dashboard";
  const sql = getSql();
  const users = (await sql`
    select id, email, password_hash, is_active
    from admin_users
    where lower(email) = lower(${email})
    limit 1
  `) as AdminUserCredentials[];
  const user = users[0];

  if (!user || !user.is_active || !(await verifyPassword(password, user.password_hash))) {
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
