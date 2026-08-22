"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { createMoment } from "@/lib/application/moments/create-moment";
import type { CreateMomentFormInput } from "@/lib/validation/moment";

export interface CreateMomentActionResult {
  ok: boolean;
  eventId?: string;
  error?: string;
}

export async function createMomentAction(
  input: CreateMomentFormInput,
): Promise<CreateMomentActionResult> {
  try {
    const event = await createMoment(input);
    revalidatePath("/radar");
    revalidatePath("/");
    return { ok: true, eventId: event.id };
  } catch (err) {
    if (err instanceof ZodError) {
      return { ok: false, error: err.issues.map((i) => i.message).join(", ") };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
