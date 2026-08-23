import { getRepositories } from "@/lib/infrastructure";
import type { ActivityListOptions } from "@/lib/repositories";
import type { AccountId, Activity, ContactId, CrmContact } from "@/lib/types";

export interface AccountTimelineView {
  items: Activity[];
  nextCursor?: string;
  /** Contacts referenced by this page — one bounded batch lookup, no N+1. */
  contactsById: Map<string, CrmContact>;
}

/** Account Timeline read path (spec §24): 1 keyset query + 1 batch contact
 * hydration for the page — never per-activity loads (review req 8). */
export async function getAccountTimeline(
  accountId: AccountId,
  options: ActivityListOptions = {},
): Promise<AccountTimelineView> {
  const repos = await getRepositories();
  const page = await repos.activities.listByAccount(accountId, options);
  const contactIds = [
    ...new Set(
      page.items
        .map((a) => a.contactId)
        .filter((id): id is ContactId => id !== null),
    ),
  ];
  const contacts =
    contactIds.length > 0 ? await repos.contacts.getByIds(contactIds) : [];
  return {
    items: page.items,
    nextCursor: page.nextCursor,
    contactsById: new Map(contacts.map((c) => [c.id as string, c])),
  };
}
