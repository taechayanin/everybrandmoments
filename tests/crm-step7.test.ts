import { describe, expect, it } from "vitest";
import { createMockRepositories } from "@/lib/infrastructure/mock/repositories";
import {
  getAccountList,
  isAccountListFilter,
} from "@/lib/application/accounts/get-account-list";
import { getRevenueJourney } from "@/lib/application/moments/get-journey";
import { getClock } from "@/lib/services/clock";
import { orgLocalDate } from "@/lib/services/org-time";
import type { AccountId, UserId } from "@/lib/types";

// Step 7 — operational account list: one bounded read model, derived filters,
// org-local day semantics. Mock adapter = executable spec (D1 mirrors the
// bulk queries; verified in the packet).

const repos = createMockRepositories();
const OWNER = "USR-001" as UserId;

let seq = 0;
function rid(): string {
  seq += 1;
  return `s7-req-${String(seq).padStart(4, "0")}`;
}

const TODAY = orgLocalDate(getClock().now());
function shiftDays(days: number): string {
  return new Date(
    new Date(`${TODAY}T00:00:00Z`).getTime() + days * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);
}

describe("account list read model", () => {
  it("last activity + days-since populate; accounts without activity show null", async () => {
    await repos.activities.create({
      accountId: "ACC-018" as AccountId,
      activityType: "CALL",
      outcome: "CONNECTED",
      occurredAt: "2026-08-20T04:00:00Z", // 1.83 elapsed days → floor = 1
      createdBy: OWNER,
      clientRequestId: rid(),
    });
    const view = await getAccountList("ALL", OWNER);
    const withActivity = view.rows.find((r) => r.account.id === "ACC-018");
    expect(withActivity?.daysSinceLastActivity).toBe(1);
    const without = view.rows.find((r) => r.account.id === "ACC-019");
    expect(without?.lastActivityAt).toBeNull();
    expect(without?.daysSinceLastActivity).toBeNull();
  });

  it("next follow-up appears and NO_FOLLOWUP filters it out", async () => {
    await repos.tasks.create({
      accountId: "ACC-018" as AccountId,
      title: "โทรตาม ACC-018",
      dueDate: shiftDays(2),
      assigneeId: OWNER,
      priority: "NORMAL",
      clientRequestId: rid(),
    });
    const all = await getAccountList("ALL", OWNER);
    expect(
      all.rows.find((r) => r.account.id === "ACC-018")?.nextFollowUp?.title,
    ).toBe("โทรตาม ACC-018");

    const noFollowUp = await getAccountList("NO_FOLLOWUP", OWNER);
    expect(noFollowUp.rows.some((r) => r.account.id === "ACC-018")).toBe(false);
    expect(noFollowUp.rows.length).toBeGreaterThan(0); // others still lack tasks
  });

  it("no-contact thresholds include never-contacted accounts (org-local days)", async () => {
    const nc7 = await getAccountList("NO_CONTACT_7", OWNER);
    // ACC-018 was contacted 1 day ago -> excluded at every threshold.
    expect(nc7.rows.some((r) => r.account.id === "ACC-018")).toBe(false);
    // Never-contacted accounts are always no-contact.
    expect(nc7.rows.some((r) => r.account.id === "ACC-019")).toBe(true);
    const nc30 = await getAccountList("NO_CONTACT_30", OWNER);
    expect(nc30.rows.some((r) => r.account.id === "ACC-019")).toBe(true);
  });

  it("AT_RISK matches account health exactly", async () => {
    const view = await getAccountList("AT_RISK", OWNER);
    expect(view.rows.length).toBeGreaterThan(0);
    for (const row of view.rows) expect(row.account.health).toBe("At Risk");
  });

  it("HOT filter keeps only accounts whose top active moment is HOT", async () => {
    const view = await getAccountList("HOT", OWNER);
    expect(view.rows.length).toBeGreaterThan(0);
    for (const row of view.rows) {
      expect(row.priority).toBe("HOT");
      expect(row.momentScore).toBeGreaterThanOrEqual(85);
    }
  });

  it("MY filter scopes to the current user's accounts", async () => {
    const view = await getAccountList("MY", OWNER);
    for (const row of view.rows) expect(row.account.ownerId).toBe(OWNER);
  });

  it("DUE_TODAY and OVERDUE use the org-local day", async () => {
    await repos.tasks.create({
      accountId: "ACC-016" as AccountId, title: "นัดวันนี้", dueDate: TODAY,
      assigneeId: OWNER, priority: "NORMAL", clientRequestId: rid(),
    });
    await repos.tasks.create({
      accountId: "ACC-015" as AccountId, title: "เลยกำหนด", dueDate: shiftDays(-3),
      assigneeId: OWNER, priority: "NORMAL", clientRequestId: rid(),
    });
    const dueToday = await getAccountList("DUE_TODAY", OWNER);
    expect(dueToday.rows.some((r) => r.account.id === "ACC-016")).toBe(true);
    expect(dueToday.rows.some((r) => r.account.id === "ACC-015")).toBe(false);
    const overdue = await getAccountList("OVERDUE", OWNER);
    expect(overdue.rows.some((r) => r.account.id === "ACC-015")).toBe(true);
    expect(overdue.rows.some((r) => r.account.id === "ACC-016")).toBe(false);
  });

  it("OPEN_OPP shows pipeline value; sorting puts higher moment scores first", async () => {
    const view = await getAccountList("OPEN_OPP", OWNER);
    expect(view.rows.length).toBeGreaterThan(0);
    for (const row of view.rows) {
      expect(row.openOpportunityCount).toBeGreaterThan(0);
      expect(row.openPipelineValue).toBeGreaterThan(0);
    }
    const all = await getAccountList("ALL", OWNER);
    for (let i = 1; i < all.rows.length; i += 1) {
      expect(all.rows[i - 1].momentScore ?? -1).toBeGreaterThanOrEqual(
        all.rows[i].momentScore ?? -1,
      );
    }
  });

  it("stays bounded: rows ≤ 50 and unknown org data never leaks", async () => {
    const view = await getAccountList("ALL", OWNER);
    expect(view.rows.length).toBeLessThanOrEqual(50);
    expect(view.totalBeforeFilter).toBeLessThanOrEqual(100);
    // Bulk lookups with foreign ids resolve to nothing (org isolation).
    const foreign = await repos.activities.lastActivityByAccounts([
      "ACC-OTHERORG-1" as AccountId,
    ]);
    expect(foreign.size).toBe(0);
    const foreignTasks = await repos.tasks.nextOpenTaskByAccounts([
      "ACC-OTHERORG-1" as AccountId,
    ]);
    expect(foreignTasks.size).toBe(0);
  });

  it("filter param validation guards unknown values", () => {
    expect(isAccountListFilter("HOT")).toBe(true);
    expect(isAccountListFilter("DROP TABLE")).toBe(false);
  });
});

describe("revenue journey read model (last listAll closed)", () => {
  it("returns only pipeline/won statuses, bounded and hydrated", async () => {
    const rows = await getRevenueJourney();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(100);
    const allowed = new Set([
      "Qualified", "Meeting Booked", "Discovery Completed", "Solution Design",
      "Proposal", "Negotiation", "Won", "Delivery",
    ]);
    for (const row of rows) {
      expect(allowed.has(row.event.status)).toBe(true);
      expect(row.accountName).not.toBe(row.event.accountId); // hydrated name
    }
  });
});
