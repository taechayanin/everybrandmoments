import { describe, expect, it } from "vitest";
import { createNote } from "@/lib/application/activities/create-note";
import { logCall } from "@/lib/application/activities/log-call";
import { logMeeting } from "@/lib/application/activities/log-meeting";
import { getAccountTimeline } from "@/lib/application/activities/get-account-timeline";
import { CrmError } from "@/lib/application/activities/shared";
import { createFollowUp } from "@/lib/application/tasks/create-follow-up";
import { getMyWorkToday } from "@/lib/application/tasks/get-my-work-today";
import type { AccountId, TaskId, UserId } from "@/lib/types";

// CRM Step 3: application-layer rules on top of the Step-2 repositories.
// getRepositories() resolves to the mock adapter here (no MOMENT_OS_DATA_SOURCE).

const OWNER = "USR-001" as UserId;

let seq = 0;
function rid(): string {
  seq += 1;
  return `uc-req-${String(seq).padStart(4, "0")}`;
}

describe("interaction use cases", () => {
  it("create note succeeds and stores the note body", async () => {
    const result = await createNote({
      accountId: "ACC-006",
      body: "ลูกค้าถามราคา Uniform",
      clientRequestId: rid(),
      createdBy: OWNER,
    });
    expect(result.deduped).toBe(false);
    expect(result.activity.activityType).toBe("NOTE");
    expect(result.activity.body).toBe("ลูกค้าถามราคา Uniform");
  });

  it("log call succeeds with outcome + duration metadata", async () => {
    const result = await logCall({
      accountId: "ACC-006",
      occurredAt: "2026-08-23T06:00:00Z",
      outcome: "INTERESTED",
      durationMinutes: 12,
      clientRequestId: rid(),
      createdBy: OWNER,
    });
    expect(result.activity.activityType).toBe("CALL");
    expect(result.activity.outcome).toBe("INTERESTED");
    expect(result.activity.metadata).toMatchObject({ kind: "CALL", durationMinutes: 12 });
  });

  it("log meeting succeeds with typed metadata and next state", async () => {
    const result = await logMeeting({
      accountId: "ACC-006",
      occurredAt: "2026-08-23T07:00:00Z",
      meetingType: "CUSTOMER_OFFICE",
      body: "คุยแผนเปิดสาขาบางนา งบ ~300K",
      budgetMin: 200_000,
      budgetMax: 300_000,
      nextState: "PROPOSAL",
      clientRequestId: rid(),
      createdBy: OWNER,
    });
    expect(result.activity.activityType).toBe("MEETING");
    expect(result.activity.metadata).toMatchObject({
      kind: "MEETING",
      meetingType: "CUSTOMER_OFFICE",
      budgetMax: 300_000,
      nextState: "PROPOSAL",
    });
  });

  it("creates the follow-up task together with the interaction", async () => {
    const result = await createNote({
      accountId: "ACC-006",
      body: "รอตัวอย่างงาน",
      nextAction: "ส่ง sample วันศุกร์",
      nextActionAt: "2026-08-28T09:00:00Z",
      createFollowUp: true,
      clientRequestId: rid(),
      createdBy: OWNER,
    });
    expect(result.task).toBeDefined();
    expect(result.task?.title).toBe("ส่ง sample วันศุกร์");
    expect(result.task?.dueDate).toBe("2026-08-28");
    expect(result.task?.assigneeId).toBe(OWNER);
  });

  it("a repeated interaction stays one activity + one task (review req 3)", async () => {
    const input = {
      accountId: "ACC-007",
      body: "double click",
      nextAction: "โทรกลับ",
      nextActionAt: "2026-08-26T09:00:00Z",
      createFollowUp: true,
      clientRequestId: rid(),
      createdBy: OWNER,
    } as const;
    const first = await createNote(input);
    const retry = await createNote(input);
    expect(retry.deduped).toBe(true);
    expect(retry.activity.id).toBe(first.activity.id);
    expect(retry.task?.id).toBe(first.task?.id);
    const timeline = await getAccountTimeline("ACC-007" as AccountId);
    expect(timeline.items.filter((a) => a.body === "double click")).toHaveLength(1);
  });

  it("FOLLOW_UP next state without a next action is rejected (spec §46)", async () => {
    await expect(
      createNote({
        accountId: "ACC-006",
        body: "x",
        nextState: "FOLLOW_UP",
        clientRequestId: rid(),
        createdBy: OWNER,
      }),
    ).rejects.toThrow(CrmError);
  });

  it("FOLLOW_UP with an action but no scheduled date is rejected (P1 fix 2)", async () => {
    await expect(
      createNote({
        accountId: "ACC-006",
        body: "x",
        nextState: "FOLLOW_UP",
        nextAction: "โทรกลับ",
        clientRequestId: rid(),
        createdBy: OWNER,
      }),
    ).rejects.toThrow(/nextActionAt/);
    await expect(
      createNote({
        accountId: "ACC-006",
        body: "x",
        createFollowUp: true,
        nextAction: "โทรกลับ",
        clientRequestId: rid(),
        createdBy: OWNER,
      }),
    ).rejects.toThrow(/nextActionAt/);
  });

  it("rejects a contact belonging to another account (review req 2)", async () => {
    await expect(
      createNote({
        accountId: "ACC-001",
        contactId: "CT-ACC-002-1", // ACC-002's contact
        body: "cross-account",
        clientRequestId: rid(),
        createdBy: OWNER,
      }),
    ).rejects.toThrow(/Contact/);
  });

  it("rejects an opportunity belonging to another account (review req 2)", async () => {
    // Mock data: OPP-2026-001 belongs to ACC-001 — reference it from ACC-002.
    await expect(
      logCall({
        accountId: "ACC-002",
        occurredAt: "2026-08-23T06:00:00Z",
        outcome: "CONNECTED",
        opportunityId: "OPP-2026-001",
        clientRequestId: rid(),
        createdBy: OWNER,
      }),
    ).rejects.toThrow(/Opportunity/);
  });

  it("org isolation: ids invisible to this org are rejected, account or ref", async () => {
    await expect(
      createNote({
        accountId: "ACC-999", // not in this organization's store
        body: "x",
        clientRequestId: rid(),
        createdBy: OWNER,
      }),
    ).rejects.toThrow(/Account/);
    await expect(
      createNote({
        accountId: "ACC-001",
        contactId: "CT-OTHERORG-1",
        body: "x",
        clientRequestId: rid(),
        createdBy: OWNER,
      }),
    ).rejects.toThrow(/Contact/);
  });

  it("timeline paginates through the use case with contact hydration", async () => {
    const acc = "ACC-008" as AccountId;
    for (let i = 0; i < 23; i += 1) {
      await createNote({
        accountId: acc,
        contactId: `CT-${acc}-1`,
        body: `note ${i}`,
        occurredAt: `2026-06-${String((i % 28) + 1).padStart(2, "0")}T05:00:00Z`,
        clientRequestId: rid(),
        createdBy: OWNER,
      });
    }
    const page1 = await getAccountTimeline(acc, { limit: 20 });
    expect(page1.items).toHaveLength(20);
    expect(page1.nextCursor).toBeDefined();
    expect(page1.contactsById.get(`CT-${acc}-1`)?.name).toBeDefined();
    const page2 = await getAccountTimeline(acc, { limit: 20, cursor: page1.nextCursor });
    expect(page2.items).toHaveLength(3);
    const ids = new Set([...page1.items, ...page2.items].map((a) => a.id));
    expect(ids.size).toBe(23);
  });
});

