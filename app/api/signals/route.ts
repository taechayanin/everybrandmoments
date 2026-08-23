import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { IngestSignalSchema, type Job } from "@/lib/jobs/contracts";
import type { AccountId } from "@/lib/types";
import { getRepositories } from "@/lib/infrastructure";
import { getBindings } from "@/lib/infrastructure/cloudflare/env";

const ORG = "ORG-001";

/**
 * Signal ingestion (refactor plan §39, hardened per pre-deploy review §1/§6):
 * authenticated caller → idempotent moment_signals insert (evidence) →
 * DETECT_MOMENT job on the queue → processing_status=queued.
 *
 * - Auth: `Authorization: Bearer <SIGNAL_INGEST_SECRET>` — fails closed when
 *   the secret is not configured. Sprint 7 replaces this with real auth.
 * - Idempotency: caller-supplied ingestKey (or content hash) + unique index;
 *   retries return the original signal instead of duplicating.
 * - Insert + queue send cannot be one transaction; signals left `pending`
 *   are re-enqueued by the jobs worker's reconciliation cron.
 * - Errors: generic message to the caller, detail to server logs only.
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
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  // --- Authentication (review 🔴 §1) — fail closed. ---
  const secret = (env as unknown as Record<string, unknown>).SIGNAL_INGEST_SECRET;
  if (typeof secret !== "string" || secret.length < 16) {
    console.error(JSON.stringify({ event: "signal_ingest_misconfigured" }));
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
  const auth = request.headers.get("authorization") ?? "";
  if (!timingSafeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const input = IngestSignalSchema.parse(await request.json());
    const accountId = input.accountId as AccountId; // regex-validated ^ACC- above

    const repos = await getRepositories();
    const account = await repos.accounts.getById(accountId);
    if (!account) {
      return NextResponse.json(
        { error: `Unknown account ${input.accountId}` },
        { status: 404 },
      );
    }

    const ingestKey =
      input.ingestKey ??
      (await contentHash(`${input.accountId}|${input.sourceType}|${input.rawText}`));

    const { signal, created } = await repos.signals.create({
      accountId,
      sourceType: input.sourceType,
      sourceRef: input.sourceRef,
      sourceUrl: input.sourceUrl,
      rawText: input.rawText,
      ingestKey,
    });

    if (!created) {
      // Idempotent replay — the original signal already exists (and was or
      // will be processed); do not enqueue a second detection job.
      return NextResponse.json(
        { ok: true, signalId: signal.id, duplicate: true },
        { status: 200 },
      );
    }

    const job: Job = {
      jobType: "DETECT_MOMENT",
      organizationId: ORG,
      accountId,
      signalIds: [signal.id],
    };
    await env.MOMENT_JOBS.send(job);
    await repos.signals.markStatus([signal.id], "queued");

    return NextResponse.json(
      { ok: true, signalId: signal.id, queued: "DETECT_MOMENT" },
      { status: 202 },
    );
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ") },
        { status: 400 },
      );
    }
    // Never leak internals (review 🔴 §1); reconciliation cron recovers any
    // signal inserted before a queue failure.
    console.error(
      JSON.stringify({
        event: "signal_ingest_error",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function contentHash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time comparison so the bearer check doesn't leak via timing. */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i += 1) diff |= ab[i] ^ bb[i];
  return diff === 0;
}
