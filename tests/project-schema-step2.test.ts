import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LEGACY_LOST_REASON,
  PROJECT_CONTACT_ROLES,
  activationGateErrors,
  isValidStatusStagePair,
  legacyStageToStatusStage,
} from "@/lib/domain/opportunity";
import { UNSPECIFIED_PROJECT_TYPE_ID } from "@/lib/domain/industry";
import { OPPORTUNITIES } from "@/lib/infrastructure/mock/opportunities";
import { ACCOUNTS } from "@/lib/infrastructure/mock/accounts";
import { createMockRepositories } from "@/lib/infrastructure/mock/repositories";
import type {
  AccountId,
  ContactId,
  IndustryId,
  MomentEventId,
  OpportunityId,
  ProjectTypeId,
  UserId,
} from "@/lib/types";
import type { CreateOpportunityInput } from "@/lib/repositories";

// Project Pipeline Step 2 — schema evolution. The mock adapter mirrors the
// 0010 CHECKs (the D1 side is additionally proven by wrangler smoke runs in
// the review packet), and the drift tests pin the migration SQL to the domain.

const MIGRATION = readFileSync(
  join(__dirname, "../migrations/0010_project_schema.sql"),
  "utf-8",
);

const repos = createMockRepositories();
const OWNER = "USR-010" as UserId;

let seq = 0;
const rid = () => `s2-req-${String((seq += 1)).padStart(3, "0")}`;

const baseDraft = (): CreateOpportunityInput => ({
  momentEventId: "ME-2026-000001" as MomentEventId,
  accountId: "ACC-001" as AccountId,
  name: "step2 draft",
  status: "DRAFT",
  salesStage: null,
  expectedRevenue: 1000,
  expectedGP: 0.4,
  closeDate: "2026-10-01",
  ownerId: OWNER,
  nextAction: "โทรนัด",
  clientRequestId: rid(),
});

const fullActive = (): CreateOpportunityInput => ({
  ...baseDraft(),
  name: "step2 active",
  status: "ACTIVE",
  salesStage: "NEW_BRIEF",
  industryId: "IND-HEALTH-CLINIC" as IndustryId,
  projectTypeId: "PT-NEW-BRANCH" as ProjectTypeId,
  nextActionDate: "2026-08-30",
  clientRequestId: rid(),
});

describe("status × stage invariants", () => {
  it("DRAFT / WON / LOST / CANCELLED require a null stage; ACTIVE requires non-null", () => {
    expect(isValidStatusStagePair("DRAFT", null)).toBe(true);
    expect(isValidStatusStagePair("DRAFT", "DISCOVERY")).toBe(false);
    expect(isValidStatusStagePair("ACTIVE", "NEW_BRIEF")).toBe(true);
    expect(isValidStatusStagePair("ACTIVE", null)).toBe(false);
    expect(isValidStatusStagePair("WON", null)).toBe(true);
    expect(isValidStatusStagePair("WON", "NEGOTIATION")).toBe(false);
    expect(isValidStatusStagePair("LOST", null)).toBe(true);
    expect(isValidStatusStagePair("LOST", "PROPOSAL")).toBe(false);
    expect(isValidStatusStagePair("CANCELLED", null)).toBe(true);
    expect(isValidStatusStagePair("CANCELLED", "QUALIFIED")).toBe(false);
  });

  it("repository rejects pairing violations on create", async () => {
    await expect(
      repos.opportunities.create({ ...baseDraft(), salesStage: "DISCOVERY" }),
    ).rejects.toThrow(/pairing/);
    await expect(
      repos.opportunities.create({ ...fullActive(), salesStage: null }),
    ).rejects.toThrow(/pairing/);
  });
});