describe("task use cases", () => {
  it("derives the account from the referenced opportunity", async () => {
    const { task } = await createFollowUp({
      title: "ตาม proposal",
      opportunityId: "OPP-2026-001", // ACC-001's opportunity
      priority: "HIGH",
      clientRequestId: rid(),
      createdBy: OWNER,
    });
    expect(task.accountId).toBe("ACC-001");
    expect(task.assigneeId).toBe(OWNER); // defaults to creator
  });

  it("my work today separates overdue / today / upcoming at the boundary", async () => {
    const assignee = "USR-002" as UserId;
    // Band dates derive from the same clock the use case reads (mock mode
    // pins it to MOCK_TODAY), so the test checks boundary semantics exactly.
    const { getClock } = await import("@/lib/services/clock");
    const base = getClock().now();
    const today = base.toISOString().slice(0, 10);
    const shift = (days: number) =>
      new Date(base.getTime() + days * 86_400_000).toISOString().slice(0, 10);
    for (const [title, due] of [
      ["yesterday", shift(-1)],
      ["today", today],
      ["tomorrow", shift(1)],
    ] as const) {
      await createFollowUp({
        title,
        accountId: "ACC-001",
        dueDate: due,
        assigneeId: assignee,
        clientRequestId: rid(),
        createdBy: OWNER,
      });
    }
    const view = await getMyWorkToday(assignee);
    expect(view.overdue.map((t) => t.title)).toEqual(["yesterday"]);
    expect(view.dueToday.map((t) => t.title)).toEqual(["today"]);
    expect(view.upcoming.map((t) => t.title)).toEqual(["tomorrow"]);
  });

  it("completing a missing task reports changed=false", async () => {
    const { completeTask } = await import("@/lib/application/tasks/create-follow-up");
    const result = await completeTask("TSK-does-not-exist" as TaskId);
    expect(result.changed).toBe(false);
    expect(result.task).toBeNull();
  });
});

