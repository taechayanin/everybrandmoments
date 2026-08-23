"use server";

// CRM server actions (sprint Step 3). Every write follows the same contract
// (spec §36): write gate → zod strict parse → application use case →
// revalidate. Business rules live in lib/application — never here.

import { revalidatePath } from "next/cache";
import type { ZodType } from "zod";
import { createNote } from "@/lib/application/activities/create-note";
import { logCall } from "@/lib/application/activities/log-call";
import { logMeeting } from "@/lib/application/activities/log-meeting";
import {
  deleteActivity,
  updateActivity,
} from "@/lib/application/activities/update-activity";
import { CrmError } from "@/lib/application/activities/shared";
import { createContact, updateContact } from "@/lib/application/contacts/create-contact";
import { completeTask, createFollowUp } from "@/lib/application/tasks/create-follow-up";
import {
  CompleteTaskSchema,
  CreateContactSchema,
  CreateNoteSchema,
  CreateTaskSchema,
  LogCallSchema,
  LogMeetingSchema,
  UpdateActivitySchema,
  UpdateContactSchema,
} from "@/lib/contracts/crm";
import { isActivityId } from "@/lib/domain/activity";
import type { ActivityId, TaskId } from "@/lib/types";
import {
  DEMO_USER,
  WRITES_DISABLED_MESSAGE,
  writesEnabled,
} from "@/lib/services/authz";

export interface CrmActionResult {
  ok: boolean;
  /** true when an idempotent retry resolved to the original write. */
  deduped?: boolean;
  error?: string;
}

function parseOr<T>(schema: ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new CrmError(
      `ข้อมูลไม่ถูกต้อง: ${issue.path.join(".") || "input"} — ${issue.message}`,
    );
  }
  return parsed.data;
}

function failure(err: unknown): CrmActionResult {
  if (err instanceof CrmError) return { ok: false, error: err.message };
  console.error("[crm-action]", err);
  return { ok: false, error: "เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่" };
}

export async function createNoteAction(input: unknown): Promise<CrmActionResult> {
  if (!writesEnabled()) return { ok: false, error: WRITES_DISABLED_MESSAGE };
  try {
    const data = parseOr(CreateNoteSchema, input);
    const result = await createNote({ ...data, createdBy: DEMO_USER });
    revalidatePath(`/accounts/${data.accountId}`);
    return { ok: true, deduped: result.deduped };
  } catch (err) {
    return failure(err);
  }
}

export async function logCallAction(input: unknown): Promise<CrmActionResult> {
  if (!writesEnabled()) return { ok: false, error: WRITES_DISABLED_MESSAGE };
  try {
    const data = parseOr(LogCallSchema, input);
    const result = await logCall({ ...data, createdBy: DEMO_USER });
    revalidatePath(`/accounts/${data.accountId}`);
    return { ok: true, deduped: result.deduped };
  } catch (err) {
    return failure(err);
  }
}

export async function logMeetingAction(input: unknown): Promise<CrmActionResult> {
  if (!writesEnabled()) return { ok: false, error: WRITES_DISABLED_MESSAGE };
  try {
    const data = parseOr(LogMeetingSchema, input);
    const result = await logMeeting({ ...data, createdBy: DEMO_USER });
    revalidatePath(`/accounts/${data.accountId}`);
    return { ok: true, deduped: result.deduped };
  } catch (err) {
    return failure(err);
  }
}

export async function createTaskAction(input: unknown): Promise<CrmActionResult> {
  if (!writesEnabled()) return { ok: false, error: WRITES_DISABLED_MESSAGE };
  try {
    const data = parseOr(CreateTaskSchema, input);
    const result = await createFollowUp({ ...data, createdBy: DEMO_USER });
    if (result.task.accountId) revalidatePath(`/accounts/${result.task.accountId}`);
    return { ok: true, deduped: !result.created };
  } catch (err) {
    return failure(err);
  }
}

export async function completeTaskAction(input: unknown): Promise<CrmActionResult> {
  if (!writesEnabled()) return { ok: false, error: WRITES_DISABLED_MESSAGE };
  try {
    const data = parseOr(CompleteTaskSchema, input);
    const result = await completeTask(data.taskId as TaskId);
    if (result.task?.accountId) revalidatePath(`/accounts/${result.task.accountId}`);
    return { ok: true, deduped: !result.changed };
  } catch (err) {
    return failure(err);
  }
}

export async function createContactAction(input: unknown): Promise<CrmActionResult> {
  if (!writesEnabled()) return { ok: false, error: WRITES_DISABLED_MESSAGE };
  try {
    const data = parseOr(CreateContactSchema, input);
    await createContact(data);
    revalidatePath(`/accounts/${data.accountId}`);
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}

export async function updateContactAction(input: unknown): Promise<CrmActionResult> {
  if (!writesEnabled()) return { ok: false, error: WRITES_DISABLED_MESSAGE };
  try {
    const data = parseOr(UpdateContactSchema, input);
    const contact = await updateContact(data);
    revalidatePath(`/accounts/${contact.accountId}`);
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}

export async function updateActivityAction(input: unknown): Promise<CrmActionResult> {
  if (!writesEnabled()) return { ok: false, error: WRITES_DISABLED_MESSAGE };
  try {
    const data = parseOr(UpdateActivitySchema, input);
    const activity = await updateActivity({
      ...data,
      activityId: data.activityId as ActivityId,
    });
    revalidatePath(`/accounts/${activity.accountId}`);
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}

export async function deleteActivityAction(input: unknown): Promise<CrmActionResult> {
  if (!writesEnabled()) return { ok: false, error: WRITES_DISABLED_MESSAGE };
  try {
    const id = typeof input === "string" ? input : "";
    if (!isActivityId(id)) throw new CrmError("Activity id ไม่ถูกต้อง");
    const result = await deleteActivity(id as ActivityId, DEMO_USER);
    if (!result.deleted) return { ok: false, error: "ไม่พบ Activity หรือถูกลบไปแล้ว" };
    if (result.accountId) revalidatePath(`/accounts/${result.accountId}`);
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}
