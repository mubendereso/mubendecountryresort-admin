import { pbkdf2Sync, randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";

const [, , emailArg, passwordArg, roleArg = "admin", fullNameArg = null] = process.argv;
const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.error("Missing DATABASE_URL.");
  process.exit(1);
}

if (!emailArg || !passwordArg) {
  console.error("Usage: npm run admin:create-user -- staff@example.com \"temporary-password\" [role] [full name]");
  process.exit(1);
}

const allowedRoles = new Set(["staff", "admin", "superadmin"]);
const role = roleArg.trim();
if (!allowedRoles.has(role)) {
  console.error("Role must be one of: staff, admin, superadmin.");
  process.exit(1);
}

function hashPassword(password) {
  // Cloudflare workerd caps PBKDF2 iterations at 100,000. Keep this in sync
  // with PASSWORD_HASH_ITERATIONS in lib/auth/password.ts so hashes produced
  // here can be verified by the Worker.
  const iterations = 100000;
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  return ["pbkdf2_sha256", String(iterations), salt.toString("base64"), hash.toString("base64")].join(
    "$"
  );
}

const sql = neon(databaseUrl);
const email = emailArg.trim().toLowerCase();
const passwordHash = hashPassword(passwordArg);
const fullName = fullNameArg?.trim() || null;

await sql`
  insert into admin_users (email, password_hash, role, full_name)
  values (${email}, ${passwordHash}, ${role}, ${fullName})
  on conflict ((lower(email)))
  do update set
    password_hash = excluded.password_hash,
    role = excluded.role,
    full_name = excluded.full_name,
    is_active = true,
    updated_at = now()
`;

console.log(`Admin user ready: ${email} (${role})`);
