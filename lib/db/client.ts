import "server-only";

import { neon } from "@neondatabase/serverless";
import { getDatabaseUrl } from "@/lib/env";

let sqlClient: ReturnType<typeof neon> | null = null;

export function getSql() {
  sqlClient ??= neon(getDatabaseUrl());
  return sqlClient;
}
