import "server-only";

const PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256";
const PASSWORD_HASH_ITERATIONS = 310000;
const PASSWORD_HASH_KEY_LENGTH_BYTES = 32;
const SALT_LENGTH_BYTES = 16;

const textEncoder = new TextEncoder();

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number, keyLengthBytes: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(password) as BufferSource,
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    key,
    keyLengthBytes * 8
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
  const hash = await pbkdf2(password, salt, PASSWORD_HASH_ITERATIONS, PASSWORD_HASH_KEY_LENGTH_BYTES);

  return [
    PASSWORD_HASH_ALGORITHM,
    String(PASSWORD_HASH_ITERATIONS),
    toBase64(salt),
    toBase64(hash)
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

  const salt = fromBase64(saltRaw);
  const expectedHash = fromBase64(hashRaw);
  const actualHash = await pbkdf2(password, salt, iterations, expectedHash.length);

  return timingSafeEqual(actualHash, expectedHash);
}
