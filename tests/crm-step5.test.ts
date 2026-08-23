import { describe, expect, it } from "vitest";
import { createMockRepositories } from "@/lib/infrastructure/mock/repositories";
import { confirmMoment, rejectMoment } from "@/lib/application/moments/verify-moment";
import {
  deleteActivity,
  updateActivity,
} from "@/lib/application/activities/update-activity";
import { getMyWorkToday } from "@/lib/application/tasks/get-my-work-today";
import { getOpportunityQueue } from "@/lib/application/opportunities/get-opportunity-queue";
import { CrmError } from "@/lib/application/activities/shared";
import { momentActivityKey } from "@/lib/domain/activity";
import { orgLocalDate } from "@/lib/services/org-time";
import { getClock } from "@/lib/services/clock";
import { isActiveMomentStatus } from "@/lib/domain/moment";
import { priorityOf, totalScore } from "@/lib/domain/score";
import type {
  AccountId,
  ActivityId,
  MomentEventId,
  OpportunityId,
  UserId,
} from "@/lib/types";

// Step 5: My Work Today boundaries, opportunity activity integration, and
// system moment activities — all on the shared mock adapter (the executable
// spec; D1 mirrors the SQL side, smoke-tested in the review packet).

const repos = createMockRepositories();
const OWNER = "USR-001" as UserId;

let seq = 0;
function rid(): string {
  seq += 1;
  return `s5-req-${String(seq).padStart(4, "0")}`;
}

