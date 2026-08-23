import { describe, expect, it, vi } from "vitest";
import {
  IdempotencyConflictError,
  STAGE_STUCK_DAYS,
  canChangeSalesStage,
  canTransitionStatus,
  hasIncompleteContext,
  projectRiskFlags,
} from "@/lib/domain/opportunity";
import { UNSPECIFIED_PROJECT_TYPE_ID } from "@/lib/domain/industry";
import { createMockRepositories } from "@/lib/infrastructure/mock/repositories";
import { OPPORTUNITIES } from "@/lib/infrastructure/mock/opportunities";
import type { Repositories } from "@/lib/repositories";
import type { OpportunityId, UserId } from "@/lib/types";

// Step 3 — use cases run against the mock adapter through the composition
// root, exactly as server actions will call them in Step 4.

vi.mock("@/lib/infrastructure", () => {
  let repos: Repositories | null = null;
  return {
    getRepositories: async () => {
      if (!repos) repos = createMockRepositories();
      return repos;
    },
    __reset: () => {
      repos = null;
    },
  };
});

import { createProject } from "@/lib/application/projects/create-project";
import {
  activateProject,
  cancelProject,
  closeProjectLost,
  closeProjectWon,
  updateProject,
  updateProjectNextAction,
  updateProjectStage,
} from "@/lib/application/projects/project-lifecycle";
import { addProjectContact } from "@/lib/application/projects/project-contacts";
import { evaluateProjectRisk } from "@/lib/application/projects/evaluate-project-risk";
import { getRepositories } from "@/lib/infrastructure";

const ACTOR = "USR-010" as UserId;
let seq = 0;
const rid = () => `s3-req-${String((seq += 1)).padStart(4, "0")}`;

const baseCreate = () => ({
  accountId: "ACC-001" as const,
  momentEventId: "ME-2026-000001" as const,
  name: "ABC Clinic — เปิดสาขาบางแค",
  expectedRevenue: 250_000,
  expectedGP: 0.4,
  closeDate: "2026-10-15",
  ownerId: ACTOR,
  nextAction: "นัด discovery call",
  clientRequestId: rid(),
  actorId: ACTOR,
});

const fullContext = () => ({
  ...baseCreate(),
  industryId: "IND-HEALTH-CLINIC" as const,
  projectTypeId: "PT-NEW-BRANCH" as const,
  nextActionDate: "2026-08-30",
  clientRequestId: rid(),
});

async function createActivated() {
  const { project } = await createProject(fullContext());
  return activateProject({
    opportunityId: project.id,
    clientRequestId: rid(),
    actorId: ACTOR,
  });
}

describe("createProject", () => {
  it("creates DRAFT with stage NULL — never auto-activates", async () => {
    const { project, created } = await createProject(fullContext());
    expect(created).toBe(true);
    expect(project.status).toBe("DRAFT");
    expect(project.salesStage).toBeNull();
  });

  it("prefills industry from the account as a snapshot on the project", async () => {
    const { project } = await createProject(baseCreate());
    expect(project.industryId).toBe("IND-HEALTH-CLINIC"); // ACC-001 mapping
  });

  it("persists solution relations through the Step-2 path (no parallel storage)", async () => {
    const { project } = await createProject({
      ...fullContext(),
      solutionIds: ["SOL-START-001"],
    });
    const repos = await getRepositories();
    expect(await repos.opportunities.listSolutionIds(project.id)).toEqual([
      "SOL-START-001",
    ]);
  });

  it("idempotent exact retry returns the original — one history, one solution set", async () => {
    const input = { ...fullContext(), solutionIds: ["SOL-START-001"] };
    const first = await createProject(input);
    const second = await createProject(input);
    expect(second.created).toBe(false);
    expect(second.project.id).toBe(first.project.id);
    const repos = await getRepositories();
    expect(await repos.opportunities.listStageHistory(first.project.id)).toHaveLength(1);
    expect(await repos.opportunities.listSolutionIds(first.project.id)).toHaveLength(1);
  });

  it("same key + materially different payload → IDEMPOTENCY_CONFLICT", async () => {
    const input = fullContext();
    await createProject(input);
    await expect(
      createProject({ ...input, expectedRevenue: 999_999 }),
    ).rejects.toThrow(IdempotencyConflictError);
    await expect(
      createProject({ ...input, name: "ชื่ออื่นที่ไม่เกี่ยวกัน" }),
    ).rejects.toThrow(/IDEMPOTENCY_CONFLICT/);
  });
});

