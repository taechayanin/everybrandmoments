import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { IngestSignalSchema, type Job } from "@/lib/jobs/contracts";
import { getBindings } from "@/lib/infrastructure/cloudflare/env";

const ORG = "ORG-001";

/**
 * Signal ingestion (refactor plan §39): CRM webhook / crawler / manual signal
 * → moment_signals row (evidence) → DETECT_MOMENT job on the queue.
 * The page-render path never runs detection synchronously.
 *
 * Requires the D1/Queues bindings — mock mode (next dev) returns 503.
 */
export async function POST(request: Request) {
  if (process.env.MOMENT_OS_DATA_SOURCE !== "d1") {
    return NextResponse.json(
      { error: "Signal ingestion requires MOMENT_OS_DATA_SOURCE=d1" },
      { status: 503 },
    );
  }

  let env: CloudflareEnv;
  try {
    env = await getBindings();
  } catch {
    return NextResponse.json({ error: "Cloudflare bindings unavailable" }, { status: 503 });
  }

  try {
    const input = IngestSignalSchema.parse(await request.json());

    const account = await env.DB.prepare(
      "SELECT id FROM accounts WHERE organization_id = ? AND id = ?",
    )
      .bind(ORG, input.accountId)
      .first();
    if (!account) {
      return NextResponse.json({ error: `Unknown account ${input.accountId}` }, { status: 404 });
    }

    const signalId = `SIG-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO moment_signals (
         id, organization_id, account_id, source_type, source_ref, source_url,
         raw_text, detected_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        signalId, ORG, input.accountId, input.sourceType,
        input.sourceRef ?? null, input.sourceUrl ?? null, input.rawText, now,
      )
      .run();

    const job: Job = {
      jobType: "DETECT_MOMENT",
      organizationId: ORG,
      accountId: input.accountId,
      signalIds: [signalId],
    };
    await env.MOMENT_JOBS.send(job);

    return NextResponse.json({ ok: true, signalId, queued: "DETECT_MOMENT" }, { status: 202 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ") },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
