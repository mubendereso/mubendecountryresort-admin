import type { QueuedMutation } from "./protocol";

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (value && typeof value === "object" && value.constructor === Object) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = stableValue((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }

  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export async function hashQueuedMutation(
  mutation: Pick<QueuedMutation, "type" | "payload">
): Promise<string> {
  const payload = canonicalJson({
    type: mutation.type,
    payload: mutation.payload
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")}`;
}

export function decideLedgerReplay(
  existingHash: string | null,
  incomingHash: string
): "apply" | "replay" | "conflict" {
  if (!existingHash) return "apply";
  if (existingHash !== incomingHash) return "conflict";
  return "replay";
}

