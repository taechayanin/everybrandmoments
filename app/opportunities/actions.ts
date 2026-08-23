"use server";

import { revalidatePath } from "next/cache";
import { createProject } from "@/lib/application/projects/create-project";
import {
  activateProject,
  updateProjectStage,
} from "@/lib/application/projects/project-lifecycle";
import { addProjectContact } from "@/lib/application/projects/project-contacts";
import { getProjectWizardContext } from "@/lib/application/projects/get-project-pipeline";
import { IdempotencyConflictError } from "@/lib/domain/opportunity";
import {
  DEMO_USER,
  WRITES_DISABLED_MESSAGE,
  writesEnabled,
} from "@/lib/services/authz";
import { isAccountId } from "@/lib/domain/ids";
import type { CreateProjectInput } from "@/lib/validation/project";

// Step 4 — server actions for the Project Pipeline. Thin: gate → use case →
// revalidate. Every business rule lives in the application/domain layer;
// nothing here re-implements validation (UI hints stay advisory).

type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; code?: "IDEMPOTENCY_CONFLICT" };

function failure(e: unknown): ActionResult<never> {
  if (e instanceof IdempotencyConflictError) {
    return {
      ok: false,
      code: "IDEMPOTENCY_CONFLICT",
      error:
        "คำขอนี้เคยถูกสร้างด้วยข้อมูลอื่นแล้ว — โปรดเปิดฟอร์มใหม่แล้วลองอีกครั้ง",
    };
  }
  return { ok: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
}

export async function loadWizardContextAction(accountId: string) {
  if (!isAccountId(accountId)) {
    return { ok: false as const, error: "Invalid account id" };
  }
  try {
    return { ok: true as const, data: await getProjectWizardContext(accountId) };
  } catch (e) {
    return failure(e);
  }
}

export async function createProjectAction(
  input: Omit<CreateProjectInput, "actorId">,
): Promise<ActionResult<{ projectId: string; created: boolean }>> {
  if (!writesEnabled()) return { ok: false, error: WRITES_DISABLED_MESSAGE };
  try {
    const { project, created } = await createProject({
      ...input,
      actorId: DEMO_USER,
    });
    revalidatePath("/opportunities");
    return { ok: true, data: { projectId: project.id, created } };
  } catch (e) {
    return failure(e);
  }
}

export async function activateProjectAction(input: {
  opportunityId: string;
  industryId?: string;
  subIndustryId?: string;
  projectTypeId?: string;
  nextAction?: string;
  nextActionDate?: string;
  clientRequestId: string;
}): Promise<ActionResult> {
  if (!writesEnabled()) return { ok: false, error: WRITES_DISABLED_MESSAGE };
  try {
    await activateProject({ ...input, actorId: DEMO_USER } as never);
    revalidatePath("/opportunities");
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

export async function updateProjectStageAction(input: {
  opportunityId: string;
  toStage: string;
  reason?: string;
  clientRequestId: string;
}): Promise<ActionResult> {
  if (!writesEnabled()) return { ok: false, error: WRITES_DISABLED_MESSAGE };
  try {
    await updateProjectStage({ ...input, actorId: DEMO_USER } as never);
    revalidatePath("/opportunities");
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

export async function addProjectContactAction(input: {
  opportunityId: string;
  contactId: string;
  role: string;
}): Promise<ActionResult<{ added: boolean }>> {
  if (!writesEnabled()) return { ok: false, error: WRITES_DISABLED_MESSAGE };
  try {
    const result = await addProjectContact({ ...input, actorId: DEMO_USER } as never);
    revalidatePath("/opportunities");
    return { ok: true, data: result };
  } catch (e) {
    return failure(e);
  }
}
