import { describe, expect, it } from "vitest";
import { SCORE_MAX, isValidScore, priorityOf, totalScore } from "@/lib/domain/score";
import { MOMENT_EVENTS } from "@/lib/infrastructure/mock/events";

describe("Moment Score formula (PRD §13)", () => {
  it("caps at 100 with 30/25/20/15/10 components", () => {
    expect(
      totalScore({ businessFit: 30, intent: 25, timing: 20, wallet: 15, relationship: 10 }),
    ).toBe(100);
    expect(SCORE_MAX.businessFit + SCORE_MAX.intent + SCORE_MAX.timing + SCORE_MAX.wallet + SCORE_MAX.relationship).toBe(100);
  });

  it("maps score bands to priorities", () => {
    expect(priorityOf(100)).toBe("HOT");
    expect(priorityOf(85)).toBe("HOT");
    expect(priorityOf(84)).toBe("WARM");
    expect(priorityOf(70)).toBe("WARM");
    expect(priorityOf(69)).toBe("NURTURE");
    expect(priorityOf(50)).toBe("NURTURE");
    expect(priorityOf(49)).toBe("WATCH");
    expect(priorityOf(0)).toBe("WATCH");
  });

  it("every mock event carries a valid score breakdown", () => {
    for (const e of MOMENT_EVENTS) {
      expect(isValidScore(e.score), `invalid score on ${e.id}`).toBe(true);
      expect(totalScore(e.score)).toBeLessThanOrEqual(100);
      expect(totalScore(e.score)).toBeGreaterThan(0);
    }
  });
});
