import { describe, expect, it } from "vitest";
import { createMockRepositories } from "@/lib/infrastructure/mock/repositories";
import type { AccountId, ActivityId, OpportunityId, UserId } from "@/lib/types";

// CRM Step 2: repository behavior both adapters must share. The mock is the
// executable spec; the D1 adapter mirrors the same idempotency keys, keyset
// ordering, and band rules (verified against local D1 in the review packet).

const repos = createMockRepositories();
const ACC = "ACC-001" as AccountId;
const OWNER = "USR-001" as UserId;

let seq = 0;
function rid(): string {
  seq += 1;
  return `test-req-${String(seq).padStart(4, "0")}`;
}

function noteInput(overrides: Record<string, unknown> = {}) {
  return {
    accountId: ACC,
    activityType: "NOTE" as const,
    body: "ลูกค้าสนใจ",
    occurredAt: "2026-08-23T04:00:00Z",
    createdBy: OWNER,
    clientRequestId: rid(),
    ...overrides,
  };
}

describe("ActivityRepository", () => {
  it("create is idempotent on clientRequestId", async () => {
    const input = noteInput();
    const first = await repos.activities.create(input);
    const replay = await repos.activities.create(input);
    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(replay.activity.id).toBe(first.activity.id);
  });

  it("keyset pagination pages newest-first without overlap", async () => {
    const acc = "ACC-002" as AccountId;
    for (let i = 0; i < 25; i += 1) {
      await repos.activities.create(
        noteInput({
          accountId: acc,
          occurredAt: `2026-07-${String((i % 28) + 1).padStart(2, "0")}T08:00:00Z`,
        }),
      );
    }
    const page1 = await repos.activities.listByAccount(acc, { limit: 20 });
    expect(page1.items).toHaveLength(20);
    expect(page1.nextCursor).toBeDefined();
    const page2 = await repos.activities.listByAccount(acc, {
      limit: 20,
      cursor: page1.nextCursor,
    });
    expect(page2.items).toHaveLength(5);
    expect(page2.nextCursor).toBeUndefined();
    const all = [...page1.items, ...page2.items];
    expect(new Set(all.map((a) => a.id)).size).toBe(25);
    for (let i = 1; i < all.length; i += 1) {
      const prev = `${all[i - 1].occurredAt}|${all[i - 1].id}`;
      const cur = `${all[i].occurredAt}|${all[i].id}`;
      expect(prev > cur).toBe(true);
    }
  });

  it("type filter and soft delete shape the timeline", async () => {
    const acc = "ACC-003" as AccountId;
    const call = await repos.activities.create(
      noteInput({ accountId: acc, activityType: "CALL", outcome: "CONNECTED" }),
    );
    await repos.activities.create(noteInput({ accountId: acc }));
    const calls = await repos.activities.listByAccount(acc, { types: ["CALL"] });
    expect(calls.items.map((a) => a.id)).toEqual([call.activity.id]);

    expect(await repos.activities.softDelete(call.activity.id, OWNER)).toBe(true);
    expect(await repos.activities.softDelete(call.activity.id, OWNER)).toBe(false);
    const after = await repos.activities.listByAccount(acc, {});
    expect(after.items.find((a) => a.id === call.activity.id)).toBeUndefined();
  });

  it("lastActivityByOpportunities returns the max occurred_at per opportunity", async () => {
    const opp = "OPP-901" as OpportunityId;
    await repos.activities.create(
      noteInput({ opportunityId: opp, occurredAt: "2026-08-01T00:00:00Z" }),
    );
    await repos.activities.create(
      noteInput({ opportunityId: opp, occurredAt: "2026-08-10T00:00:00Z" }),
    );
    const map = await repos.activities.lastActivityByOpportunities([opp]);
    expect(map.get(opp)).toBe("2026-08-10T00:00:00Z");
  });
});

describe("InteractionWriteRepository", () => {
  it("writes activity + follow-up task as one idempotent unit", async () => {
    const requestId = rid();
    const input = {
      activity: noteInput({ clientRequestId: requestId, nextAction: "ส่ง sample" }),
      followUpTask: {
        accountId: ACC,
        title: "ส่ง sample ศุกร์นี้",
        dueDate: "2026-08-28",
        assigneeId: OWNER,
        priority: "NORMAL" as const,
      },
    };
    const first = await repos.interactions.logInteraction(input);
    expect(first.deduped).toBe(false);
    expect(first.task?.title).toBe("ส่ง sample ศุกร์นี้");

    const replay = await repos.interactions.logInteraction(input);
    expect(replay.deduped).toBe(true);
    expect(replay.activity.id).toBe(first.activity.id);
    expect(replay.task?.id).toBe(first.task?.id);
  });

  it("rejects a missing clientRequestId", async () => {
    await expect(
      repos.interactions.logInteraction({
        activity: noteInput({ clientRequestId: undefined }),
      }),
    ).rejects.toThrow(/clientRequestId/);
  });
});