describe("My Work Today — org-local day boundaries", () => {
  it("bands split on the Asia/Bangkok day, not the UTC day", async () => {
    // 17:30Z is still Aug 22 in UTC but already Aug 23 in Bangkok.
    const bkkToday = orgLocalDate(new Date("2026-08-22T17:30:00Z"));
    expect(bkkToday).toBe("2026-08-23");
    const assignee = "USR-005" as UserId;
    await repos.tasks.create({
      title: "due-22", accountId: "ACC-001" as AccountId, dueDate: "2026-08-22",
      assigneeId: assignee, priority: "NORMAL", clientRequestId: rid(),
    });
    await repos.tasks.create({
      title: "due-23", accountId: "ACC-001" as AccountId, dueDate: "2026-08-23",
      assigneeId: assignee, priority: "NORMAL", clientRequestId: rid(),
    });
    // With the Bangkok day (23rd): the 22nd is OVERDUE — a UTC calendar day
    // would still call it "today".
    const overdue = await repos.tasks.listByAssignee(assignee, "overdue", bkkToday, 10);
    const dueToday = await repos.tasks.listByAssignee(assignee, "today", bkkToday, 10);
    expect(overdue.map((t) => t.title)).toEqual(["due-22"]);
    expect(dueToday.map((t) => t.title)).toEqual(["due-23"]);
  });

  it("today/upcoming boundaries and completed tasks excluded", async () => {
    const assignee = "USR-006" as UserId;
    const today = orgLocalDate(getClock().now());
    const mk = (title: string, dueDate: string) =>
      repos.tasks.create({
        title, accountId: "ACC-001" as AccountId, dueDate,
        assigneeId: assignee, priority: "NORMAL", clientRequestId: rid(),
      });
    await mk("t-today", today);
    const { task: done } = await mk("t-done", today);
    await repos.tasks.complete(done.id);
    const view = await getMyWorkToday(assignee);
    expect(view.today).toBe(today);
    expect(view.dueToday.map((t) => t.title)).toEqual(["t-today"]); // DONE excluded
    expect(view.overdue).toEqual([]);
    expect(view.upcoming).toEqual([]);
  });

  it("assignee isolation — another user's tasks never appear", async () => {
    const view = await getMyWorkToday("USR-007" as UserId);
    expect(view.overdue.length + view.dueToday.length + view.upcoming.length).toBe(0);
  });

  it("workStats matches a full-scan computation", async () => {
    const today = orgLocalDate(getClock().now());
    const all = await repos.moments.listAll();
    const stats = await repos.moments.workStats(today);
    expect(stats.activeHot).toBe(
      all.filter(
        (e) => isActiveMomentStatus(e.status) && priorityOf(totalScore(e.score)) === "HOT",
      ).length,
    );
    expect(stats.newToday).toBe(all.filter((e) => e.detectedAt === today).length);
    expect(stats.wonThisMonth).toBe(
      all.filter(
        (e) => e.status === "Won" && e.expectedEventDate.slice(0, 7) === today.slice(0, 7),
      ).length,
    );
  });

  it("listFiltered bounds the next-30-days window", async () => {
    const today = orgLocalDate(getClock().now());
    const to = new Date(new Date(`${today}T00:00:00Z`).getTime() + 30 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const events = await repos.moments.listFiltered({
      activeOnly: true, expectedFrom: today, expectedTo: to, limit: 20,
    });
    for (const e of events) {
      expect(e.expectedEventDate >= today && e.expectedEventDate <= to).toBe(true);
      expect(isActiveMomentStatus(e.status)).toBe(true);
    }
  });
});

describe("Opportunity activity integration", () => {
  it("exposes last activity, days since, and next follow-up via bulk reads", async () => {
    const opp = "OPP-2026-001" as OpportunityId; // ACC-001's opportunity
    await repos.activities.create({
      accountId: "ACC-001" as AccountId,
      opportunityId: opp,
      activityType: "CALL",
      outcome: "CONNECTED",
      occurredAt: "2026-08-20T04:00:00Z",
      createdBy: OWNER,
      clientRequestId: rid(),
    });
    await repos.tasks.create({
      title: "ตาม proposal OPP-1",
      accountId: "ACC-001" as AccountId,
      opportunityId: opp,
      dueDate: "2026-08-25",
      assigneeId: OWNER,
      priority: "HIGH",
      clientRequestId: rid(),
    });
    const view = await getOpportunityQueue();
    const row = view.rows.find((r) => r.opportunity.id === opp);
    expect(row).toBeDefined();
    expect(row!.lastActivityAt).toBe("2026-08-20T04:00:00Z");
    // Clock pinned to 2026-08-22T00:00Z; last activity 2026-08-20T04:00Z →
    // 1.83 elapsed days → floor = 1 full day since last contact.
    expect(row!.daysSinceLastActivity).toBe(1);
    expect(row!.nextFollowUp?.title).toBe("ตาม proposal OPP-1");
  });

  it("next-open-task map excludes DONE and picks the earliest due", async () => {
    const opp = "OPP-2026-002" as OpportunityId;
    const mk = (title: string, dueDate: string) =>
      repos.tasks.create({
        title, opportunityId: opp, accountId: "ACC-002" as AccountId,
        dueDate, assigneeId: OWNER, priority: "NORMAL", clientRequestId: rid(),
      });
    const { task: early } = await mk("early", "2026-08-24");
    await mk("late", "2026-09-01");
    const map1 = await repos.tasks.nextOpenTaskByOpportunities([opp]);
    expect(map1.get(opp)?.title).toBe("early");
    await repos.tasks.complete(early.id);
    const map2 = await repos.tasks.nextOpenTaskByOpportunities([opp]);
    expect(map2.get(opp)?.title).toBe("late"); // DONE excluded
  });
});

describe("Zero-activity no-contact risk (Step-5 fix 2)", () => {
  const NOW = new Date("2026-08-22T00:00:00Z");
  const daysAgo = (n: number) =>
    new Date(NOW.getTime() - n * 86_400_000).toISOString();

  it("canonical rule covers all five reviewer cases", async () => {
    const { isOpportunityAtRisk, daysSinceOpportunityContact } = await import(
      "@/lib/domain/opportunity"
    );
    // zero activity + 2 days -> not at risk
    expect(isOpportunityAtRisk("Discovery", null, daysAgo(2), NOW)).toBe(false);
    // zero activity + 10 days -> at risk (falls back to created_at)
    expect(isOpportunityAtRisk("Discovery", null, daysAgo(10), NOW)).toBe(true);
    // activity yesterday -> not at risk
    expect(isOpportunityAtRisk("Proposal", daysAgo(1), daysAgo(30), NOW)).toBe(false);
    // activity 8 days ago -> at risk
    expect(isOpportunityAtRisk("Proposal", daysAgo(8), daysAgo(30), NOW)).toBe(true);
    // closed opportunities excluded
    expect(isOpportunityAtRisk("Won", daysAgo(30), daysAgo(60), NOW)).toBe(false);
    expect(isOpportunityAtRisk("Lost", null, daysAgo(60), NOW)).toBe(false);
    // exact boundary: 7 full days = at risk
    expect(isOpportunityAtRisk("Discovery", daysAgo(7), daysAgo(30), NOW)).toBe(true);
    expect(daysSinceOpportunityContact(null, daysAgo(10), NOW)).toBe(10);
  });

  it("counter and per-row display share the rule through the queue view", async () => {
    const won = await repos.opportunities.create({
      momentEventId: "ME-2026-000001" as MomentEventId,
      accountId: "ACC-001" as AccountId,
      name: "closed won — no risk",
      expectedRevenue: 100,
      expectedGP: 0.4,
      closeDate: "2026-08-01",
      stage: "Won",
      ownerId: OWNER,
      nextAction: "-",
    });
    const view = await getOpportunityQueue();
    // mock opportunities were created 2026-08-01 (21 days before the pinned
    // clock) — every open row without activity must be at risk, and the
    // counter equals the rows flagged at risk.
    const wonRow = view.rows.find((r) => r.opportunity.id === won.id);
    expect(wonRow?.atRisk).toBe(false);
    const zeroActivityOld = view.rows.find(
      (r) => r.lastActivityAt === null && r.opportunity.stage === "Solution Design",
    );
    expect(zeroActivityOld?.atRisk).toBe(true);
    expect(zeroActivityOld?.daysSinceContact).toBeGreaterThanOrEqual(7);
    expect(view.atRiskCount).toBe(view.rows.filter((r) => r.atRisk).length);
  });
});

describe("System moment activities", () => {
  async function freshMoment(accountId: AccountId): Promise<MomentEventId> {
    const event = await repos.moments.create({
      accountId,
      momentType: "EBM Expand",
      subMoment: "ทดสอบ system activity",
      stakeholders: [],
      triggerSource: "Social Signal",
      triggerDetail: "test",
      expectedEventDate: "2026-10-01",
      score: { businessFit: 20, intent: 20, timing: 15, wallet: 10, relationship: 8 },
      potentialWalletMin: 0,
      potentialWalletMax: 0,
      ownerId: OWNER,
    });
    return event.id;
  }

  it("MOMENT_VERIFIED lands once even when confirm is repeated", async () => {
    const acc = "ACC-014" as AccountId;
    const id = await freshMoment(acc);
    const first = await confirmMoment(id, OWNER);
    const retry = await confirmMoment(id, OWNER);
    expect(first.changed).toBe(true);
    expect(retry.changed).toBe(false);
    const page = await repos.activities.listByAccount(acc, {
      types: ["MOMENT_VERIFIED"],
    });
    const rows = page.items.filter((a) => a.momentEventId === id);
    expect(rows).toHaveLength(1);
    expect(rows[0].createdBy).toBe(OWNER);
  });

  it("MOMENT_REJECTED lands once with the reason", async () => {
    const acc = "ACC-015" as AccountId;
    const id = await freshMoment(acc);
    await rejectMoment(id, OWNER, "ข้อมูลไม่พอ");
    await rejectMoment(id, OWNER, "ข้อมูลไม่พอ");
    const page = await repos.activities.listByAccount(acc, {
      types: ["MOMENT_REJECTED"],
    });
    const rows = page.items.filter((a) => a.momentEventId === id);
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toBe("ข้อมูลไม่พอ");
  });

  it("MOMENT_DETECTED key is deterministic per event (worker dedupe)", () => {
    expect(momentActivityKey("DETECTED", "ME-1")).toBe("MOMENT-DETECTED:ME-1");
    expect(momentActivityKey("VERIFIED", "ME-1")).toBe("MOMENT-VERIFIED:ME-1");
    expect(momentActivityKey("REJECTED", "ME-1")).toBe("MOMENT-REJECTED:ME-1");
    expect(momentActivityKey("DETECTED", "ME-1")).toBe(momentActivityKey("DETECTED", "ME-1"));
  });

  it("system activities cannot be edited or deleted", async () => {
    const acc = "ACC-016" as AccountId;
    const id = await freshMoment(acc);
    await confirmMoment(id, OWNER);
    const page = await repos.activities.listByAccount(acc, {
      types: ["MOMENT_VERIFIED"],
    });
    const system = page.items.find((a) => a.momentEventId === id)!;
    await expect(
      updateActivity({ activityId: system.id as ActivityId, actor: OWNER, body: "แก้" }),
    ).rejects.toThrow(CrmError);
    await expect(
      deleteActivity(system.id as ActivityId, OWNER),
    ).rejects.toThrow(CrmError);
  });
});
