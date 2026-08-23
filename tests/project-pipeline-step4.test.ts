import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createMockRepositories } from "@/lib/infrastructure/mock/repositories";
import type { Repositories } from "@/lib/repositories";
import type { OpportunityId, UserId } from "@/lib/types";
import { UNSPECIFIED_PROJECT_TYPE_ID } from "@/lib/domain/industry";
import { SALES_STAGES } from "@/lib/domain/opportunity";

vi.mock("@/lib/infrastructure", () => {
  let repos: Repositories | null = null;
  return {
    getRepositories: async () => {
      if (!repos) repos = createMockRepositories();
      return repos;
    },
  };
});

import {
  getProjectPipeline,
  getProjectWizardContext,
  isProjectFilter,
} from "@/lib/application/projects/get-project-pipeline";
import { createProject } from "@/lib/application/projects/create-project";
import {
  activateProject,
  updateProjectStage,
} from "@/lib/application/projects/project-lifecycle";
import { getRepositories } from "@/lib/infrastructure";

const ACTOR = "USR-010" as UserId;
let seq = 0;
const rid = () => `s4-req-${String((seq += 1)).padStart(4, "0")}`;

const fullCreate = () => ({
  accountId: "ACC-001" as const,
  momentEventId: "ME-2026-000001" as const,
  name: "S4 — โปรเจกต์ทดสอบ pipeline",
  industryId: "IND-HEALTH-CLINIC" as const,
  projectTypeId: "PT-NEW-BRANCH" as const,
  expectedRevenue: 120_000,
  expectedGP: 0.4,
  closeDate: "2026-10-30",
  ownerId: ACTOR,
  nextAction: "นัดคุยบรีฟ",
  nextActionDate: "2026-08-30",
  clientRequestId: rid(),
  actorId: ACTOR,
});

describe("pipeline view model (board + list share one dataset)", () => {
  it("board groups ONLY ACTIVE projects by commercial stage", async () => {
    const view = await getProjectPipeline("ALL", ACTOR);
    for (const stage of SALES_STAGES) {
      for (const row of view.byStage[stage]) {
        expect(row.project.status).toBe("ACTIVE");
        expect(row.project.salesStage).toBe(stage);
      }
    }
  });

  it("DRAFT never appears as a sales stage — it lives in its own strip", async () => {
    const { project } = await createProject(fullCreate());
    const view = await getProjectPipeline("ALL", ACTOR);
    const inColumns = SALES_STAGES.flatMap((s) => view.byStage[s]).some(
      (r) => r.project.id === project.id,
    );
    expect(inColumns).toBe(false);
    expect(view.drafts.some((r) => r.project.id === project.id)).toBe(true);
  });

  it("WON/LOST/CANCELLED are summary counts, never stage columns", async () => {
    const view = await getProjectPipeline("ALL", ACTOR);
    expect(view.closed.won).toBeGreaterThan(0); // legacy fixture
    const closedInColumns = SALES_STAGES.flatMap((s) => view.byStage[s]).some(
      (r) => r.project.status !== "ACTIVE",
    );
    expect(closedInColumns).toBe(false);
  });

  it("renders Thai labels — moment, industry, project type — never raw codes", async () => {
    const view = await getProjectPipeline("ALL", ACTOR);
    const active = SALES_STAGES.flatMap((s) => view.byStage[s]);
    expect(active.length).toBeGreaterThan(0);
    for (const row of active) {
      if (row.event) {
        expect(row.momentThai).toBeTruthy();
        expect(row.momentThai).not.toMatch(/^EBM /); // Thai, not the code
      }
      if (row.project.industryId) {
        expect(row.industryThai).toBeTruthy();
        expect(row.industryThai).not.toMatch(/^IND-/);
      }
      if (row.project.projectTypeId) {
        expect(row.projectTypeThai).toBeTruthy();
        expect(row.projectTypeThai).not.toMatch(/^PT-/);
      }
    }
  });

  it("legacy ACTIVE project with PT-UNSPECIFIED renders safely with a warning flag", async () => {
    const view = await getProjectPipeline("ALL", ACTOR);
    const legacy = SALES_STAGES.flatMap((s) => view.byStage[s]).find(
      (r) => r.project.projectTypeId === UNSPECIFIED_PROJECT_TYPE_ID,
    );
    expect(legacy).toBeDefined();
    expect(legacy!.incompleteContext).toBe(true);
    expect(legacy!.riskFlags).toContain("INCOMPLETE_CONTEXT");
    // Controlled display name, not the raw sentinel code.
    expect(legacy!.projectTypeThai).toBe("ไม่ระบุ (ข้อมูลเก่า)");
  });

  it("stage change through the use case is reflected on the board", async () => {
    const { project } = await createProject({ ...fullCreate(), clientRequestId: rid() });
    await activateProject({
      opportunityId: project.id,
      clientRequestId: rid(),
      actorId: ACTOR,
    });
    let view = await getProjectPipeline("ALL", ACTOR);
    expect(view.byStage.NEW_BRIEF.some((r) => r.project.id === project.id)).toBe(true);
    await updateProjectStage({
      opportunityId: project.id,
      toStage: "DISCOVERY",
      clientRequestId: rid(),
      actorId: ACTOR,
    });
    view = await getProjectPipeline("ALL", ACTOR);
    expect(view.byStage.NEW_BRIEF.some((r) => r.project.id === project.id)).toBe(false);
    expect(view.byStage.DISCOVERY.some((r) => r.project.id === project.id)).toBe(true);
  });
});

