import { afterEach, describe, expect, it, vi } from "vitest";

// Step 4: server-action integration — the exact pipeline the UI calls
// (gate → zod strict → use case → repositories). revalidatePath needs a Next
// request context, so it is mocked; everything else runs for real on the
// mock adapter.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  completeTaskAction,
  createContactAction,
  createNoteAction,
  createTaskAction,
  loadTimelineAction,
  logCallAction,
  logMeetingAction,
} from "@/app/accounts/[id]/actions";

let seq = 0;
function rid(): string {
  seq += 1;
  return `act-req-${String(seq).padStart(4, "0")}`;
}

afterEach(() => {
  delete process.env.MOMENT_OS_WRITES;
});

describe("composer actions", () => {
  it("Add Note succeeds", async () => {
    const result = await createNoteAction({
      accountId: "ACC-010",
      body: "ลูกค้าสนใจของขวัญปีใหม่",
      clientRequestId: rid(),
    });
    expect(result).toEqual({ ok: true, deduped: false });
  });

  it("Log Call succeeds", async () => {
    const result = await logCallAction({
      accountId: "ACC-010",
      occurredAt: "2026-08-23T08:30:00Z",
      outcome: "QUALIFIED",
      durationMinutes: 20,
      clientRequestId: rid(),
    });
    expect(result.ok).toBe(true);
  });

  it("Log Meeting succeeds", async () => {
    const result = await logMeetingAction({
      accountId: "ACC-010",
      occurredAt: "2026-08-23T09:00:00Z",
      meetingType: "EBM_CENTER",
      body: "พาเดินดู showroom สนใจ premium set",
      budgetMin: 100_000,
      budgetMax: 250_000,
      clientRequestId: rid(),
    });
    expect(result.ok).toBe(true);
  });

  it("FOLLOW_UP without nextActionAt returns a readable error", async () => {
    const result = await createNoteAction({
      accountId: "ACC-010",
      body: "x",
      nextState: "FOLLOW_UP",
      nextAction: "โทรกลับ",
      clientRequestId: rid(),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/nextActionAt/);
  });

  it("invalid form state (strict zod) is rejected with field info", async () => {
    const result = await createNoteAction({
      accountId: "ACC-010",
      body: "",
      clientRequestId: rid(),
      hacker: "field",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("ข้อมูลไม่ถูกต้อง");
  });

  it("business-rule error surfaces as the CrmError message", async () => {
    const result = await createNoteAction({
      accountId: "ACC-001",
      contactId: "CT-ACC-002-1", // another account's contact
      body: "x",
      clientRequestId: rid(),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Contact");
  });

  it("write gate disabled blocks every write with the demo message", async () => {
    process.env.MOMENT_OS_WRITES = "disabled";
    const note = await createNoteAction({
      accountId: "ACC-010",
      body: "x",
      clientRequestId: rid(),
    });
    const contact = await createContactAction({
      accountId: "ACC-010",
      name: "x",
      clientRequestId: rid(),
    });
    expect(note.ok).toBe(false);
    expect(contact.ok).toBe(false);
    expect(note.error).toContain("ปิดการแก้ไข");
  });
});

describe("contact + task actions", () => {
  it("Create Contact succeeds", async () => {
    const result = await createContactAction({
      accountId: "ACC-010",
      name: "คุณเมย์ จัดซื้อ",
      jobTitle: "Purchasing",
      buyingRole: "PROCUREMENT",
      clientRequestId: rid(),
    });
    expect(result).toEqual({ ok: true, deduped: false });
  });

  it("duplicate Create Contact submission creates exactly one contact (fix 2)", async () => {
    const payload = {
      accountId: "ACC-013",
      name: "คุณกันซ้ำ",
      clientRequestId: "contact-action-fixed-1",
    };
    const first = await createContactAction(payload);
    const retry = await createContactAction(payload);
    expect(first).toEqual({ ok: true, deduped: false });
    expect(retry).toEqual({ ok: true, deduped: true });
    const { createMockRepositories } = await import(
      "@/lib/infrastructure/mock/repositories"
    );
    const repos = createMockRepositories();
    const contacts = await repos.contacts.listByAccount("ACC-013" as never);
    expect(contacts.filter((c) => c.name === "คุณกันซ้ำ")).toHaveLength(1);
  });

  it("Complete Task succeeds and a retry reports deduped", async () => {
    const created = await createTaskAction({
      accountId: "ACC-010",
      title: "ส่ง catalog",
      priority: "HIGH",
      clientRequestId: rid(),
    });
    expect(created.ok).toBe(true);
    // Find the task through the timeline path is Step-5 territory; complete
    // via the repository-backed action using the returned dedup semantics.
    const again = await createTaskAction({
      accountId: "ACC-010",
      title: "ส่ง catalog",
      priority: "HIGH",
      clientRequestId: "act-req-task-fixed",
    });
    expect(again.ok).toBe(true);

    const { createMockRepositories } = await import(
      "@/lib/infrastructure/mock/repositories"
    );
    const repos = createMockRepositories();
    const tasks = await repos.tasks.listByAccount("ACC-010" as never, 50);
    const target = tasks.find((t) => t.title === "ส่ง catalog");
    expect(target).toBeDefined();

    const done = await completeTaskAction({ taskId: target!.id });
    expect(done).toEqual({ ok: true, deduped: false });
    const retry = await completeTaskAction({ taskId: target!.id });
    expect(retry).toEqual({ ok: true, deduped: true });
  });
});

describe("timeline load-more action", () => {
  it("pages with keyset cursor and hydrates contacts", async () => {
    for (let i = 0; i < 22; i += 1) {
      await createNoteAction({
        accountId: "ACC-011",
        contactId: "CT-ACC-011-1",
        body: `page test ${i}`,
        occurredAt: `2026-05-${String((i % 28) + 1).padStart(2, "0")}T03:00:00Z`,
        clientRequestId: rid(),
      });
    }
    const page1 = await loadTimelineAction({ accountId: "ACC-011" });
    expect(page1.ok).toBe(true);
    expect(page1.items).toHaveLength(20);
    expect(page1.nextCursor).toBeDefined();
    expect(page1.contacts?.["CT-ACC-011-1"]?.name).toBeDefined();

    const page2 = await loadTimelineAction({
      accountId: "ACC-011",
      cursor: page1.nextCursor,
    });
    expect(page2.ok).toBe(true);
    expect(page2.items).toHaveLength(2);
    expect(page2.nextCursor).toBeUndefined();
  });

  it("type filter narrows the page", async () => {
    await logCallAction({
      accountId: "ACC-012",
      occurredAt: "2026-08-23T02:00:00Z",
      outcome: "CONNECTED",
      clientRequestId: rid(),
    });
    await createNoteAction({
      accountId: "ACC-012",
      body: "just a note",
      clientRequestId: rid(),
    });
    const calls = await loadTimelineAction({ accountId: "ACC-012", types: ["CALL"] });
    expect(calls.ok).toBe(true);
    expect((calls.items as { activityType: string }[]).every((a) => a.activityType === "CALL")).toBe(true);
  });

  it("rejects a malformed request", async () => {
    const result = await loadTimelineAction({ accountId: "not-an-account" });
    expect(result.ok).toBe(false);
  });
});
