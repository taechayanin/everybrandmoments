import type { AccountId, UserId } from "./ids";
import type { MomentCode } from "./moment";

export type AccountTier = "Strategic" | "Key" | "Growth" | "Standard";

export type CustomerHealth = "Healthy" | "Stable" | "At Risk" | "Churned";

export type WhitespaceCategory =
  | "Brand Identity"
  | "Website"
  | "Packaging"
  | "Uniform"
  | "Employee Kit"
  | "Merchandise"
  | "Signage"
  | "Campaign Materials"
  | "Corporate Gift";

export const WHITESPACE_CATEGORIES: readonly WhitespaceCategory[] = [
  "Brand Identity", "Website", "Packaging", "Uniform", "Employee Kit",
  "Merchandise", "Signage", "Campaign Materials", "Corporate Gift",
];

export interface Purchase {
  date: string; // ISO
  item: string;
  moment: MomentCode;
  amount: number;
}

export interface Contact {
  name: string;
  role: string;
  phone: string;
}

export interface Account {
  id: AccountId;
  name: string;
  industry: string;
  employeeSize: number;
  location: string;
  branchCount: number;
  tier: AccountTier;
  ownerId: UserId;
  customerSince: string | null; // null = prospect
  ltv: number;
  grossProfit: number;
  health: CustomerHealth;
  accountScore: number;
  /**
   * Mock-phase snapshot. Phase 2: derived from order history / won
   * opportunities via solution-category mapping (refactor plan §32) —
   * never a manually maintained duplicate truth.
   */
  whitespace: Record<WhitespaceCategory, boolean>;
  purchases: Purchase[];
  contacts: Contact[];
  notes?: string;
}
