// ---------- Core enums ----------

export type LifecyclePhase =
  | "START"
  | "BUILD"
  | "LAUNCH"
  | "OPERATE"
  | "GROW"
  | "CHANGE"
  | "EXIT";

export type Stakeholder = "Business" | "Employee" | "Customer" | "Partner";

export type Priority = "HOT" | "WARM" | "NURTURE" | "WATCH";

export type MomentEventStatus =
  | "Detected"
  | "Review"
  | "Contacted"
  | "Qualified"
  | "Meeting Booked"
  | "Discovery Completed"
  | "Solution Design"
  | "Proposal"
  | "Negotiation"
  | "Won"
  | "Lost"
  | "Delivery"
  | "Next Moment";

export type TriggerSource =
  | "Social Signal"
  | "CRM Note"
  | "Lead Form"
  | "Meeting Note"
  | "Order History"
  | "Complaint"
  | "Job Posting"
  | "Website"
  | "News"
  | "Manual"
  | "Rule Engine";

export type Channel =
  | "EBM Business Center"
  | "EBM Studio"
  | "EBM Partner Point"
  | "Video Consultation"
  | "Inside Sales";

export type AccountTier = "Strategic" | "Key" | "Growth" | "Standard";

export type CustomerHealth = "Healthy" | "Stable" | "At Risk" | "Churned";

export type Role =
  | "Growth"
  | "SDR"
  | "Customer Solution"
  | "Solution Factory"
  | "Customer Success"
  | "Management";

// ---------- Master data ----------

export interface MasterMoment {
  code: string; // e.g. "EBM Expand"
  no: number; // 1..20
  phase: LifecyclePhase;
  description: string; // Thai description
  color: string; // tailwind-ish hex for the moment family
  discoveryQuestions: string[];
  nextMoments: string[]; // likely next moment codes
}

export interface SolutionPackage {
  name: string;
  startingPrice: number;
  items: string[];
}

export interface Solution {
  id: string; // SOL-XXX-000
  name: string;
  moment: string; // master moment code
  stakeholders: Stakeholder[];
  industries: string[];
  startingPrice: number;
  averageWallet: number;
  grossMarginTarget: number; // 0..1
  leadTimeDays: number;
  productionRequired: boolean;
  recommendedOffline: boolean;
  crossSell: string[];
  nextMoment: string;
  packages?: SolutionPackage[];
}

// ---------- Accounts ----------

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

export interface Purchase {
  date: string; // ISO
  item: string;
  moment: string;
  amount: number;
}

export interface Account {
  id: string; // ACC-001
  name: string;
  industry: string;
  employeeSize: number;
  location: string;
  branchCount: number;
  tier: AccountTier;
  ownerId: string;
  customerSince: string | null; // null = prospect
  ltv: number;
  grossProfit: number;
  health: CustomerHealth;
  accountScore: number;
  whitespace: Record<WhitespaceCategory, boolean>; // true = already bought
  purchases: Purchase[];
  contacts: { name: string; role: string; phone: string }[];
  notes?: string;
}

// ---------- Moment events ----------

export interface ScoreBreakdown {
  businessFit: number; // /30
  intent: number; // /25
  timing: number; // /20
  wallet: number; // /15
  relationship: number; // /10
}

export interface MomentEvent {
  id: string; // ME-2026-000001
  accountId: string;
  momentType: string; // master moment code
  subMoment: string;
  stakeholders: Stakeholder[];
  triggerSource: TriggerSource;
  triggerDetail: string;
  detectedAt: string;
  expectedEventDate: string;
  score: ScoreBreakdown;
  potentialWalletMin: number;
  potentialWalletMax: number;
  recommendedSolutionIds: string[];
  recommendedAction: string;
  ownerId: string;
  status: MomentEventStatus;
  nextExpectedMoment: string;
  channel?: Channel;
}

// ---------- Opportunities ----------

export interface Opportunity {
  id: string; // OPP-2026-001
  momentEventId: string;
  accountId: string;
  name: string;
  expectedRevenue: number;
  expectedGP: number; // 0..1
  closeDate: string;
  status: MomentEventStatus;
  ownerId: string;
  nextAction: string;
  slaHours?: number;
}

// ---------- People ----------

export interface User {
  id: string; // USR-001
  name: string;
  nickname: string;
  role: Role;
  center?: string;
}

// ---------- Offline ----------

export interface Appointment {
  id: string;
  accountId: string;
  momentEventId: string;
  center: Channel;
  datetime: string;
  consultantId: string;
  need: string;
  expectedWallet: number;
  samples: string[];
  status: "Booked" | "Visited" | "No-show" | "Completed";
}
