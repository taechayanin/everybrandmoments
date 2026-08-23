"use server";

import { revalidatePath } from "next/cache";
import { confirmMoment, rejectMoment } from "@/lib/application/moments/verify-moment";
import { isMomentEventId } from "@/lib/domain/ids";
import {
  DEMO_USER,
  WRITES_DISABLED_MESSAGE,
  writesEnabled,
} from "@/lib/services/authz";

export interface VerifyActionResult {
  ok: boolean;
  /** false when the moment was already decided (idempotent no-op). */
  changed?: boolean;
  error?: string;
}

async function decide(
  eventId: string,
  action: "confirm" | "reject",
): Promise<VerifyActionResult> {
  if (!writesEnabled()) return { ok: false, error: WRITES_DISABLED_MESSAGE };
  if (!isMomentEventId(eventId)) return { ok: false, error: "Invalid event id" };
  try {
    const { changed } =
      action === "confirm"
        ? await confirmMoment(eventId, DEMO_USER)
        : await rejectMoment(eventId, DEMO_USER);
    revalidatePath(`/radar/${eventId}`);
    revalidatePath("/radar");
    return { ok: true, changed };
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "verify_action_error",
        action,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return { ok: false, error: "ไม่สามารถบันทึกได้ กรุณาลองใหม่" };
  }
}

export async function confirmMomentAction(eventId: string): Promise<VerifyActionResult> {
  return decide(eventId, "confirm");
}

export async function rejectMomentAction(eventId: string): Promise<VerifyActionResult> {
  return decide(eventId, "reject");
}
