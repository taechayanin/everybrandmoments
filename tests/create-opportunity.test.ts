import { describe, expect, it } from "vitest";
import { createOpportunity } from "@/lib/application/opportunities/create-opportunity";
import { getRepositories } from "@/lib/infrastructure";

// Runs against the mock adapter (MOMENT_OS_DATA_SOURCE unset).

describe("createOpportunity use case", () => {
  it("creates an opportunity from a qualified moment and advances its status", async () => {
    const opp = await createOpportunity({
      accountId: "ACC-001",
      momentEventId: "ME-2026-000001",
      solutionIds: ["SOL-EXPAND-001", "SOL-WELCOME-001"],
      discoveryAnsweredCount: 3,
      channelMode: "OFFLINE",
      channel: "EBM Business Center",
      ownerId: "USR-010",
    });

    expect(opp.id.startsWith("OPP-")).toBe(true);
    expect(opp.accountId).toBe("ACC-001");
    expect(opp.stage).toBe("Discovery");
    expect(opp.expectedRevenue).toBeGreaterThan(0);

    const repos = await getRepositories();
    const event = await repos.moments.getById("ME-2026-000001");
    expect(event?.status).toBe("Discovery Completed");

    const stored = await repos.opportunities.getById(opp.id);
    expect(stored?.name).toContain("ABC Clinic");
  });

  it("rejects creation without enough discovery answers", async () => {
    await expect(
      createOpportunity({
        accountId: "ACC-001",
        momentEventId: "ME-2026-000001",
        solutionIds: ["SOL-EXPAND-001"],
        discoveryAnsweredCount: 1,
        channelMode: "ONLINE",
        ownerId: "USR-010",
      }),
    ).rejects.toThrow();
  });

  it("rejects a moment event that belongs to another account", async () => {
    await expect(
      createOpportunity({
        accountId: "ACC-002",
        momentEventId: "ME-2026-000001", // belongs to ACC-001
        solutionIds: ["SOL-EXPAND-001"],
        discoveryAnsweredCount: 3,
        channelMode: "ONLINE",
        ownerId: "USR-010",
      }),
    ).rejects.toThrow(/does not belong/);
  });

  it("rejects unknown solution ids", async () => {
    await expect(
      createOpportunity({
        accountId: "ACC-001",
        momentEventId: "ME-2026-000001",
        solutionIds: ["SOL-NOPE-999"],
        discoveryAnsweredCount: 3,
        channelMode: "ONLINE",
        ownerId: "USR-010",
      }),
    ).rejects.toThrow(/Unknown solution/);
  });
});
