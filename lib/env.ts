function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function requireEnv(name: string) {
  const value = readEnv(name);

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getDatabaseUrl() {
  return requireEnv("DATABASE_URL");
}
