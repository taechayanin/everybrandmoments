"use server";

import { revalidatePath } from "next/cache";
import { confirmMoment, rejectMoment } from "@/lib/application/moments/verify-moment";
import { isMomentEventId } from "@/lib/domain/ids";

// Auth arrives in Sprint 7 — until then the demo persona performs verifications.
const CURRENT_USER = "USR-010" as const;

export interface VerifyActionResult {
  ok: boolean;
  error?: string;
}

export async function confirmMomentAction(eventId: string): Promise<VerifyActionResult> {
  if (!isMomentEventId(eventId)) return { ok: false, error: "Invalid event id" };
  try {
    await confirmMoment(eventId, CURRENT_USER);
    revalidatePath(`/radar/${eventId}`);
    revalidatePath("/radar");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function rejectMomentAction(eventId: string): Promise<VerifyActionResult> {
  if (!isMomentEventId(eventId)) return { ok: false, error: "Invalid event id" };
  try {
    await rejectMoment(eventId, CURRENT_USER);
    revalidatePath(`/radar/${eventId}`);
    revalidatePath("/radar");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
