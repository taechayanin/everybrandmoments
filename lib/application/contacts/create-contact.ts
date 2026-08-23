import { getRepositories } from "@/lib/infrastructure";
import type { CreateContactInput, UpdateContactInput } from "@/lib/contracts/crm";
import type { AccountId, ContactId, CrmContact } from "@/lib/types";
import { CrmError } from "../activities/shared";

/** 👤 Add Contact (spec §15) — account must exist in this organization.
 * Idempotent on clientRequestId: a retried submit returns the original row. */
export async function createContact(
  input: CreateContactInput,
): Promise<{ contact: CrmContact; created: boolean }> {
  const repos = await getRepositories();
  const account = await repos.accounts.getById(input.accountId as AccountId);
  if (!account) throw new CrmError("ไม่พบ Account นี้ในองค์กร");
  return repos.contacts.create({
    accountId: input.accountId as AccountId,
    name: input.name,
    jobTitle: input.jobTitle,
    department: input.department,
    email: input.email,
    phone: input.phone,
    lineId: input.lineId,
    buyingRole: input.buyingRole,
    influenceLevel: input.influenceLevel,
    isPrimary: input.isPrimary,
    status: input.status,
    notes: input.notes,
    clientRequestId: input.clientRequestId,
  });
}

export async function updateContact(input: UpdateContactInput): Promise<CrmContact> {
  const repos = await getRepositories();
  const existing = await repos.contacts.getById(input.contactId as ContactId);
  if (!existing) throw new CrmError("ไม่พบ Contact นี้ในองค์กร");
  const updated = await repos.contacts.update(input.contactId as ContactId, {
    name: input.name,
    jobTitle: input.jobTitle,
    department: input.department,
    email: input.email,
    phone: input.phone,
    lineId: input.lineId,
    buyingRole: input.buyingRole,
    influenceLevel: input.influenceLevel,
    isPrimary: input.isPrimary,
    status: input.status,
    notes: input.notes,
  });
  if (!updated) throw new CrmError("แก้ไข Contact ไม่สำเร็จ");
  return updated;
}