describe("activation gate (ACTIVE minimum context)", () => {
  it("ACTIVE requires industry, moment, real project type, owner, revenue, next action + date", () => {
    const gate = (over: Partial<Parameters<typeof activationGateErrors>[0]>) =>
      activationGateErrors({
        accountId: "ACC-001" as AccountId,
        industryId: "IND-HEALTH" as IndustryId,
        momentEventId: "ME-2026-000001" as MomentEventId,
        projectTypeId: "PT-NEW-BRANCH" as ProjectTypeId,
        ownerId: OWNER,
        expectedRevenue: 1,
        nextAction: "call",
        nextActionDate: "2026-08-30",
        ...over,
      });
    expect(gate({})).toEqual([]);
    expect(gate({ industryId: null })).toContain("industry");
    expect(gate({ momentEventId: null })).toContain("moment");
    expect(gate({ projectTypeId: null })).toContain("project_type");
    expect(gate({ ownerId: null })).toContain("owner");
    expect(gate({ expectedRevenue: null })).toContain("estimated_revenue");
    expect(gate({ nextAction: "  " })).toContain("next_action");
    expect(gate({ nextActionDate: null })).toContain("next_action_date");
    // sub-industry is NOT part of the gate — optional by decision #3.
  });

  it("PT-UNSPECIFIED never satisfies activation for a new project", async () => {
    expect(
      activationGateErrors({
        accountId: "ACC-001" as AccountId,
        industryId: "IND-HEALTH" as IndustryId,
        momentEventId: "ME-2026-000001" as MomentEventId,
        projectTypeId: UNSPECIFIED_PROJECT_TYPE_ID,
        ownerId: OWNER,
        expectedRevenue: 1,
        nextAction: "call",
        nextActionDate: "2026-08-30",
      }),
    ).toContain("project_type");
    await expect(
      repos.opportunities.create({
        ...fullActive(),
        projectTypeId: UNSPECIFIED_PROJECT_TYPE_ID,
      }),
    ).rejects.toThrow(/activation gate/);
  });

  it("a fully-specified ACTIVE create passes; sub-industry stays optional", async () => {
    const { opportunity, created } = await repos.opportunities.create(fullActive());
    expect(created).toBe(true);
    expect(opportunity.status).toBe("ACTIVE");
    expect(opportunity.salesStage).toBe("NEW_BRIEF");
    expect(opportunity.subIndustryId).toBeNull();
  });

  it("a DRAFT may be incomplete (no industry / type / next-action date)", async () => {
    const { opportunity } = await repos.opportunities.create(baseDraft());
    expect(opportunity.status).toBe("DRAFT");
    expect(opportunity.salesStage).toBeNull();
    expect(opportunity.projectTypeId).toBeNull();
  });

  it("invalid master/FK references are rejected", async () => {
    await expect(
      repos.opportunities.create({
        ...fullActive(),
        industryId: "IND-NOPE" as IndustryId,
      }),
    ).rejects.toThrow(/industry/i);
    await expect(
      repos.opportunities.create({
        ...baseDraft(),
        accountId: "ACC-NOPE" as AccountId,
      }),
    ).rejects.toThrow(/account/i);
    await expect(
      repos.opportunities.create({
        ...baseDraft(),
        momentEventId: "ME-NOPE" as MomentEventId,
      }),
    ).rejects.toThrow(/moment/i);
  });
});

describe("stage history foundation", () => {
  it("create writes the first history entry (creation) for Step-3 atomicity", async () => {
    const { opportunity } = await repos.opportunities.create({
      ...fullActive(),
      name: "history check",
    });
    const history = await repos.opportunities.listStageHistory(opportunity.id);
    expect(history).toHaveLength(1);
    expect(history[0].fromStatus).toBeNull();
    expect(history[0].toStatus).toBe("ACTIVE");
    expect(history[0].toStage).toBe("NEW_BRIEF");
    expect(history[0].changedBy).toBe(OWNER);
    expect(history[0].changedAt.length).toBeGreaterThan(0);
  });
});

describe("project contacts", () => {
  const role = PROJECT_CONTACT_ROLES[0];

  it("links a contact, rejects the duplicate, lists the link", async () => {
    const { opportunity } = await repos.opportunities.create({
      ...baseDraft(),
      name: "contact links",
    });
    const contact = "CT-ACC-001-1" as ContactId;
    expect(await repos.opportunities.addProjectContact({
      opportunityId: opportunity.id, contactId: contact, role,
    })).toEqual({ added: true });
    // Duplicate (same opportunity, contact, role) → not added, no throw.
    expect(await repos.opportunities.addProjectContact({
      opportunityId: opportunity.id, contactId: contact, role,
    })).toEqual({ added: false });
    // Same contact, different role → allowed.
    expect(await repos.opportunities.addProjectContact({
      opportunityId: opportunity.id, contactId: contact, role: "MAIN_CONTACT",
    })).toEqual({ added: true });
    const links = await repos.opportunities.listProjectContacts(opportunity.id);
    expect(links).toHaveLength(2);
  });

  it("rejects contacts outside the organization and unknown opportunities", async () => {
    const { opportunity } = await repos.opportunities.create({
      ...baseDraft(),
      name: "contact guard",
    });
    await expect(
      repos.opportunities.addProjectContact({
        opportunityId: opportunity.id,
        contactId: "CT-OTHERORG-1" as ContactId,
        role,
      }),
    ).rejects.toThrow(/organization/i);
    await expect(
      repos.opportunities.addProjectContact({
        opportunityId: "OPP-NOPE" as OpportunityId,
        contactId: "CT-ACC-001-1" as ContactId,
        role,
      }),
    ).rejects.toThrow(/opportunity/i);
  });
});

