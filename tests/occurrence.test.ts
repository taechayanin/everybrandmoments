import { describe, expect, it } from "vitest";
import { signalOccurrenceKey } from "@/lib/jobs/occurrence";

// Technical-idempotency key semantics (pre-deploy review P1). The database
// side (INSERT OR IGNORE + partial unique index on organization_id,
// dedupe_key) is exercised against local D1 in the deploy checklist; these
// tests pin the key derivation the whole mechanism depends on.

describe("signalOccurrenceKey", () => {
  it("is deterministic — same job retried gives the same key (case 1)", async () => {
    const a = await signalOccurrenceKey("ORG-001", "ACC-001", "EBM Expand", ["SIG-a", "SIG-b"]);
    const b = await signalOccurrenceKey("ORG-001", "ACC-001", "EBM Expand", ["SIG-a", "SIG-b"]);
    expect(a).toBe(b);
  });

  it("concurrent workers on the same evidence compute the same key (case 2)", async () => {
    const [a, b] = await Promise.all([
      signalOccurrenceKey("ORG-001", "ACC-001", "EBM Expand", ["SIG-1", "SIG-2", "SIG-3"]),
      signalOccurrenceKey("ORG-001", "ACC-001", "EBM Expand", ["SIG-1", "SIG-2", "SIG-3"]),
    ]);
    expect(a).toBe(b);
  });

  it("a different signal group later gives a different key — new Moment allowed (case 3)", async () => {
    const chiangmai2026 = await signalOccurrenceKey("ORG-001", "ACC-001", "EBM Expand", ["SIG-cm-1", "SIG-cm-2"]);
    const phuket2027 = await signalOccurrenceKey("ORG-001", "ACC-001", "EBM Expand", ["SIG-pk-1"]);
    const vietnam2028 = await signalOccurrenceKey("ORG-001", "ACC-001", "EBM Expand", ["SIG-vn-1", "SIG-vn-2"]);
    expect(new Set([chiangmai2026, phuket2027, vietnam2028]).size).toBe(3);
  });

  it("same account + same moment + same evidence collides — duplicate prevented (case 4)", async () => {
    const first = await signalOccurrenceKey("ORG-001", "ACC-001", "EBM Expand", ["SIG-x", "SIG-y"]);
    const replay = await signalOccurrenceKey("ORG-001", "ACC-001", "EBM Expand", ["SIG-x", "SIG-y"]);
    expect(replay).toBe(first);
  });

  it("is order-insensitive — reordered signal group keeps the key (case 5)", async () => {
    const asc = await signalOccurrenceKey("ORG-001", "ACC-001", "EBM Hire", ["SIG-1", "SIG-2", "SIG-3"]);
    const shuffled = await signalOccurrenceKey("ORG-001", "ACC-001", "EBM Hire", ["SIG-3", "SIG-1", "SIG-2"]);
    expect(shuffled).toBe(asc);
  });

  it("never collides across accounts, orgs, or moment codes (case 6)", async () => {
    const base = await signalOccurrenceKey("ORG-001", "ACC-001", "EBM Expand", ["SIG-1"]);
    const otherAccount = await signalOccurrenceKey("ORG-001", "ACC-002", "EBM Expand", ["SIG-1"]);
    const otherOrg = await signalOccurrenceKey("ORG-002", "ACC-001", "EBM Expand", ["SIG-1"]);
    const otherMoment = await signalOccurrenceKey("ORG-001", "ACC-001", "EBM Hire", ["SIG-1"]);
    expect(new Set([base, otherAccount, otherOrg, otherMoment]).size).toBe(4);
  });

  it("embeds the tenant scope in plaintext for observability", async () => {
    const key = await signalOccurrenceKey("ORG-001", "ACC-009", "EBM Season", ["SIG-1"]);
    expect(key.startsWith("SIGNAL:ORG-001:ACC-009:EBM Season:")).toBe(true);
  });
});
