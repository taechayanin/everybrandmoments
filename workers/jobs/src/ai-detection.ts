import Anthropic from "@anthropic-ai/sdk";
import {
  DetectionResultSchema,
  type DetectionResult,
} from "../../../lib/jobs/contracts";

// Level 3 AI detection (PRD §12) behind the same DetectionResult contract as
// the keyword rules. The AI's JSON is validated with zod before any D1 write
// (refactor plan §40) — an invalid or refused response returns null and the
// caller falls back to RULE-KEYWORD-L2.

const DEFAULT_MODEL = "claude-opus-5";

// Structured-output schema: objects need additionalProperties:false + required.
// Numeric min/max constraints are unsupported here — zod enforces them after.
const DETECTION_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    momentCode: {
      type: "string",
      enum: [
        "EBM Start", "EBM Build", "EBM Hire", "EBM Welcome", "EBM Launch",
        "EBM Sell", "EBM Deliver", "EBM Thanks", "EBM Repeat", "EBM Engage",
        "EBM Grow", "EBM Milestone", "EBM Celebrate", "EBM Season", "EBM Expand",
        "EBM Change", "EBM Recover", "EBM Return", "EBM Farewell", "EBM Close",
      ],
      description: "The single business moment these signals most strongly indicate",
    },
    subMoment: {
      type: "string",
      description: "Short Thai description of the specific situation, e.g. 'สัญญาณขยายสาขาใหม่ บางแค'",
    },
    confidence: {
      type: "number",
      description: "0.0-1.0 - how confident the signals support this moment",
    },
    expectedEventDate: {
      type: "string",
      format: "date",
      description: "Best-estimate ISO date (YYYY-MM-DD) when the moment will occur",
    },
    reason: {
      type: "string",
      description: "One or two sentences (Thai) citing the concrete evidence in the signals",
    },
    recommendedSolutionIds: {
      type: "array",
      items: { type: "string" },
      description: "Solution ids (SOL-...) from the provided catalog that fit this moment; empty if unsure",
    },
  },
  required: [
    "momentCode", "subMoment", "confidence", "expectedEventDate",
    "reason", "recommendedSolutionIds",
  ],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are the Moment Detection engine for Every Brand Moments — a Thai B2B gifting, merchandise, and brand-production company.

You receive raw business signals about one customer account (social posts, job postings, complaints, CRM notes — mostly Thai). Classify what business moment is happening from the 20 EBM master moments, so the Customer Solution team can act before the customer asks.

Solution catalog (for recommendedSolutionIds — use only ids that clearly fit):
SOL-EXPAND-001 New Branch Expansion Kit · SOL-HIRE-001 Uniform Program · SOL-WELCOME-001 Employee Welcome Kit · SOL-LAUNCH-001 Grand Opening Kit · SOL-MILESTONE-001 Anniversary Celebration Set · SOL-SEASON-001 Seasonal Gift Set · SOL-RECOVER-001 Apology & Recovery Kit · SOL-RETURN-001 Win-back Campaign Kit · SOL-BUILD-001 Store Signage · SOL-BUILD-002 Packaging System · SOL-CHANGE-001 Rebrand Rollout · SOL-ENGAGE-002 Townhall Kit

Today's date is provided in the user message. Ground your confidence in the actual evidence: explicit announcements are high confidence; vague signals are low. A complaint is EBM Recover even if other signals exist — customer recovery outranks sales moments.`;

export interface AiDetectorEnv {
  ANTHROPIC_API_KEY?: string;
  AI_MODEL?: string;
}

/**
 * Returns a validated DetectionResult, or null when AI detection is
 * unavailable (no key), refused, or invalid — callers must fall back to rules.
 */
export async function detectWithClaude(
  env: AiDetectorEnv,
  signals: { sourceType: string; rawText: string }[],
): Promise<(DetectionResult & { model: string }) | null> {
  if (!env.ANTHROPIC_API_KEY) return null;

  const model = env.AI_MODEL ?? DEFAULT_MODEL;
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const signalText = signals
    .map((s, i) => `[Signal ${i + 1} — ${s.sourceType}]\n${s.rawText}`)
    .join("\n\n");

  try {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 4096,
      // Safety classifiers can decline; route declined requests to the
      // recommended fallback model server-side instead of failing the job.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      output_config: {
        format: { type: "json_schema", schema: DETECTION_OUTPUT_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: `Today: ${new Date().toISOString().slice(0, 10)}\n\n${signalText}`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      console.warn(JSON.stringify({ event: "ai_detection_refused", model: response.model }));
      return null;
    }

    const text = response.content.find((b) => b.type === "text")?.text;
    if (!text) return null;

    const parsed = DetectionResultSchema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      console.warn(
        JSON.stringify({ event: "ai_detection_invalid", error: parsed.error.message }),
      );
      return null;
    }
    return { ...parsed.data, model: response.model };
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "ai_detection_error",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
}
