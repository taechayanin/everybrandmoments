import type {
  Account,
  AccountId,
  AccountTier,
  Appointment,
  Channel,
  MasterMoment,
  MomentCode,
  MomentEvent,
  MomentEventId,
  MomentEventStatus,
  MomentSignal,
  Opportunity,
  OpportunityId,
  OpportunityStage,
  Priority,
  ScoreBreakdown,
  Solution,
  SolutionId,
  Stakeholder,
  TriggerSource,
  User,
  UserId,
} from "@/lib/types";

export interface Paginated<T> {
  items: T[];
  nextCursor?: string;
}

// ---------- Accounts ----------

export interface AccountSearchInput {
  query?: string;
  ownerId?: UserId;
  tier?: AccountTier;
  limit: number;
  cursor?: string;
}

export interface AccountRepository {
  getById(id: AccountId): Promise<Account | null>;
  search(input: AccountSearchInput): Promise<Paginated<Account>>;
}

// ---------- Moments ----------

export interface MomentRadarQuery {
  priority?: Priority;
  triggerSources?: TriggerSource[];
  ownerId?: UserId;
  activeOnly?: boolean;
  limit: number;
  cursor?: string;
}

export interface CreateMomentInput {
  accountId: AccountId;
  momentType: MomentCode;
  subMoment: string;
  stakeholders: Stakeholder[];
  triggerSource: TriggerSource;
  triggerDetail: string;
  expectedEventDate: string;
  score: ScoreBreakdown;
  potentialWalletMin: number;
  potentialWalletMax: number;
  ownerId: UserId;
}

export interface MomentRepository {
  getById(id: MomentEventId): Promise<MomentEvent | null>;
  findActiveByAccount(accountId: AccountId): Promise<MomentEvent[]>;
  listByAccount(accountId: AccountId): Promise<MomentEvent[]>;
  listAll(): Promise<MomentEvent[]>;
  radar(query: MomentRadarQuery): Promise<Paginated<MomentEvent>>;
  create(input: CreateMomentInput): Promise<MomentEvent>;
  updateStatus(id: MomentEventId, status: MomentEventStatus): Promise<void>;
  /** Human verification of a detected moment (refactor plan §41 / Sprint 6). */
  verify(id: MomentEventId, verifiedBy: UserId): Promise<void>;
}

// ---------- Signals (detection evidence) ----------

export interface SignalRepository {
  listByEvent(momentEventId: MomentEventId): Promise<MomentSignal[]>;
  listByAccount(accountId: AccountId): Promise<MomentSignal[]>;
}

export interface MasterMomentRepository {
  getByCode(code: MomentCode): Promise<MasterMoment | null>;
  listAll(): Promise<MasterMoment[]>;
}

// ---------- Solutions ----------

export interface SolutionRepository {
  getById(id: SolutionId): Promise<Solution | null>;
  listByMoment(moment: MomentCode): Promise<Solution[]>;
  listAll(): Promise<Solution[]>;
}

// ---------- Opportunities ----------

export interface CreateOpportunityInput {
  momentEventId: MomentEventId;
  accountId: AccountId;
  name: string;
  expectedRevenue: number;
  expectedGP: number;
  closeDate: string;
  stage: OpportunityStage;
  ownerId: UserId;
  nextAction: string;
  channel?: Channel;
}

export interface OpportunityRepository {
  getById(id: OpportunityId): Promise<Opportunity | null>;
  listAll(): Promise<Opportunity[]>;
  create(input: CreateOpportunityInput): Promise<Opportunity>;
}

// ---------- Users / Appointments ----------

export interface UserRepository {
  getById(id: UserId): Promise<User | null>;
  listAll(): Promise<User[]>;
}

export interface AppointmentRepository {
  listUpcoming(): Promise<Appointment[]>;
}

/** Everything the application layer needs — one injection point. */
export interface Repositories {
  accounts: AccountRepository;
  moments: MomentRepository;
  masterMoments: MasterMomentRepository;
  solutions: SolutionRepository;
  opportunities: OpportunityRepository;
  users: UserRepository;
  appointments: AppointmentRepository;
  signals: SignalRepository;
}