describe("activateProject (canonical gate)", () => {
  it("activates a complete DRAFT → ACTIVE at NEW_BRIEF, atomically with history", async () => {
    const project = await createActivated();
    expect(project.status).toBe("ACTIVE");
    expect(project.salesStage).toBe("NEW_BRIEF");
    const repos = await getRepositories();
    const history = await repos.opportunities.listStageHistory(project.id);
    expect(history).toHaveLength(2); // creation + activation
    expect(history[1]).toMatchObject({
      fromStatus: "DRAFT", toStatus: "ACTIVE", fromStage: null, toStage: "NEW_BRIEF",
    });
  });

  it("rejects activation missing industry (draft from an unmapped account)", async () => {
    // Every demo account maps to an industry and the app layer snapshots it,
    // so an industry-less draft is only reachable the way an unmapped legacy
    // account would produce it — via the repository directly.
    const repos = await getRepositories();
    const { opportunity } = await repos.opportunities.create({
      momentEventId: "ME-2026-000001",
      accountId: "ACC-001",
      name: "draft without industry",
      status: "DRAFT",
      salesStage: null,
      projectTypeId: "PT-NEW-BRANCH",
      expectedRevenue: 1000,
      expectedGP: 0.4,
      closeDate: "2026-10-15",
      ownerId: ACTOR,
      nextAction: "call",
      nextActionDate: "2026-08-30",
      clientRequestId: rid(),
    });
    expect(opportunity.industryId).toBeNull();
    await expect(
      activateProject({
        opportunityId: opportunity.id,
        clientRequestId: rid(),
        actorId: ACTOR,
      }),
    ).rejects.toThrow(/activation gate failed: industry/);
  });

  it("rejects activation missing project type", async () => {
    const { project } = await createProject({
      ...fullContext(),
      projectTypeId: undefined,
      clientRequestId: rid(),
    });
    await expect(
      activateProject({
        opportunityId: project.id,
        clientRequestId: rid(),
        actorId: ACTOR,
      }),
    ).rejects.toThrow(/project_type/);
  });

  it("rejects activation missing next action date", async () => {
    const { project } = await createProject({
      ...fullContext(),
      nextActionDate: undefined,
      clientRequestId: rid(),
    });
    await expect(
      activateProject({
        opportunityId: project.id,
        clientRequestId: rid(),
        actorId: ACTOR,
      }),
    ).rejects.toThrow(/next_action_date/);
  });

  it("rejects activation with PT-UNSPECIFIED (sentinel never activates)", async () => {
    const { project } = await createProject({ ...fullContext(), projectTypeId: undefined, clientRequestId: rid() });
    await expect(
      activateProject({
        opportunityId: project.id,
        projectTypeId: UNSPECIFIED_PROJECT_TYPE_ID,
        clientRequestId: rid(),
        actorId: ACTOR,
      }),
    ).rejects.toThrow(/project_type/);
  });

  it("rejects activation missing moment — impossible by schema, guarded by gate", async () => {
    // moment_event_id is NOT NULL end-to-end; the canonical gate still checks
    // (single rule source) — proven at the domain level.
    const { activationGateErrors } = await import("@/lib/domain/opportunity");
    expect(
      activationGateErrors({
        accountId: "ACC-001",
        industryId: "IND-HEALTH",
        momentEventId: null,
        projectTypeId: "PT-NEW-BRANCH",
        ownerId: ACTOR,
        expectedRevenue: 1,
        nextAction: "x",
        nextActionDate: "2026-08-30",
      }),
    ).toContain("moment");
  });

  it("completes missing context at activation time (fields land atomically)", async () => {
    const { project } = await createProject({ ...baseCreate(), clientRequestId: rid() });
    const activated = await activateProject({
      opportunityId: project.id,
      projectTypeId: "PT-UNIFORM",
      nextActionDate: "2026-09-01",
      clientRequestId: rid(),
      actorId: ACTOR,
    });
    expect(activated.status).toBe("ACTIVE");
    expect(activated.projectTypeId).toBe("PT-UNIFORM");
    expect(activated.nextActionDate).toBe("2026-09-01");
  });
});

