import { getRepositories } from "@/lib/infrastructure";
import {
  AddProjectContactSchema,
  type AddProjectContactUseCaseInput,
} from "@/lib/validation/project";

/**
 * Step 3 — link a Contact to a Project with a buying-committee role.
 * Ownership rules (reviewer §3):
 *   1. organization must match (repository enforces in-statement),
 *   2. the contact's account must equal the project's account — cross-account
 *      links are rejected even inside the same organization.
 */
export async function addProjectContact(
  raw: AddProjectContactUseCaseInput,
): Promise<{ added: boolean }> {
  const input = AddProjectContactSchema.parse(raw);
  const repos = await getRepositories();

  const project = await repos.opportunities.getById(input.opportunityId);
  if (!project) throw new Error(`Project not found: ${input.opportunityId}`);
  const contact = await repos.contacts.getById(input.contactId);
  if (!contact) throw new Error(`Contact not found: ${input.contactId}`);
  if (contact.accountId !== project.accountId) {
    throw new Error(
      `Contact ${input.contactId} belongs to a different account than the project`,
    );
  }

  return repos.opportunities.addProjectContact({
    opportunityId: project.id,
    contactId: input.contactId,
    role: input.role,
  });
}
