import type {
  Account,
  AccountId,
  AccountTier,
  Appointment,
  Channel,
  CustomerHealth,
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

/** Portfolio aggregates computed inside the store — dashboards must not listAll. */
export interface AccountStats {
  activeAccounts: number;
  healthyCount: number;
  totalLtv: number;
  totalGp: number;
}

export interface AccountRepository {
  getById(id: AccountId): Promise<Account | null>;
  /** Bulk lookup for batch read models — never loop getById per row. */
  getByIds(ids: AccountId[]): Promise<Account[]>;
  search(input: AccountSearchInput): Promise<Paginated<Account>>;
  stats(): Promise<AccountStats>;
  listByHealth(health: CustomerHealth, limit: number): Promise<Account[]>;
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

/** Moment aggregates computed inside the store — dashboards must not listAll. */
export interface MomentStats {
  detected: number;
  hot: number;
  won: number;
}

export interface MomentListFilter {
  statuses?: MomentEventStatus[];
  momentCodes?: MomentCode[];
  activeOnly?: boolean;
  /** newest expected_event_date first; default is newest detected first */
  orderByExpectedDateDesc?: boolean;
  limit: number;
}

export interface MomentRepository {
  getById(id: MomentEventId): Promise<MomentEvent | null>;
  getByIds(ids: MomentEventId[]): Promise<MomentEvent[]>;
  findActiveByAccount(accountId: AccountId): Promise<MomentEvent[]>;
  /** Batch variant for list pages — one query, not one per account. */
  findActiveByAccounts(accountIds: AccountId[]): Promise<MomentEvent[]>;
  listByAccount(accountId: AccountId): Promise<MomentEvent[]>;
  /** Unbounded — mock/tests only; production reads use radar/listFiltered/stats. */
  listAll(): Promise<MomentEvent[]>;
  /** Bounded, filtered read for dashboard sections — one query per section. */
  listFiltered(filter: MomentListFilter): Promise<MomentEvent[]>;
  stats(): Promise<MomentStats>;
  radar(query: MomentRadarQuery): Promise<Paginated<MomentEvent>>;
  create(input: CreateMomentInput): Promise<MomentEvent>;
  updateStatus(id: MomentEventId, status: MomentEventStatus): Promise<void>;
  /**
   * Human verification (SOP step 3). Both are atomic with their audit record
   * and idempotent: a second call on an already-verified moment is a no-op
   * returning false. confirm keeps the moment in play; reject closes it Lost.
   */
  confirm(id: MomentEventId, userId: UserId): Promise<boolean>;
  reject(id: MomentEventId, userId: UserId, reason?: string): Promise<boolean>;
}

// ---------- Signals (detection evidence) ----------

export interface CreateSignalInput {
  accountId: AccountId;
  sourceType: TriggerSource;
  sourceRef?: string;
  sourceUrl?: string;
  rawText: string;
  /** Idempotency key — same key returns the existing signal, no duplicate row. */
  ingestKey: string;
}

export interface SignalRepository {
  listByEvent(momentEventId: MomentEventId): Promise<MomentSignal[]>;
  listByAccount(accountId: AccountId): Promise<MomentSignal[]>;
  /** Idempotent create; { created: false } means the ingestKey already existed. */
  create(input: CreateSignalInput): Promise<{ signal: MomentSignal; created: boolean }>;
  /** pending → queued | processed | failed (ingestion lifecycle, review §6). */
  markStatus(ids: string[], status: "queued" | "processed" | "failed"): Promise<void>;
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
  /** Bounded, newest-first page — production paths must use this. */
  list(input: { limit: number; cursor?: string }): Promise<Paginated<Opportunity>>;
  /** Unbounded — mock/tests and small internal aggregates only. */
  listAll(): Promise<Opportunity[]>;
  create(input: CreateOpportunityInput): Promise<Opportunity>;
}

// ---------- Users / Appointments ----------

export interface UserRepository {
  getById(id: UserId): Promise<User | null>;
  getByIds(ids: UserId[]): Promise<User[]>;
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