describe("stage transitions", () => {
  it("canonical rules: forward any distance, back exactly one, no self-move", () => {
    expect(canChangeSalesStage("NEW_BRIEF", "DISCOVERY")).toBe(true);
    expect(canChangeSalesStage("NEW_BRIEF", "NEGOTIATION")).toBe(true);
    expect(canChangeSalesStage("PROPOSAL", "SOLUTION_DESIGN")).toBe(true);
    expect(canChangeSalesStage("PROPOSAL", "DISCOVERY")).toBe(false);
    expect(canChangeSalesStage("DISCOVERY", "DISCOVERY")).toBe(false);
  });

  it("moves stage atomically with history; backward requires a reason", async () => {
    const project = await createActivated();
    const moved = await updateProjectStage({
      opportunityId: project.id,
      toStage: "QUALIFIED",
      clientRequestId: rid(),
      actorId: ACTOR,
    });
    expect(moved.salesStage).toBe("QUALIFIED");
    await expect(
      updateProjectStage({
        opportunityId: project.id,
        toStage: "DISCOVERY",
        clientRequestId: rid(),
        actorId: ACTOR,
      }),
    ).rejects.toThrow(/เหตุผล/);
    const back = await updateProjectStage({
      opportunityId: project.id,
      toStage: "DISCOVERY",
      reason: "ลูกค้าขอทบทวนความต้องการ",
      clientRequestId: rid(),
      actorId: ACTOR,
    });
    expect(back.salesStage).toBe("DISCOVERY");
    const repos = await getRepositories();
    const history = await repos.opportunities.listStageHistory(project.id);
    // creation + activation + forward + backward
    expect(history).toHaveLength(4);
    expect(history.at(-1)).toMatchObject({
      fromStage: "QUALIFIED", toStage: "DISCOVERY",
      reason: "ลูกค้าขอทบทวนความต้องการ",
    });
  });

  it("rejects stage moves on DRAFT projects", async () => {
    const { project } = await createProject(fullContext());
    await expect(
      updateProjectStage({
        opportunityId: project.id,
        toStage: "DISCOVERY",
        clientRequestId: rid(),
        actorId: ACTOR,
      }),
    ).rejects.toThrow(/ACTIVE/);
  });
});

