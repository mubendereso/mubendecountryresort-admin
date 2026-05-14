import "server-only";

import { pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2Async = promisify(pbkdf2);
const PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256";
const PASSWORD_HASH_ITERATIONS = 310000;
const PASSWORD_HASH_KEY_LENGTH = 32;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await pbkdf2Async(
    password,
    salt,
    PASSWORD_HASH_ITERATIONS,
    PASSWORD_HASH_KEY_LENGTH,
    "sha256"
  );

  return [
    PASSWORD_HASH_ALGORITHM,
    String(PASSWORD_HASH_ITERATIONS),
    salt.toString("base64"),
    hash.toString("base64")
  ].join("$");
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, iterationsRaw, saltRaw, hashRaw] = storedHash.split("$");
  const iterations = Number(iterationsRaw);

  if (
    algorithm !== PASSWORD_HASH_ALGORITHM ||
    !Number.isInteger(iterations) ||
    iterations < 100000 ||
    !saltRaw ||
    !hashRaw
  ) {
    return false;
  }

  const salt = Buffer.from(saltRaw, "base64");
  const expectedHash = Buffer.from(hashRaw, "base64");
  const actualHash = await pbkdf2Async(
    password,
    salt,
    iterations,
    expectedHash.length,
    "sha256"
  );

  return actualHash.length === expectedHash.length && timingSafeEqual(actualHash, expectedHash);
}
