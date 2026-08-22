import type { SolutionId } from "./ids";
import type { MomentCode, Stakeholder } from "./moment";

export interface SolutionPackage {
  name: string;
  startingPrice: number;
  items: string[];
}

export interface Solution {
  id: SolutionId;
  name: string;
  moment: MomentCode;
  stakeholders: Stakeholder[];
  industries: string[];
  startingPrice: number;
  averageWallet: number;
  grossMarginTarget: number; // 0..1
  leadTimeDays: number;
  productionRequired: boolean;
  recommendedOffline: boolean;
  /** ID-based relations — solution names are display-only (refactor plan §21). */
  crossSellSolutionIds: SolutionId[];
  nextMoment: MomentCode;
  packages?: SolutionPackage[];
}

export type SolutionRelationType =
  | "CROSS_SELL"
  | "UPSELL"
  | "BUNDLE"
  | "NEXT"
  | "ALTERNATIVE";