describe("closing", () => {
  it("WON clears the stage and records history", async () => {
    const project = await createActivated();
    const won = await closeProjectWon({
      opportunityId: project.id,
      clientRequestId: rid(),
      actorId: ACTOR,
    });
    expect(won.status).toBe("WON");
    expect(won.salesStage).toBeNull();
    // Terminal: nothing may follow.
    expect(canTransitionStatus("WON", "ACTIVE")).toBe(false);
    await expect(
      updateProjectStage({
        opportunityId: project.id, toStage: "PROPOSAL",
        clientRequestId: rid(), actorId: ACTOR,
      }),
    ).rejects.toThrow(/ACTIVE/);
  });

  it("LOST clears the stage and REQUIRES a reason (zod + schema)", async () => {
    const project = await createActivated();
    await expect(
      closeProjectLost({
        opportunityId: project.id,
        lostReason: "",
        clientRequestId: rid(),
        actorId: ACTOR,
      }),
    ).rejects.toThrow(); // zod min length
    const lost = await closeProjectLost({
      opportunityId: project.id,
      lostReason: "แพ้ราคาให้คู่แข่ง",
      clientRequestId: rid(),
      actorId: ACTOR,
    });
    expect(lost.status).toBe("LOST");
    expect(lost.salesStage).toBeNull();
    expect(lost.lostReason).toBe("แพ้ราคาให้คู่แข่ง");
  });

  it("CANCELLED works from DRAFT and ACTIVE, requires reason + actor, clears stage", async () => {
    const { project: draft } = await createProject(fullContext());
    const cancelledDraft = await cancelProject({
      opportunityId: draft.id,
      cancelReason: "ลูกค้าเลื่อนโครงการไม่มีกำหนด",
      clientRequestId: rid(),
      actorId: ACTOR,
    });
    expect(cancelledDraft.status).toBe("CANCELLED");
    expect(cancelledDraft.salesStage).toBeNull();

    const active = await createActivated();
    const cancelled = await cancelProject({
      opportunityId: active.id,
      cancelReason: "budget ถูกตัด",
      clientRequestId: rid(),
      actorId: ACTOR,
    });
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancelReason).toBe("budget ถูกตัด");
    // reason is mandatory at the boundary
    await expect(
      cancelProject({
        opportunityId: active.id, cancelReason: "", clientRequestId: rid(), actorId: ACTOR,
      }),
    ).rejects.toThrow();
  });
});

describe("updateProject", () => {
  it("edits commercial fields; rejects sentinel type as a new value; closed rows immutable", async () => {
    const { project } = await createProject(fullContext());
    const updated = await updateProject({
      opportunityId: project.id,
      brief: "อัปเดตบรีฟ",
      expectedRevenue: 300_000,
      actorId: ACTOR,
    });
    expect(updated.brief).toBe("อัปเดตบรีฟ");
    expect(updated.expectedRevenue).toBe(300_000);
    await expect(
      updateProject({
        opportunityId: project.id,
        projectTypeId: UNSPECIFIED_PROJECT_TYPE_ID,
        actorId: ACTOR,
      }),
    ).rejects.toThrow(/sentinel|master/);
    const cancelled = await cancelProject({
      opportunityId: project.id,
      cancelReason: "ทดสอบความ immutable",
      clientRequestId: rid(),
      actorId: ACTOR,
    });
    expect(cancelled.status).toBe("CANCELLED");
    await expect(
      updateProject({ opportunityId: project.id, brief: "แก้หลังปิด", actorId: ACTOR }),
    ).rejects.toThrow(/immutable/);
  });
});

describe("project contacts (ownership)", () => {
  it("links same-account contact; rejects cross-account within the same org", async () => {
    const { project } = await createProject(fullContext()); // ACC-001
    expect(
      await addProjectContact({
        opportunityId: project.id,
        contactId: "CT-ACC-001-1",
        role: "DECISION_MAKER",
        actorId: ACTOR,
      }),
    ).toEqual({ added: true });
    // Same org, DIFFERENT account → rejected.
    await expect(
      addProjectContact({
        opportunityId: project.id,
        contactId: "CT-ACC-002-1",
        role: "CHAMPION",
        actorId: ACTOR,
      }),
    ).rejects.toThrow(/different account/);
    // Unknown contact (foreign org) → rejected.
    await expect(
      addProjectContact({
        opportunityId: project.id,
        contactId: "CT-OTHERORG-9",
        role: "CHAMPION",
        actorId: ACTOR,
      }),
    ).rejects.toThrow(/not found/i);
  });
});

