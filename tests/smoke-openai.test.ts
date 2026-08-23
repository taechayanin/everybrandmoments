import { describe, expect, it } from "vitest";
import { validateAnalysisAgainstCatalog } from "@/lib/application/ai/decide-suggestion";
import { MASTER_MOMENTS } from "@/lib/domain/master-moments";
import { SOLUTIONS } from "@/lib/infrastructure/mock/solutions";
import {
  analyzeWithAI,
  classifyAnalysisError,
} from "../workers/jobs/src/analyze-activity";
import { detectWithAI } from "../workers/jobs/src/ai-detection";

// REAL OpenAI provider smoke test (final provider gate).
//
// Runs ONLY when OPENAI_API_KEY is present in the environment (source it from
// workers/jobs/.dev.vars — gitignored; the key is never read into any output,
// log, or assertion here). Normal test runs skip this file entirely.

const KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.AI_MODEL; // undefined = provider default gpt-5.6-luna
const EFFORT = process.env.AI_REASONING_EFFORT; // undefined = default low

describe.skipIf(!KEY)("REAL OpenAI smoke — provider gate", () => {
  const env = { OPENAI_API_KEY: KEY, AI_MODEL: MODEL, AI_REASONING_EFFORT: EFFORT };

  it("activity analysis: auth + strict structured output + zod + catalogs", async () => {
    const started = Date.now();
    const outcome = await analyzeWithAI(env, {
      activityType: "MEETING",
      title: "ประชุมกับคุณหมอวิภา",
      body:
        "ประชุมกับคุณหมอวิภา (Founder) ที่คลินิกพระราม 2 — คลินิกกำลังเปิดสาขาที่ 4 " +
        "ที่บางแค กำหนดเปิดกลางเดือนตุลาคมนี้ รับพนักงานใหม่ประมาณ 20 คน " +
        "ต้องการยูนิฟอร์มพนักงานและ welcome kit งบประมาณราว 250,000-300,000 บาท " +
        "ขอดูตัวอย่างสินค้าก่อนสิ้นเดือนนี้ นัดส่งใบเสนอราคาศุกร์หน้า",
      outcome: null,
      occurredAt: new Date().toISOString(),
    });
    const ms = Date.now() - started;

    expect(outcome.type).toBe("success");
    if (outcome.type !== "success") return;
    // Model check — no silent fallback to a different family.
    const expected = MODEL ?? "gpt-5.6-luna";
    expect(outcome.model.startsWith(expected)).toBe(true);
    // Zod already passed inside analyzeWithAI; sanity-check the content.
    expect(outcome.result.confidence).toBeGreaterThan(0);
    expect(outcome.result.confidence).toBeLessThanOrEqual(1);
    expect(outcome.result.detectedMomentCodes.length).toBeGreaterThan(0);
    // Catalog validation with the REAL master/solution catalogs.
    const validated = validateAnalysisAgainstCatalog(
      outcome.result,
      new Set(MASTER_MOMENTS.map((m) => m.code)),
      new Set(SOLUTIONS.map((s) => s.id)),
    );
    expect(validated.momentCode).not.toBeNull();
    // Metrics only — never content, never the key.
    console.log(
      JSON.stringify({
        smoke: "activity",
        effort: EFFORT ?? "low",
        model: outcome.model,
        ms,
        usage: outcome.usage,
        moments: outcome.result.detectedMomentCodes,
        validatedMoment: validated.momentCode,
        validatedSolutions: validated.solutionIds,
        confidence: outcome.result.confidence,
      }),
    );
  }, 120_000);

  it("moment detection: auth + structured output + valid moment code", async () => {
    const started = Date.now();
    const outcome = await detectWithAI(env, [
      {
        sourceType: "Social Signal",
        rawText:
          "โพสต์เฟซบุ๊กของ ABC Clinic: 'Coming Soon! สาขาใหม่บางแค เปิดตุลาคมนี้ " +
          "พบกับโปรโมชั่นเปิดสาขา และทีมงานใหม่กว่า 20 ชีวิต'",
      },
    ]);
    const ms = Date.now() - started;

    expect(outcome.type).toBe("success");
    if (outcome.type !== "success") return;
    expect(
      MASTER_MOMENTS.some((m) => m.code === outcome.result.momentCode),
    ).toBe(true);
    expect(outcome.result.confidence).toBeGreaterThan(0);
    expect(outcome.result.confidence).toBeLessThanOrEqual(1);
    console.log(
      JSON.stringify({
        smoke: "detection",
        effort: EFFORT ?? "low",
        model: outcome.model,
        ms,
        usage: outcome.usage,
        momentCode: outcome.result.momentCode,
        confidence: outcome.result.confidence,
      }),
    );
  }, 120_000);

  it("failure smoke: invalid key classifies as config (BLOCKED path), never success", async () => {
    const outcome = await analyzeWithAI(
      { OPENAI_API_KEY: "sk-invalid-smoke-key", AI_MODEL: MODEL },
      {
        activityType: "NOTE", title: null, body: "test", outcome: null,
        occurredAt: new Date().toISOString(),
      },
    );
    expect(outcome.type).toBe("retry");
    if (outcome.type === "retry") {
      expect(outcome.category).toBe("config"); // -> BLOCKED, never PROCESSED
    }
  }, 60_000);

  it("failure smoke: 429/5xx classification stays transient", () => {
    expect(classifyAnalysisError({ status: 429 })).toBe("transient");
    expect(classifyAnalysisError({ status: 503 })).toBe("transient");
    expect(classifyAnalysisError({ status: 401 })).toBe("config");
  });
});