describe("solution relations (Step-2 bug fix)", () => {
  it("create persists opportunity_solutions and they read back", async () => {
    const { opportunity } = await repos.opportunities.create({
      ...baseDraft(),
      name: "with solutions",
      solutionIds: ["SOL-START-001", "SOL-BUILD-001"] as never[],
    });
    const ids = await repos.opportunities.listSolutionIds(opportunity.id);
    expect(ids.sort()).toEqual(["SOL-BUILD-001", "SOL-START-001"]);
  });
});

describe("idempotency (client_request_id)", () => {
  it("same clientRequestId returns the surviving row, never a second project", async () => {
    const input = { ...baseDraft(), name: "idem" };
    const first = await repos.opportunities.create(input);
    const second = await repos.opportunities.create(input);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.opportunity.id).toBe(first.opportunity.id);
    const history = await repos.opportunities.listStageHistory(first.opportunity.id);
    expect(history).toHaveLength(1); // no double history either
  });
});

describe("legacy migration behavior", () => {
  it("legacy stages convert exactly — closed rows get NO synthetic stage", () => {
    expect(legacyStageToStatusStage("Discovery")).toEqual({ status: "ACTIVE", salesStage: "DISCOVERY" });
    expect(legacyStageToStatusStage("Solution Design")).toEqual({ status: "ACTIVE", salesStage: "SOLUTION_DESIGN" });
    expect(legacyStageToStatusStage("Proposal")).toEqual({ status: "ACTIVE", salesStage: "PROPOSAL" });
    expect(legacyStageToStatusStage("Negotiation")).toEqual({ status: "ACTIVE", salesStage: "NEGOTIATION" });
    expect(legacyStageToStatusStage("Won")).toEqual({ status: "WON", salesStage: null });
    expect(legacyStageToStatusStage("Lost")).toEqual({ status: "LOST", salesStage: null });
    expect(() => legacyStageToStatusStage("Qualified?")).toThrow(/Unknown legacy/);
  });

  it("mock legacy fixtures mirror the 0010 mapping (PT-UNSPECIFIED + account industry)", () => {
    const accountIndustry = new Map(ACCOUNTS.map((a) => [a.id, a.industryId]));
    expect(OPPORTUNITIES.length).toBeGreaterThan(0);
    for (const o of OPPORTUNITIES) {
      expect(isValidStatusStagePair(o.status, o.salesStage)).toBe(true);
      expect(o.projectTypeId).toBe(UNSPECIFIED_PROJECT_TYPE_ID);
      expect(o.industryId).toBe(accountIndustry.get(o.accountId) ?? null);
      if (o.status === "LOST") expect(o.lostReason).toBe(LEGACY_LOST_REASON);
      else expect(o.lostReason).toBeNull();
    }
  });

  it("migration 0010 SQL carries the same mapping and constraints (drift)", () => {
    // Legacy CASE mapping — old stage semantics preserved, not discarded.
    expect(MIGRATION).toContain("WHEN 'Won' THEN 'WON'");
    expect(MIGRATION).toContain("WHEN 'Lost' THEN 'LOST'");
    expect(MIGRATION).toContain("WHEN 'Discovery' THEN 'DISCOVERY'");
    expect(MIGRATION).toContain("WHEN 'Solution Design' THEN 'SOLUTION_DESIGN'");
    expect(MIGRATION).toContain("WHEN 'Proposal' THEN 'PROPOSAL'");
    expect(MIGRATION).toContain("WHEN 'Negotiation' THEN 'NEGOTIATION'");
    expect(MIGRATION).toContain("'PT-UNSPECIFIED'");
    expect(MIGRATION).toContain(
      "(SELECT a.industry_id FROM accounts a WHERE a.id = o.account_id)",
    );
    expect(MIGRATION).toContain(LEGACY_LOST_REASON);
    // Paired + reason + ACTIVE-context CHECKs.
    expect(MIGRATION).toContain("CHECK ((status = 'ACTIVE') = (sales_stage IS NOT NULL))");
    expect(MIGRATION).toContain("CHECK (status <> 'LOST' OR lost_reason IS NOT NULL)");
    expect(MIGRATION).toContain("CHECK (status <> 'CANCELLED' OR cancel_reason IS NOT NULL)");
    expect(MIGRATION).toContain(
      "CHECK (status <> 'ACTIVE' OR (industry_id IS NOT NULL AND project_type_id IS NOT NULL AND owner_id IS NOT NULL AND next_action IS NOT NULL))",
    );
    // Idempotency + relationship tables.
    expect(MIGRATION).toContain("uq_opportunities_client_request");
    expect(MIGRATION).toContain("CREATE TABLE project_stage_history");
    expect(MIGRATION).toContain("CREATE TABLE project_contacts");
    expect(MIGRATION).toContain("UNIQUE (opportunity_id, contact_id, role)");
    for (const role of PROJECT_CONTACT_ROLES) expect(MIGRATION).toContain(role);
  });
});