describe("organization timezone boundaries (P1 fix 3)", () => {
  it("orgLocalDate flips to the next day at Bangkok midnight, not UTC midnight", async () => {
    const { orgLocalDate } = await import("@/lib/services/org-time");
    // 23:59 ICT — still the 22nd in Bangkok even though UTC says 16:59 same day.
    expect(orgLocalDate(new Date("2026-08-22T16:59:00Z"))).toBe("2026-08-22");
    // 00:00 ICT — Bangkok is already the 23rd while UTC is still the 22nd.
    expect(orgLocalDate(new Date("2026-08-22T17:00:00Z"))).toBe("2026-08-23");
    // Late UTC evening: UTC date 22nd, Bangkok date 23rd.
    expect(orgLocalDate(new Date("2026-08-22T20:30:00Z"))).toBe("2026-08-23");
    // Configurable design: an explicit zone overrides the org default.
    expect(orgLocalDate(new Date("2026-08-22T20:30:00Z"), "UTC")).toBe("2026-08-22");
  });
});

describe("activity mutation audit (P1 fix 4)", () => {
  it("update and delete write audit records with actor; retry-delete audits once", async () => {
    const { MOCK_AUDIT_LOGS } = await import("@/lib/infrastructure/mock/repositories");
    const { updateActivity, deleteActivity } = await import(
      "@/lib/application/activities/update-activity"
    );
    const { activity } = await createNote({
      accountId: "ACC-006",
      body: "ก่อนแก้",
      clientRequestId: rid(),
      createdBy: OWNER,
    });

    await updateActivity({ activityId: activity.id, actor: OWNER, body: "หลังแก้" });
    const updated = MOCK_AUDIT_LOGS.filter(
      (r) => r.action === "ACTIVITY_UPDATED" && r.entityId === activity.id,
    );
    expect(updated).toHaveLength(1);
    expect(updated[0].userId).toBe(OWNER);
    expect(updated[0].before).toMatchObject({ body: "ก่อนแก้" });
    expect(updated[0].after).toMatchObject({ body: "หลังแก้" });

    await deleteActivity(activity.id, OWNER);
    await deleteActivity(activity.id, OWNER); // idempotent retry
    const deleted = MOCK_AUDIT_LOGS.filter(
      (r) => r.action === "ACTIVITY_DELETED" && r.entityId === activity.id,
    );
    expect(deleted).toHaveLength(1);
    expect(deleted[0].userId).toBe(OWNER);
  });
});