describe("TaskRepository", () => {
  it("complete is idempotent", async () => {
    const { task } = await repos.tasks.create({
      title: "โทรกลับ",
      accountId: ACC,
      priority: "NORMAL",
      clientRequestId: rid(),
    });
    expect(await repos.tasks.complete(task.id)).toBe(true);
    expect(await repos.tasks.complete(task.id)).toBe(false);
  });

  it("listByAssignee separates overdue / today / upcoming", async () => {
    const assignee = "USR-009" as UserId;
    const today = "2026-08-23";
    for (const [title, due] of [
      ["late", "2026-08-20"],
      ["now", "2026-08-23"],
      ["soon", "2026-08-30"],
    ] as const) {
      await repos.tasks.create({
        title,
        dueDate: due,
        assigneeId: assignee,
        priority: "NORMAL",
        clientRequestId: rid(),
      });
    }
    const overdue = await repos.tasks.listByAssignee(assignee, "overdue", today, 10);
    const dueToday = await repos.tasks.listByAssignee(assignee, "today", today, 10);
    const upcoming = await repos.tasks.listByAssignee(assignee, "upcoming", today, 10);
    expect(overdue.map((t) => t.title)).toEqual(["late"]);
    expect(dueToday.map((t) => t.title)).toEqual(["now"]);
    expect(upcoming.map((t) => t.title)).toEqual(["soon"]);
  });
});

describe("ContactRepository", () => {
  it("lists seeded contacts primary-first with buying role", async () => {
    const contacts = await repos.contacts.listByAccount(ACC);
    expect(contacts.length).toBeGreaterThan(0);
    expect(contacts[0].isPrimary).toBe(true);
    expect(contacts[0].buyingRole).toBe("DECISION_MAKER");
  });

  it("create and update round-trip", async () => {
    const { contact: created } = await repos.contacts.create({
      accountId: ACC,
      name: "คุณใหม่",
      jobTitle: "Procurement Manager",
      buyingRole: "PROCUREMENT",
    });
    const updated = await repos.contacts.update(created.id, {
      influenceLevel: "HIGH",
      phone: "081-000-0000",
    });
    expect(updated?.influenceLevel).toBe("HIGH");
    expect(updated?.phone).toBe("081-000-0000");
    expect(updated?.buyingRole).toBe("PROCUREMENT");
  });
});

describe("ContactRepository idempotency (Step-4 fix 2)", () => {
  it("a retried create with the same clientRequestId yields one contact", async () => {
    const input = {
      accountId: ACC,
      name: "คุณซ้ำ ทดสอบ",
      buyingRole: "CHAMPION" as const,
      clientRequestId: "contact-req-fixed-1",
    };
    const first = await repos.contacts.create(input);
    const retry = await repos.contacts.create(input);
    expect(first.created).toBe(true);
    expect(retry.created).toBe(false);
    expect(retry.contact.id).toBe(first.contact.id);
    const all = await repos.contacts.listByAccount(ACC);
    expect(all.filter((c) => c.name === "คุณซ้ำ ทดสอบ")).toHaveLength(1);
  });
});

describe("SuggestionRepository", () => {
  it("lists only PENDING suggestions for the account", async () => {
    const acc = "ACC-004" as AccountId;
    const { activity } = await repos.activities.create(noteInput({ accountId: acc }));
    const suggestion = await repos.suggestions.create({
      activityId: activity.id as ActivityId,
      payload: {
        summary: "ลูกค้าขยายสาขา",
        detectedMomentCodes: ["EBM Expand"],
        needs: ["Uniform"],
        recommendedSolutionIds: [],
        confidence: 0.8,
      },
      confidence: 0.8,
    });
    const pending = await repos.suggestions.listPendingByAccount(acc, 10);
    expect(pending.map((s) => s.id)).toContain(suggestion.id);
    const other = await repos.suggestions.listPendingByAccount("ACC-005" as AccountId, 10);
    expect(other.map((s) => s.id)).not.toContain(suggestion.id);
  });
});
