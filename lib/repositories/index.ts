import type {
  Account,
  AccountId,
  AccountTier,
  Appointment,
  Channel,
  CustomerHealth,
  Activity,
  ActivityId,
  ActivitySuggestion,
  ActivityType,
  ActivityAnalysis,
  ContactId,
  CrmContact,
  ContactRole,
  ContactStatus,
  CrmTask,
  InfluenceLevel,
  SuggestionId,
  TaskId,
  TaskPriority,
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
  atRiskCount: number;
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
  /** Inclusive expected_event_date window (ISO dates) — e.g. next-30-days. */
  expectedFrom?: string;
  expectedTo?: string;
  /** newest expected_event_date first; default is newest detected first */
  orderByExpectedDateDesc?: boolean;
  limit: number;
}

/** Command Center counters — one aggregate query, computed in the store. */
export interface MomentWorkStats {
  activeHot: number;
  newToday: number;
  newThisWeek: number;
  qualifiedActive: number;
  wonThisMonth: number;
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
  /** `today` = org-local ISO date from the caller's clock. */
  workStats(today: string): Promise<MomentWorkStats>;
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

// ---------- CRM Activities (sprint Step 2) ----------

export interface CreateActivityInput {
  accountId: AccountId;
  contactId?: ContactId;
  opportunityId?: OpportunityId;
  momentEventId?: MomentEventId;
  activityType: ActivityType;
  title?: string;
  body?: string;
  outcome?: string;
  nextAction?: string;
  nextActionAt?: string;
  /** ISO datetime the interaction happened (not the row insert time). */
  occurredAt: string;
  createdBy: UserId;
  metadata?: Record<string, unknown>;
  /** Idempotency key — same key resolves to the existing row, no duplicate. */
  clientRequestId?: string;
}

export interface UpdateActivityPatch {
  body?: string;
  outcome?: string;
  nextAction?: string;
  nextActionAt?: string;
}

export interface ActivityListOptions {
  /** Page size — default 20 (plan: keyset, never OFFSET). */
  limit?: number;
  /** Keyset cursor from the previous page's nextCursor. */
  cursor?: string;
  types?: ActivityType[];
}

export interface ActivityRepository {
  getById(id: ActivityId): Promise<Activity | null>;
  /** Timeline read path — one keyset-paginated query, newest first. */
  listByAccount(
    accountId: AccountId,
    options?: ActivityListOptions,
  ): Promise<Paginated<Activity>>;
  /** Batch read model for list pages — bounded per account, never a loop. */
  listRecentByAccounts(
    accountIds: AccountId[],
    limitPerAccount?: number,
  ): Promise<Map<AccountId, Activity[]>>;
  /** Idempotent on clientRequestId; { created: false } = key already existed. */
  create(input: CreateActivityInput): Promise<{ activity: Activity; created: boolean }>;
  /** Mutation + ACTIVITY_UPDATED audit row are one atomic logical write. */
  update(
    id: ActivityId,
    patch: UpdateActivityPatch,
    actor: UserId,
  ): Promise<Activity | null>;
  /** Soft delete (spec §31) + ACTIVITY_DELETED audit, atomic; false if
   * already deleted or not found (no duplicate audit on retry). */
  softDelete(id: ActivityId, userId: UserId): Promise<boolean>;
  /** opportunity_id -> latest occurred_at, one grouped query (spec §27). */
  lastActivityByOpportunities(ids: OpportunityId[]): Promise<Map<string, string>>;
  /** Outbox transitions (Step-6 P0/P1 lifecycle). */
  markAnalysisStatus(
    ids: ActivityId[],
    status: "QUEUED" | "PROCESSED" | "FAILED" | "BLOCKED",
  ): Promise<void>;
  /** Operator reset (BLOCKED/FAILED -> PENDING, attempts 0, error cleared) —
   * the controlled retry after configuration is fixed. */
  resetAnalysis(ids: ActivityId[]): Promise<void>;
}

// ---------- CRM Tasks ----------

export interface CreateCrmTaskInput {
  accountId?: AccountId;
  contactId?: ContactId;
  momentEventId?: MomentEventId;
  opportunityId?: OpportunityId;
  title: string;
  description?: string;
  dueDate?: string; // ISO date
  assigneeId?: UserId;
  createdBy?: UserId;
  /** Canonical value decided by the application layer (domain default
   * DEFAULT_TASK_PRIORITY) — adapters persist it verbatim. */
  priority: TaskPriority;
  /** Idempotency key (stable schemes in lib/domain/activity.ts). */
  clientRequestId?: string;
}

export type TaskDueBand = "overdue" | "today" | "upcoming";

export interface TaskRepository {
  getById(id: TaskId): Promise<CrmTask | null>;
  /** Idempotent on clientRequestId, like ActivityRepository.create. */
  create(input: CreateCrmTaskInput): Promise<{ task: CrmTask; created: boolean }>;
  /** OPEN/IN_PROGRESS -> DONE + completed_at; idempotent (false = no-op). */
  complete(id: TaskId): Promise<boolean>;
  /** My Work Today bands (spec §18); `today` = ISO date from the caller's clock. */
  listByAssignee(
    assigneeId: UserId,
    band: TaskDueBand,
    today: string,
    limit: number,
  ): Promise<CrmTask[]>;
  listByAccount(accountId: AccountId, limit: number): Promise<CrmTask[]>;
  listByOpportunity(opportunityId: OpportunityId, limit: number): Promise<CrmTask[]>;
  /** opportunity_id -> earliest-due OPEN/IN_PROGRESS task, one bulk query
   * (spec §26 "Next Activity" — never a per-opportunity loop). */
  nextOpenTaskByOpportunities(ids: OpportunityId[]): Promise<Map<string, CrmTask>>;
}

// ---------- CRM Contacts ----------

export interface CreateCrmContactInput {
  accountId: AccountId;
  name: string;
  jobTitle?: string;
  department?: string;
  email?: string;
  phone?: string;
  lineId?: string;
  buyingRole?: ContactRole;
  influenceLevel?: InfluenceLevel;
  isPrimary?: boolean;
  status?: ContactStatus;
  notes?: string;
  /** Idempotency key — a retried create resolves to the existing contact. */
  clientRequestId?: string;
}

export type UpdateCrmContactPatch = Partial<
  Omit<CreateCrmContactInput, "accountId" | "clientRequestId">
>;

export interface ContactRepository {
  getById(id: ContactId): Promise<CrmContact | null>;
  getByIds(ids: ContactId[]): Promise<CrmContact[]>;
  /** One bounded query per account (spec §53). */
  listByAccount(accountId: AccountId): Promise<CrmContact[]>;
  /** Idempotent on clientRequestId; { created: false } = key already existed. */
  create(
    input: CreateCrmContactInput,
  ): Promise<{ contact: CrmContact; created: boolean }>;
  update(id: ContactId, patch: UpdateCrmContactPatch): Promise<CrmContact | null>;
}

// ---------- AI suggestions (reads + create; decisions land in Step 6) ----------

export interface CreateSuggestionInput {
  activityId: ActivityId;
  payload: ActivityAnalysis;
  confidence?: number;
}

export interface SuggestionRepository {
  getById(id: SuggestionId): Promise<ActivitySuggestion | null>;
  create(input: CreateSuggestionInput): Promise<ActivitySuggestion>;
  listPendingByAccount(accountId: AccountId, limit: number): Promise<ActivitySuggestion[]>;
}

// ---------- AI suggestion decisions (plan rev 4, Step 6) ----------

export interface AcceptSuggestionInput {
  suggestionId: SuggestionId;
  userId: UserId;
  accountId: AccountId;
  /** Catalog-validated by the use case; omitted = accept without a moment. */
  moment?: {
    momentCode: MomentCode;
    subMoment: string;
    reason: string;
    expectedEventDate: string;
    confidence: number;
    solutionIds: SolutionId[];
  };
  /** From the suggestion's nextAction; omitted = no follow-up task. */
  task?: { title: string; dueDate?: string };
}

export interface AcceptSuggestionOutcome {
  /** false = the suggestion was already decided (idempotent no-op). */
  changed: boolean;
  momentEventId: string | null;
  taskId: string | null;
}

export interface SuggestionDecisionWriteRepository {
  /**
   * ONE atomic write (D1: single db.batch). Dependent writes are conditional
   * on the suggestion actually being ACCEPTED (INSERT..SELECT..WHERE EXISTS)
   * and idempotent at row level (moment dedupe_key SUGGESTION:…, task key
   * SUG:…, deterministic audit id) — PENDING accept writes exactly once,
   * ACCEPTED retry duplicates nothing, IGNORED never creates records.
   */
  acceptAtomic(input: AcceptSuggestionInput): Promise<AcceptSuggestionOutcome>;
  ignoreAtomic(id: SuggestionId, userId: UserId): Promise<{ changed: boolean }>;
}

// ---------- CRM interaction unit-of-work (plan rev 2 item 4) ----------

export interface InteractionAuditInput {
  entityType: string;
  entityId: string;
  action: string;
  userId: UserId;
  afterJson?: unknown;
}

export interface LogInteractionInput {
  /** clientRequestId is REQUIRED here — the whole unit is keyed off it. */
  activity: CreateActivityInput;
  /** Follow-up key derives from the activity (ACTIVITY:<id>:FOLLOWUP). */
  followUpTask?: Omit<CreateCrmTaskInput, "clientRequestId">;
  audit?: InteractionAuditInput;
}

export interface InteractionWriteRepository {
  /**
   * Atomically persist one logged interaction: activity + optional follow-up
   * task + optional audit. D1: single db.batch(); mock: in-memory apply.
   * Idempotent as a unit — a retried clientRequestId returns the original
   * rows with deduped: true and writes nothing.
   */
  logInteraction(
    input: LogInteractionInput,
  ): Promise<{ activity: Activity; task?: CrmTask; deduped: boolean }>;
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
  activities: ActivityRepository;
  tasks: TaskRepository;
  contacts: ContactRepository;
  suggestions: SuggestionRepository;
  suggestionDecisions: SuggestionDecisionWriteRepository;
  interactions: InteractionWriteRepository;
}
