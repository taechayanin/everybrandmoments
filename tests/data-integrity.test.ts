import { describe, expect, it } from "vitest";
import { MASTER_MOMENTS, momentByCode } from "@/lib/domain/master-moments";
import { MOMENT_CODES } from "@/lib/domain/moment";
import { ACCOUNTS, accountById } from "@/lib/infrastructure/mock/accounts";
import { MOMENT_EVENTS, eventById } from "@/lib/infrastructure/mock/events";
import { APPOINTMENTS, OPPORTUNITIES } from "@/lib/infrastructure/mock/opportunities";
import { SOLUTIONS, solutionById } from "@/lib/infrastructure/mock/solutions";
import { userById } from "@/lib/infrastructure/mock/users";

// Mock data / README / tests must not drift (refactor plan §48) — every
// reference must resolve; renames break here before they break the UI.

describe("Master moments", () => {
  it("has exactly the 20 canonical codes", () => {
    expect(MASTER_MOMENTS).toHaveLength(20);
    expect(new Set(MASTER_MOMENTS.map((m) => m.code))).toEqual(new Set(MOMENT_CODES));
  });

  it("nextMoments all reference valid codes", () => {
    for (const m of MASTER_MOMENTS) {
      for (const next of m.nextMoments) {
        expect(momentByCode.has(next), `${m.code} → ${next}`).toBe(true);
      }
    }
  });
});

describe("Solutions", () => {
  it("reference valid moments and next moments", () => {
    for (const s of SOLUTIONS) {
      expect(momentByCode.has(s.moment), `${s.id} moment`).toBe(true);
      expect(momentByCode.has(s.nextMoment), `${s.id} nextMoment`).toBe(true);
    }
  });

  it("cross-sell relations are IDs that resolve (never names)", () => {
    for (const s of SOLUTIONS) {
      for (const id of s.crossSellSolutionIds) {
        expect(id.startsWith("SOL-"), `${s.id} → ${id}`).toBe(true);
        expect(solutionById.has(id), `${s.id} → ${id}`).toBe(true);
      }
    }
  });
});

describe("Moment events", () => {
  it("has at least 50 events", () => {
    expect(MOMENT_EVENTS.length).toBeGreaterThanOrEqual(50);
  });

  it("all references resolve", () => {
    for (const e of MOMENT_EVENTS) {
      expect(accountById.has(e.accountId), `${e.id} account`).toBe(true);
      expect(momentByCode.has(e.momentType), `${e.id} moment`).toBe(true);
      expect(momentByCode.has(e.nextExpectedMoment), `${e.id} next`).toBe(true);
      expect(userById.has(e.ownerId), `${e.id} owner`).toBe(true);
      for (const sid of e.recommendedSolutionIds) {
        expect(solutionById.has(sid), `${e.id} solution ${sid}`).toBe(true);
      }
    }
  });
});

describe("Accounts", () => {
  it("owners and purchase moments resolve", () => {
    for (const a of ACCOUNTS) {
      expect(userById.has(a.ownerId), `${a.id} owner`).toBe(true);
      for (const p of a.purchases) {
        expect(momentByCode.has(p.moment), `${a.id} purchase ${p.item}`).toBe(true);
      }
    }
  });
});

describe("Opportunities & appointments", () => {
  it("all references resolve", () => {
    for (const o of OPPORTUNITIES) {
      expect(accountById.has(o.accountId), `${o.id} account`).toBe(true);
      expect(eventById.has(o.momentEventId), `${o.id} event`).toBe(true);
      expect(userById.has(o.ownerId), `${o.id} owner`).toBe(true);
    }
    for (const a of APPOINTMENTS) {
      expect(accountById.has(a.accountId), `${a.id} account`).toBe(true);
      expect(eventById.has(a.momentEventId), `${a.id} event`).toBe(true);
      expect(userById.has(a.consultantId), `${a.id} consultant`).toBe(true);
    }
  });
});