describe("filters", () => {
  it("validates the filter param and filters by status/risk/ownership", async () => {
    expect(isProjectFilter("DRAFT")).toBe(true);
    expect(isProjectFilter("DROP TABLE")).toBe(false);

    const drafts = await getProjectPipeline("DRAFT", ACTOR);
    for (const r of drafts.rows) expect(r.project.status).toBe("DRAFT");

    const active = await getProjectPipeline("ACTIVE", ACTOR);
    for (const r of active.rows) expect(r.project.status).toBe("ACTIVE");

    const my = await getProjectPipeline("MY", ACTOR);
    for (const r of my.rows) expect(r.project.ownerId).toBe(ACTOR);

    const incomplete = await getProjectPipeline("INCOMPLETE_CONTEXT", ACTOR);
    expect(incomplete.rows.length).toBeGreaterThan(0);
    for (const r of incomplete.rows) expect(r.incompleteContext).toBe(true);

    const won = await getProjectPipeline("WON", ACTOR);
    for (const r of won.rows) expect(r.project.status).toBe("WON");
  });
});

describe("create project wizard data", () => {
  it("PT-UNSPECIFIED is never offered as a create option", async () => {
    const ctx = await getProjectWizardContext("ACC-001");
    expect(ctx.projectTypes.length).toBeGreaterThan(0);
    expect(ctx.projectTypes.some((t) => t.id === UNSPECIFIED_PROJECT_TYPE_ID)).toBe(false);
    // Moments come from THIS account only, with Thai labels.
    for (const m of ctx.moments) expect(m.thai).toBeTruthy();
    // Industry prefill source is exposed.
    expect(ctx.account.industryId).toBe("IND-HEALTH-CLINIC");
  });

  it("create draft succeeds; double-submit with the same request id stays one project", async () => {
    const input = { ...fullCreate(), clientRequestId: rid() };
    const before = (await getProjectPipeline("DRAFT", ACTOR)).rows.length;
    const first = await createProject(input);
    const second = await createProject(input); // double click
    expect(first.project.id).toBe(second.project.id);
    const after = (await getProjectPipeline("DRAFT", ACTOR)).rows.length;
    expect(after).toBe(before + 1);
  });

  it("activation errors surface as renderable messages (canonical wording)", async () => {
    const { project } = await createProject({
      ...fullCreate(),
      projectTypeId: undefined,
      clientRequestId: rid(),
    });
    await expect(
      activateProject({ opportunityId: project.id, clientRequestId: rid(), actorId: ACTOR }),
    ).rejects.toThrow(/activation gate failed: project_type/);
  });
});

describe("architecture + isolation", () => {
  const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf-8");

  it("UI components never touch repositories/infrastructure directly", () => {
    for (const file of [
      "components/projects/stage-menu.tsx",
      "components/projects/activate-button.tsx",
      "components/projects/create-project-wizard.tsx",
      "components/projects/project-card.tsx",
    ]) {
      const src = read(file);
      expect(src, file).not.toContain("@/lib/repositories");
      expect(src, file).not.toContain("@/lib/infrastructure");
    }
  });

  it("server actions delegate to use cases only — no repository writes", () => {
    const src = read("app/opportunities/actions.ts");
    expect(src).not.toContain("@/lib/repositories");
    expect(src).not.toContain("getRepositories");
    for (const useCase of ["createProject", "activateProject", "updateProjectStage", "addProjectContact"]) {
      expect(src).toContain(useCase);
    }
  });

  it("the page performs no mutations — reads only", () => {
    const src = read("app/opportunities/page.tsx");
    for (const write of [".create(", ".applyTransition(", ".updateFields(", ".addProjectContact("]) {
      expect(src).not.toContain(write);
    }
    // Responsive shells: wide content scrolls inside its own container.
    expect(src).toContain("overflow-x-auto");
  });

  it("organization isolation — foreign ids resolve to nothing", async () => {
    const repos = await getRepositories();
    const foreign = await repos.opportunities.lastStageChangeByOpportunities([
      "OPP-OTHERORG-1" as OpportunityId,
    ]);
    expect(foreign.size).toBe(0);
  });
});
