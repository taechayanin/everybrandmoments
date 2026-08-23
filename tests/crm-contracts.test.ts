import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACTIVITY_TYPES,
  CONTACT_ROLES,
  CONTACT_STATUSES,
  INFLUENCE_LEVELS,
  SUGGESTION_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  followUpTaskKey,
  suggestionTaskKey,
} from "@/lib/domain/activity";
import {
  ActivityAnalysisSchema,
  CreateContactSchema,
  CreateNoteSchema,
  CreateTaskSchema,
  LogCallSchema,
  LogMeetingSchema,
} from "@/lib/contracts/crm";

// CRM Step 1 (plan rev 4): zod contracts are the application boundary and the
// migration's CHECK constraints must never drift from the domain enums.

const REQ = { clientRequestId: "3f1c2b1e-aaaa-bbbb-cccc-000000000001" };

describe("CRM zod contracts", () => {
  it("accepts a minimal valid note and rejects an empty body", () => {
    const ok = CreateNoteSchema.safeParse({
      accountId: "ACC-001",
      body: "ลูกค้าสนใจ uniform",
      ...REQ,
    });
    expect(ok.success).toBe(true);
    expect(
      CreateNoteSchema.safeParse({ accountId: "ACC-001", body: "   ", ...REQ }).success,
    ).toBe(false);
  });

  it("rejects unknown fields (strict) and foreign-shaped ids", () => {
    expect(
      CreateNoteSchema.safeParse({
        accountId: "ACC-001",
        body: "x",
        extra: "nope",
        ...REQ,
      }).success,
    ).toBe(false);
    expect(
      CreateNoteSchema.safeParse({ accountId: "USR-001", body: "x", ...REQ }).success,
    ).toBe(false);
  });

  it("call log requires a known outcome", () => {
    const base = {
      accountId: "ACC-001",
      occurredAt: "2026-08-23T04:00:00Z",
      ...REQ,
    };
    expect(LogCallSchema.safeParse({ ...base, outcome: "CONNECTED" }).success).toBe(true);
    expect(LogCallSchema.safeParse({ ...base, outcome: "MAYBE" }).success).toBe(false);
  });

  it("meeting log validates budget ordering and meeting type", () => {
    const base = {
      accountId: "ACC-001",
      occurredAt: "2026-08-23T04:00:00Z",
      meetingType: "ONLINE",
      body: "คุยแผนเปิดสาขา",
      ...REQ,
    };
    expect(LogMeetingSchema.safeParse(base).success).toBe(true);
    expect(
      LogMeetingSchema.safeParse({ ...base, budgetMin: 500_000, budgetMax: 300_000 })
        .success,
    ).toBe(false);
    expect(
      LogMeetingSchema.safeParse({ ...base, meetingType: "ZOOM" }).success,
    ).toBe(false);
  });

  it("task and contact contracts enforce enums", () => {
    expect(
      CreateTaskSchema.safeParse({
        title: "ส่ง sample",
        accountId: "ACC-001",
        priority: "HIGH",
        ...REQ,
      }).success,
    ).toBe(true);
    expect(
      CreateTaskSchema.safeParse({ title: "x", priority: "ASAP", ...REQ }).success,
    ).toBe(false);
    expect(
      CreateContactSchema.safeParse({
        accountId: "ACC-001",
        name: "คุณจอย",
        buyingRole: "DECISION_MAKER",
        ...REQ,
      }).success,
    ).toBe(true);
    expect(
      CreateContactSchema.safeParse({
        accountId: "ACC-001",
        name: "คุณจอย",
        buyingRole: "BOSS",
        ...REQ,
      }).success,
    ).toBe(false);
  });

  it("activity analysis output is bounded and catalog-typed", () => {
    const ok = ActivityAnalysisSchema.safeParse({
      summary: "ลูกค้าจะเปิดสาขาใหม่",
      detectedMomentCodes: ["EBM Expand"],
      needs: ["Uniform"],
      confidence: 0.86,
      recommendedSolutionIds: ["SOL-001"],
    });
    expect(ok.success).toBe(true);
    expect(
      ActivityAnalysisSchema.safeParse({
        summary: "x",
        detectedMomentCodes: ["Not A Moment"],
        needs: [],
        confidence: 0.5,
        recommendedSolutionIds: [],
      }).success,
    ).toBe(false);
    expect(
      ActivityAnalysisSchema.safeParse({
        summary: "x",
        detectedMomentCodes: [],
        needs: [],
        confidence: 1.5,
        recommendedSolutionIds: [],
      }).success,
    ).toBe(false);
  });

  it("stable idempotency keys are deterministic (plan rev 4)", () => {
    expect(followUpTaskKey("abc-123")).toBe("ACTIVITY:abc-123:FOLLOWUP");
    expect(suggestionTaskKey("SUG-9")).toBe("SUG:SUG-9");
  });
});

describe("migration 0004 CHECK constraints match domain enums (no drift)", () => {
  const sql = readFileSync(
    join(__dirname, "..", "migrations", "0004_crm_activity_layer.sql"),
    "utf8",
  );

  /** Extract the quoted values of the CHECK ... IN (...) list following a column. */
  function checkList(column: string): string[] {
    const at = sql.indexOf(`${column} `);
    expect(at, `column ${column} present in migration`).toBeGreaterThan(-1);
    const after = sql.slice(at);
    const inList = after.match(/IN\s*\(([^)]*)\)/);
    expect(inList, `CHECK IN(...) for ${column}`).not.toBeNull();
    return [...inList![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  }

  it("activities.activity_type", () => {
    expect(checkList("activity_type TEXT NOT NULL CHECK")).toEqual([...ACTIVITY_TYPES]);
  });

  it("tasks.status and tasks.priority", () => {
    expect(checkList("status TEXT NOT NULL CHECK")).toEqual([...TASK_STATUSES]);
    expect(checkList("priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK")).toEqual([
      ...TASK_PRIORITIES,
    ]);
  });

  it("contacts.buying_role / influence_level / status", () => {
    expect(checkList("buying_role TEXT CHECK")).toEqual([...CONTACT_ROLES]);
    expect(checkList("influence_level TEXT CHECK")).toEqual([...INFLUENCE_LEVELS]);
    expect(checkList("status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK")).toEqual([
      ...CONTACT_STATUSES,
    ]);
  });

  it("activity_ai_suggestions.status and confidence bounds", () => {
    expect(checkList("status TEXT NOT NULL DEFAULT 'PENDING' CHECK")).toEqual([
      ...SUGGESTION_STATUSES,
    ]);
    expect(sql).toContain("confidence >= 0.0 AND confidence <= 1.0");
  });

  it("idempotency indexes exist for activities and tasks", () => {
    expect(sql).toContain("uq_activities_client_request");
    expect(sql).toContain("uq_tasks_client_request");
    expect(sql.match(/WHERE client_request_id IS NOT NULL/g)?.length).toBe(2);
  });

  it("contacts backfill derives organization from the owning account", () => {
    expect(sql).toContain("LEFT JOIN accounts a ON a.id = c.account_id");
    expect(sql).not.toMatch(/INSERT INTO contacts_new[\s\S]*'ORG-001'/);
  });

  it("unknown legacy task status fails loudly (ELSE NULL, not OPEN)", () => {
    const caseBlock = sql.match(/CASE lower\(status\)[\s\S]*?END/)![0];
    expect(caseBlock).toContain("ELSE NULL");
    expect(caseBlock).not.toContain("ELSE 'OPEN'");
  });
});
