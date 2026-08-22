import { describe, expect, it } from "vitest";
import { getMomentEvidence } from "@/lib/application/moments/get-moment-evidence";
import { generateSalesBrief } from "@/lib/application/moments/generate-sales-brief";
import { confirmMoment, rejectMoment } from "@/lib/application/moments/verify-moment";
import { getRepositories } from "@/lib/infrastructure";
import { DetectionResultSchema } from "@/lib/jobs/contracts";

// Runs against the mock adapter (MOMENT_OS_DATA_SOURCE unset).

describe("Moment evidence view", () => {
  it("returns event, account, signals and solutions for a detected moment", async () => {
    const view = await getMomentEvidence("ME-2026-000001");
    expect(view).not.toBeNull();
    expect(view!.account.id).toBe("ACC-001");
    expect(view!.signals.length).toBeGreaterThanOrEqual(2); // FB post + job posting
    expect(view!.signals.every((s) => s.rawText.length > 0)).toBe(true);
    expect(view!.solutions.length).toBeGreaterThan(0);
    expect(view!.master?.code).toBe(view!.event.momentType);
  });

  it("returns null for an unknown event", async () => {
    expect(await getMomentEvidence("ME-does-not-exist")).toBeNull();
  });
});

describe("Sales brief (PRD §46)", () => {
  it("assembles Why Now / questions / solutions / action from live data", async () => {
    const brief = await generateSalesBrief("ME-2026-000001");
    expect(brief).not.toBeNull();
    expect(brief!.accountName).toBe("ABC Clinic");
    expect(brief!.momentLine).toContain("EBM Expand");
    expect(brief!.whyNow.length).toBeGreaterThanOrEqual(2);
    expect(brief!.discoveryQuestions.length).toBeGreaterThan(0);
    expect(brief!.discoveryQuestions.length).toBeLessThanOrEqual(5);
    expect(brief!.solutions.length).toBeGreaterThan(0);
    expect(brief!.action.length).toBeGreaterThan(0);
    expect(brief!.nextMoment).toBe("EBM Launch");
  });
});

describe("Human verification (SOP step 3)", () => {
  it("confirm stamps verifier and promotes Detected → Review", async () => {
    const repos = await getRepositories();
    // ME-2026-000017 is a Detected event in mock data (Bangkok Bike engage)
    const before = await repos.moments.getById("ME-2026-000017");
    expect(before?.status).toBe("Detected");

    await confirmMoment("ME-2026-000017", "USR-010");

    const after = await repos.moments.getById("ME-2026-000017");
    expect(after?.verifiedBy).toBe("USR-010");
    expect(after?.verifiedAt).toBeTruthy();
    expect(after?.status).toBe("Review");
  });

  it("reject stamps verifier and closes the moment as Lost", async () => {
    await rejectMoment("ME-2026-000018", "USR-011");
    const repos = await getRepositories();
    const after = await repos.moments.getById("ME-2026-000018");
    expect(after?.verifiedBy).toBe("USR-011");
    expect(after?.status).toBe("Lost");
  });

  it("throws for unknown events", async () => {
    await expect(confirmMoment("ME-nope", "USR-010")).rejects.toThrow(/not found/);
  });
});

describe("AI detection contract", () => {
  it("accepts a valid structured detection payload", () => {
    const r = DetectionResultSchema.safeParse({
      momentCode: "EBM Expand",
      subMoment: "สัญญาณขยายสาขาใหม่",
      confidence: 0.92,
      expectedEventDate: "2026-10-01",
      reason: "Facebook Coming Soon + รับสมัครพนักงาน 18 ตำแหน่ง",
      recommendedSolutionIds: ["SOL-EXPAND-001"],
    });
    expect(r.success).toBe(true);
  });

  it("rejects out-of-range confidence and bad dates", () => {
    expect(
      DetectionResultSchema.safeParse({
        momentCode: "EBM Expand",
        subMoment: "x",
        confidence: 1.4,
        expectedEventDate: "2026-10-01",
        reason: "r",
        recommendedSolutionIds: [],
      }).success,
    ).toBe(false);
    expect(
      DetectionResultSchema.safeParse({
        momentCode: "EBM Expand",
        subMoment: "x",
        confidence: 0.5,
        expectedEventDate: "next month",
        reason: "r",
        recommendedSolutionIds: [],
      }).success,
    ).toBe(false);
  });
});