describe("next-action invariant + risk rules", () => {
  it("updateProjectNextAction keeps both fields together", async () => {
    const project = await createActivated();
    const updated = await updateProjectNextAction({
      opportunityId: project.id,
      nextAction: "ส่งใบเสนอราคา",
      nextActionDate: "2026-09-05",
      actorId: ACTOR,
    });
    expect(updated.nextAction).toBe("ส่งใบเสนอราคา");
    expect(updated.nextActionDate).toBe("2026-09-05");
  });

  it("risk rules: no next action / overdue / no activity / stuck / incomplete", () => {
    const base = {
      status: "ACTIVE" as const,
      industryId: "IND-HEALTH" as const,
      projectTypeId: "PT-NEW-BRANCH" as const,
      nextAction: "call",
      nextActionDate: "2026-08-30",
      createdAt: "2026-08-20T00:00:00Z",
      lastActivityAt: "2026-08-22T00:00:00Z",
      lastStageChangeAt: "2026-08-22T00:00:00Z",
      today: "2026-08-23",
      now: new Date("2026-08-23T05:00:00Z"),
    };
    expect(projectRiskFlags(base)).toEqual([]);
    expect(projectRiskFlags({ ...base, nextAction: null })).toContain("NO_NEXT_ACTION");
    expect(projectRiskFlags({ ...base, nextActionDate: "2026-08-20" })).toContain("OVERDUE_NEXT_ACTION");
    expect(
      projectRiskFlags({ ...base, lastActivityAt: "2026-08-10T00:00:00Z" }),
    ).toContain("NO_RECENT_ACTIVITY");
    const stuckSince = new Date(
      base.now.getTime() - (STAGE_STUCK_DAYS + 1) * 86_400_000,
    ).toISOString();
    expect(
      projectRiskFlags({ ...base, lastStageChangeAt: stuckSince }),
    ).toContain("STUCK_IN_STAGE");
    expect(
      projectRiskFlags({ ...base, projectTypeId: UNSPECIFIED_PROJECT_TYPE_ID }),
    ).toContain("INCOMPLETE_CONTEXT");
    // DRAFT and closed → no risk at all
    expect(projectRiskFlags({ ...base, status: "DRAFT" })).toEqual([]);
    expect(projectRiskFlags({ ...base, status: "WON" })).toEqual([]);
  });

  it("evaluateProjectRisk wires CRM context into the rules", async () => {
    const project = await createActivated();
    const { flags, atRisk } = await evaluateProjectRisk(project.id);
    // Fresh project: no activity yet but created just now → not no-contact;
    // next action date in the future → clean.
    expect(flags).not.toContain("NO_NEXT_ACTION");
    expect(typeof atRisk).toBe("boolean");
  });
});

describe("legacy compatibility + isolation", () => {
  it("legacy ACTIVE project with PT-UNSPECIFIED stays readable and stage-operable", async () => {
    const repos = await getRepositories();
    const legacy = OPPORTUNITIES.find(
      (o) => o.status === "ACTIVE" && o.projectTypeId === UNSPECIFIED_PROJECT_TYPE_ID,
    );
    expect(legacy).toBeDefined();
    // Readable.
    const loaded = await repos.opportunities.getById(legacy!.id);
    expect(loaded).not.toBeNull();
    // Surfaced as incomplete-context for later enrichment…
    expect(
      hasIncompleteContext({
        status: loaded!.status,
        industryId: loaded!.industryId,
        projectTypeId: loaded!.projectTypeId,
        nextActionDate: loaded!.nextActionDate,
      }),
    ).toBe(true);
    // …but normal stage management still works.
    const from = loaded!.salesStage!;
    const forward = ["DISCOVERY", "QUALIFIED", "SOLUTION_DESIGN", "PROPOSAL", "NEGOTIATION"]
      .find((sIdx) => canChangeSalesStage(from, sIdx as never));
    const moved = await updateProjectStage({
      opportunityId: loaded!.id,
      toStage: forward as never,
      clientRequestId: rid(),
      actorId: ACTOR,
    });
    expect(moved.salesStage).toBe(forward);
  });

  it("organization isolation: unknown/foreign ids never resolve", async () => {
    await expect(
      activateProject({
        opportunityId: "OPP-OTHERORG-1" as OpportunityId,
        clientRequestId: rid(),
        actorId: ACTOR,
      }),
    ).rejects.toThrow(/not found/i);
    await expect(evaluateProjectRisk("OPP-OTHERORG-1" as OpportunityId)).rejects.toThrow(/not found/i);
  });
});
