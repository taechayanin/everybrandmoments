import { describe, expect, it } from "vitest";
import { createMockRepositories } from "@/lib/infrastructure/mock/repositories";
import { isActiveMomentStatus } from "@/lib/domain/moment";
import { priorityOf, totalScore } from "@/lib/domain/score";

// Store-side aggregates replaced listAll() scans on dashboards (pre-sprint
// cleanup). These tests pin the semantics both adapters must share: the mock
// results here must equal what the D1 SQL (CASE WHEN sums / filtered SELECTs)
// computes over the same data.

describe("account + moment aggregates", () => {
  it("account stats match a full-scan computation", async () => {
    const repos = createMockRepositories();
    const all = (await repos.accounts.search({ limit: 1000 })).items;
    const stats = await repos.accounts.stats();
    expect(stats.activeAccounts).toBe(all.filter((a) => a.customerSince).length);
    expect(stats.healthyCount).toBe(all.filter((a) => a.health === "Healthy").length);
    expect(stats.totalLtv).toBe(all.reduce((s, a) => s + a.ltv, 0));
    expect(stats.totalGp).toBe(all.reduce((s, a) => s + a.grossProfit, 0));
  });

  it("listByHealth returns only matching accounts, bounded", async () => {
    const repos = createMockRepositories();
    const atRisk = await repos.accounts.listByHealth("At Risk", 3);
    expect(atRisk.length).toBeLessThanOrEqual(3);
    for (const a of atRisk) expect(a.health).toBe("At Risk");
  });

  it("moment stats match a full-scan computation", async () => {
    const repos = createMockRepositories();
    const all = await repos.moments.listAll();
    const stats = await repos.moments.stats();
    expect(stats.detected).toBe(all.length);
    expect(stats.hot).toBe(
      all.filter((e) => priorityOf(totalScore(e.score)) === "HOT").length,
    );
    expect(stats.won).toBe(all.filter((e) => e.status === "Won").length);
  });

  it("listFiltered respects status, code, active and limit filters", async () => {
    const repos = createMockRepositories();

    const delivered = await repos.moments.listFiltered({
      statuses: ["Won", "Delivery"],
      orderByExpectedDateDesc: true,
      limit: 8,
    });
    expect(delivered.length).toBeLessThanOrEqual(8);
    for (const e of delivered) expect(["Won", "Delivery"]).toContain(e.status);
    for (let i = 1; i < delivered.length; i += 1) {
      expect(
        delivered[i - 1].expectedEventDate >= delivered[i].expectedEventDate,
      ).toBe(true);
    }

    const recover = await repos.moments.listFiltered({
      momentCodes: ["EBM Recover"],
      activeOnly: true,
      limit: 20,
    });
    for (const e of recover) {
      expect(e.momentType).toBe("EBM Recover");
      expect(isActiveMomentStatus(e.status)).toBe(true);
    }
  });
});
