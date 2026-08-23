// Occurrence identity for detected moments.
//
// Two distinct concepts (pre-deploy review P1):
//
//   Technical idempotency — the SAME evidence (signal group) must never
//   create two moments, no matter how often the queue redelivers or how many
//   workers race. Achieved with a stable key derived from the sorted signal
//   ids + the (organization, account, moment) it resolves to, enforced by the
//   partial unique index on moment_events(organization_id, dedupe_key).
//
//   Business deduplication — overlapping ACTIVE moments of the same type for
//   one account usually represent the same ongoing occurrence, so new
//   evidence attaches to the active moment instead of opening a parallel
//   one. This is application logic in the detection flow, NOT a database
//   uniqueness rule: once that moment closes, a future signal group (a new
//   branch next year, a different expansion) may open a fresh moment.

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Stable technical-idempotency key for one detection occurrence.
 *
 * Properties:
 * - order-insensitive: the signal id set is sorted before hashing
 * - same evidence → same key; any different signal group → different key
 * - org / account / moment are part of the key, so tenants never collide
 */
export async function signalOccurrenceKey(
  organizationId: string,
  accountId: string,
  momentCode: string,
  signalIds: string[],
): Promise<string> {
  const sorted = [...signalIds].sort();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(sorted.join("\n")),
  );
  return `SIGNAL:${organizationId}:${accountId}:${momentCode}:${toHex(digest).slice(0, 32)}`;
}
