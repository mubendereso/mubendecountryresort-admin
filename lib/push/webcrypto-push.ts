import "server-only";

// VAPID + RFC 8291 web push using globalThis.crypto (Cloudflare Workers native).
// No Node.js crypto dependency.

function makeBytes(length: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new ArrayBuffer(length));
}

function b64uDecode(b64u: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64u.length % 4)) % 4);
  const b64 = (b64u + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = makeBytes(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function b64uEncode(data: ArrayBuffer | Uint8Array<ArrayBuffer>): string {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...arrays: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = makeBytes(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

// PKCS8 wrapper prefix for a raw 32-byte P-256 private key.
const PKCS8_P256_HEADER = new Uint8Array([
  0x30, 0x41, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06, 0x07,
  0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08,
  0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x04,
  0x27, 0x30, 0x25, 0x02, 0x01, 0x01, 0x04, 0x20,
]);

async function importEcdsaPrivate(rawB64u: string): Promise<CryptoKey> {
  const pkcs8 = concat(PKCS8_P256_HEADER, b64uDecode(rawB64u));
  return crypto.subtle.importKey(
    "pkcs8", pkcs8,
    { name: "ECDSA", namedCurve: "P-256" },
    false, ["sign"]
  );
}

async function makeVapidJwt(
  endpoint: string,
  subject: string,
  privB64u: string
): Promise<string> {
  const enc = new TextEncoder();
  const header = b64uEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64uEncode(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 43200,
    sub: subject,
  })));
  const sigInput = `${header}.${claims}`;
  const privateKey = await importEcdsaPrivate(privB64u);
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    enc.encode(sigInput)
  );
  return `${sigInput}.${b64uEncode(sig)}`;
}

async function hkdfExtract(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const saltKey = await crypto.subtle.importKey("raw", salt, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prk = await crypto.subtle.sign("HMAC", saltKey, ikm);
  return crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function hkdfExpand(prk: CryptoKey, info: Uint8Array<ArrayBuffer>, len: number): Promise<Uint8Array<ArrayBuffer>> {
  const out = makeBytes(len);
  let prev = makeBytes(0);
  let off = 0;
  let n = 1;
  while (off < len) {
    const block = new Uint8Array(
      await crypto.subtle.sign("HMAC", prk, concat(prev, info, new Uint8Array([n++])))
    ) as Uint8Array<ArrayBuffer>;
    const take = Math.min(block.length, len - off);
    out.set(block.subarray(0, take), off);
    off += take;
    prev = block;
  }
  return out;
}

async function encryptPayload(
  plaintext: string,
  authB64u: string,
  p256dhB64u: string
): Promise<Uint8Array<ArrayBuffer>> {
  const enc = new TextEncoder();
  const auth = b64uDecode(authB64u);
  const uaPublic = b64uDecode(p256dhB64u);

  const salt = crypto.getRandomValues(makeBytes(16));

  const ephemeral = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey)) as Uint8Array<ArrayBuffer>;

  const receiverKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: receiverKey }, ephemeral.privateKey, 256)
  ) as Uint8Array<ArrayBuffer>;

  // RFC 8291 key derivation
  const prkKey = await hkdfExtract(auth, sharedSecret);
  const keyInfo = concat(enc.encode("WebPush: info\x00") as Uint8Array<ArrayBuffer>, uaPublic, asPublic);
  const ikm = await hkdfExpand(prkKey, keyInfo, 32);

  const prk = await hkdfExtract(salt, ikm);
  const cek = await hkdfExpand(prk, enc.encode("Content-Encoding: aes128gcm\x00") as Uint8Array<ArrayBuffer>, 16);
  const nonce = await hkdfExpand(prk, enc.encode("Content-Encoding: nonce\x00") as Uint8Array<ArrayBuffer>, 12);

  const cekKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const padded = concat(enc.encode(plaintext) as Uint8Array<ArrayBuffer>, new Uint8Array([0x02]) as Uint8Array<ArrayBuffer>);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, cekKey, padded)
  ) as Uint8Array<ArrayBuffer>;

  // RFC 8188 body: salt(16) + rs(4 BE) + idlen(1) + asPublic(65) + ciphertext
  const rs = makeBytes(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  return concat(salt, rs, new Uint8Array([65]) as Uint8Array<ArrayBuffer>, asPublic, ciphertext);
}

export type WebPushResult = { ok: boolean; status: number; endpoint: string };

export async function sendWebPush(opts: {
  endpoint: string;
  p256dh: string;
  auth: string;
  payload: object;
  vapidSubject: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
  topic?: string;
  ttl?: number;
}): Promise<WebPushResult> {
  const { endpoint, p256dh, auth, payload, vapidSubject, vapidPublicKey, vapidPrivateKey } = opts;

  const jwt = await makeVapidJwt(endpoint, vapidSubject, vapidPrivateKey);
  const body = await encryptPayload(JSON.stringify(payload), auth, p256dh);

  const headers: Record<string, string> = {
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    "Content-Length": String(body.length),
    "TTL": String(opts.ttl ?? 300),
    "Urgency": "high",
    "Authorization": `vapid t=${jwt},k=${vapidPublicKey}`,
  };
  if (opts.topic) headers["Topic"] = opts.topic;

  const res = await fetch(endpoint, { method: "POST", headers, body });
  return { ok: res.status === 201, status: res.status, endpoint };
}

export async function hashTopic(tag: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(tag));
  return b64uEncode(buf).slice(0, 32);
}
