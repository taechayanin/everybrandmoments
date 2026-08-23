import type {
  Account,
  AccountId,
  Activity,
  ActivityId,
  ActivitySuggestion,
  Appointment,
  ContactId,
  CrmContact,
  CrmTask,
  CustomerHealth,
  MasterMoment,
  MomentCode,
  MomentEvent,
  MomentEventId,
  MomentEventStatus,
  MomentSignal,
  Opportunity,
  OpportunityId,
  Solution,
  SolutionId,
  SuggestionId,
  TaskId,
  User,
  UserId,
} from "@/lib/types";
import { isActiveMomentStatus } from "@/lib/domain/moment";
import { priorityOf, totalScore } from "@/lib/domain/score";
import { followUpTaskKey } from "@/lib/domain/activity";
import type {
  AccountRepository,
  AccountStats,
  ActivityListOptions,
  ActivityRepository,
  AppointmentRepository,
  ContactRepository,
  CreateActivityInput,
  CreateCrmContactInput,
  CreateCrmTaskInput,
  CreateMomentInput,
  CreateOpportunityInput,
  CreateSignalInput,
  CreateSuggestionInput,
  InteractionWriteRepository,
  LogInteractionInput,
  MasterMomentRepository,
  MomentListFilter,
  MomentRadarQuery,
  MomentRepository,
  MomentStats,
  MomentWorkStats,
  OpportunityRepository,
  Paginated,
  Repositories,
  SignalRepository,
  SolutionRepository,
  SuggestionRepository,
  TaskDueBand,
  TaskRepository,
  UpdateActivityPatch,
  UpdateCrmContactPatch,
  UserRepository,
} from "@/lib/repositories";
import { MASTER_MOMENTS } from "@/lib/domain/master-moments";
import { ACCOUNTS } from "./accounts";
import { MOMENT_EVENTS } from "./events";
import { APPOINTMENTS, OPPORTUNITIES } from "./opportunities";
import { MOCK_SIGNALS } from "./signals";
import { SOLUTIONS } from "./solutions";
import { USERS } from "./users";

// In-memory copies so create() works during a session. Not durable across
// worker isolates — the D1 adapter is the durable implementation.
const events: MomentEvent[] = [...MOMENT_EVENTS];
const opportunities: Opportunity[] = [...OPPORTUNITIES];
const signals: MomentSignal[] = [...MOCK_SIGNALS];
const signalIngestKeys = new Map<string, string>(); // ingestKey -> signal id

function paginate<T>(items: T[], limit: number, cursor?: string): Paginated<T> {
  const start = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
  const page = items.slice(start, start + limit);
  const next = start + limit < items.length ? String(start + limit) : undefined;
  return { items: page, nextCursor: next };
}

class MockAccountRepository implements AccountRepository {
  async getById(id: AccountId): Promise<Account | null> {
    return ACCOUNTS.find((a) => a.id === id) ?? null;
  }

  async getByIds(ids: AccountId[]): Promise<Account[]> {
    const wanted = new Set(ids);
    return ACCOUNTS.filter((a) => wanted.has(a.id));
  }

  async search(input: {
    query?: string;
    ownerId?: UserId;
    limit: number;
    cursor?: string;
  }): Promise<Paginated<Account>> {
    let items = [...ACCOUNTS].sort((a, b) => b.accountScore - a.accountScore);
    if (input.query) {
      const q = input.query.toLowerCase();
      items = items.filter(
        (a) => a.name.toLowerCase().includes(q) || a.industry.toLowerCase().includes(q),
      );
    }
    if (input.ownerId) items = items.filter((a) => a.ownerId === input.ownerId);
    return paginate(items, input.limit, input.cursor);
  }

  async stats(): Promise<AccountStats> {
    return {
      activeAccounts: ACCOUNTS.filter((a) => a.customerSince).length,
      healthyCount: ACCOUNTS.filter((a) => a.health === "Healthy").length,
      atRiskCount: ACCOUNTS.filter((a) => a.health === "At Risk").length,
      totalLtv: ACCOUNTS.reduce((s, a) => s + a.ltv, 0),
      totalGp: ACCOUNTS.reduce((s, a) => s + a.grossProfit, 0),
    };
  }

  async listByHealth(health: CustomerHealth, limit: number): Promise<Account[]> {
    return ACCOUNTS.filter((a) => a.health === health)
      .sort((a, b) => b.accountScore - a.accountScore)
      .slice(0, limit);
  }
}

class MockMomentRepository implements MomentRepository {
  async getById(id: MomentEventId): Promise<MomentEvent | null> {
    return events.find((e) => e.id === id) ?? null;
  }

  async getByIds(ids: MomentEventId[]): Promise<MomentEvent[]> {
    const wanted = new Set(ids);
    return events.filter((e) => wanted.has(e.id));
  }

  async findActiveByAccount(accountId: AccountId): Promise<MomentEvent[]> {
    return events
      .filter((e) => e.accountId === accountId && isActiveMomentStatus(e.status))
      .sort((a, b) => totalScore(b.score) - totalScore(a.score));
  }

  async findActiveByAccounts(accountIds: AccountId[]): Promise<MomentEvent[]> {
    const wanted = new Set(accountIds);
    return events
      .filter((e) => wanted.has(e.accountId) && isActiveMomentStatus(e.status))
      .sort((a, b) => totalScore(b.score) - totalScore(a.score));
  }

  async listByAccount(accountId: AccountId): Promise<MomentEvent[]> {
    return events
      .filter((e) => e.accountId === accountId)
      .sort((a, b) => a.detectedAt.localeCompare(b.detectedAt));
  }

  async listAll(): Promise<MomentEvent[]> {
    return [...events];
  }

  async listFiltered(filter: MomentListFilter): Promise<MomentEvent[]> {
    let items = [...events];
    if (filter.statuses && filter.statuses.length > 0) {
      items = items.filter((e) => filter.statuses!.includes(e.status));
    }
    if (filter.momentCodes && filter.momentCodes.length > 0) {
      items = items.filter((e) => filter.momentCodes!.includes(e.momentType));
    }
    if (filter.activeOnly) {
      items = items.filter((e) => isActiveMomentStatus(e.status));
    }
    if (filter.expectedFrom) {
      items = items.filter((e) => e.expectedEventDate >= filter.expectedFrom!);
    }
    if (filter.expectedTo) {
      items = items.filter((e) => e.expectedEventDate <= filter.expectedTo!);
    }
    items.sort(
      filter.orderByExpectedDateDesc
        ? (a, b) => b.expectedEventDate.localeCompare(a.expectedEventDate)
        : (a, b) => b.detectedAt.localeCompare(a.detectedAt),
    );
    return items.slice(0, filter.limit);
  }

  async stats(): Promise<MomentStats> {
    return {
      detected: events.length,
      hot: events.filter((e) => priorityOf(totalScore(e.score)) === "HOT").length,
      won: events.filter((e) => e.status === "Won").length,
    };
  }

  async workStats(today: string): Promise<MomentWorkStats> {
    const days = (from: string, to: string) =>
      Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000);
    return {
      activeHot: events.filter(
        (e) => isActiveMomentStatus(e.status) && priorityOf(totalScore(e.score)) === "HOT",
      ).length,
      newToday: events.filter((e) => e.detectedAt === today).length,
      newThisWeek: events.filter((e) => {
        const d = days(e.detectedAt, today);
        return d >= 0 && d <= 7;
      }).length,
      qualifiedActive: events.filter((e) =>
        ["Qualified", "Meeting Booked", "Discovery Completed", "Solution Design"].includes(
          e.status,
        ),
      ).length,
      wonThisMonth: events.filter(
        (e) => e.status === "Won" && e.expectedEventDate.slice(0, 7) === today.slice(0, 7),
      ).length,
    };
  }

  async radar(query: MomentRadarQuery): Promise<Paginated<MomentEvent>> {
    let items = [...events];
    if (query.activeOnly !== false) {
      items = items.filter((e) => isActiveMomentStatus(e.status));
    }
    if (query.priority) {
      items = items.filter((e) => priorityOf(totalScore(e.score)) === query.priority);
    }
    if (query.triggerSources && query.triggerSources.length > 0) {
      items = items.filter((e) => query.triggerSources!.includes(e.triggerSource));
    }
    if (query.ownerId) items = items.filter((e) => e.ownerId === query.ownerId);
    items.sort((a, b) => totalScore(b.score) - totalScore(a.score));
    return paginate(items, query.limit, query.cursor);
  }

  async create(input: CreateMomentInput): Promise<MomentEvent> {
    const id = `ME-2026-${String(events.length + 1).padStart(6, "0")}` as MomentEventId;
    const event: MomentEvent = {
      id,
      ...input,
      triggerSource: input.triggerSource,
      detectedAt: new Date().toISOString().slice(0, 10),
      recommendedSolutionIds: [],
      recommendedAction: "Review Moment ใหม่ + Qualify",
      status: "Detected",
      nextExpectedMoment: input.momentType,
    };
    events.push(event);
    return event;
  }

  async updateStatus(id: MomentEventId, status: MomentEventStatus): Promise<void> {
    const e = events.find((x) => x.id === id);
    if (e) e.status = status;
  }

  async confirm(id: MomentEventId, userId: UserId): Promise<boolean> {
    const e = events.find((x) => x.id === id);
    if (!e || e.verifiedAt) return false; // idempotent — already decided
    e.verifiedBy = userId;
    e.verifiedAt = new Date().toISOString();
    if (e.status === "Detected") e.status = "Review";
    return true;
  }

  async reject(id: MomentEventId, userId: UserId): Promise<boolean> {
    const e = events.find((x) => x.id === id);
    if (!e || e.verifiedAt) return false;
    e.verifiedBy = userId;
    e.verifiedAt = new Date().toISOString();
    e.status = "Lost";
    return true;
  }
}

class MockSignalRepository implements SignalRepository {
  async listByEvent(momentEventId: MomentEventId): Promise<MomentSignal[]> {
    return signals.filter((s) => s.momentEventId === momentEventId);
  }

  async listByAccount(accountId: AccountId): Promise<MomentSignal[]> {
    return signals.filter((s) => s.accountId === accountId);
  }

  async create(
    input: CreateSignalInput,
  ): Promise<{ signal: MomentSignal; created: boolean }> {
    const existingId = signalIngestKeys.get(input.ingestKey);
    if (existingId) {
      const existing = signals.find((s) => s.id === existingId)!;
      return { signal: existing, created: false };
    }
    const signal: MomentSignal = {
      id: `SIG-${crypto.randomUUID()}`,
      accountId: input.accountId,
      momentEventId: null,
      sourceType: input.sourceType,
      sourceRef: input.sourceRef,
      sourceUrl: input.sourceUrl,
      rawText: input.rawText,
      detectedAt: new Date().toISOString(),
    };
    signals.push(signal);
    signalIngestKeys.set(input.ingestKey, signal.id);
    return { signal, created: true };
  }

  async markStatus(): Promise<void> {
    // Mock signals carry no processing lifecycle — D1 adapter owns it.
  }
}

class MockMasterMomentRepository implements MasterMomentRepository {
  async getByCode(code: MomentCode): Promise<MasterMoment | null> {
    return MASTER_MOMENTS.find((m) => m.code === code) ?? null;
  }

  async listAll(): Promise<MasterMoment[]> {
    return MASTER_MOMENTS;
  }
}

class MockSolutionRepository implements SolutionRepository {
  async getById(id: SolutionId): Promise<Solution | null> {
    return SOLUTIONS.find((s) => s.id === id) ?? null;
  }

  async listByMoment(moment: MomentCode): Promise<Solution[]> {
    return SOLUTIONS.filter((s) => s.moment === moment);
  }

  async listAll(): Promise<Solution[]> {
    return SOLUTIONS;
  }
}

class MockOpportunityRepository implements OpportunityRepository {
  async getById(id: OpportunityId): Promise<Opportunity | null> {
    return opportunities.find((o) => o.id === id) ?? null;
  }

  async list(input: { limit: number; cursor?: string }): Promise<Paginated<Opportunity>> {
    const sorted = [...opportunities].reverse(); // newest first (insertion order)
    return paginate(sorted, input.limit, input.cursor);
  }

  async listAll(): Promise<Opportunity[]> {
    return [...opportunities];
  }

  async create(input: CreateOpportunityInput): Promise<Opportunity> {
    const id = `OPP-2026-${String(opportunities.length + 1).padStart(3, "0")}` as OpportunityId;
    const opp: Opportunity = { id, createdAt: new Date().toISOString(), ...input };
    opportunities.push(opp);
    return opp;
  }
}

class MockUserRepository implements UserRepository {
  async getById(id: UserId): Promise<User | null> {
    return USERS.find((u) => u.id === id) ?? null;
  }

  async getByIds(ids: UserId[]): Promise<User[]> {
    const wanted = new Set(ids);
    return USERS.filter((u) => wanted.has(u.id));
  }

  async listAll(): Promise<User[]> {
    return USERS;
  }
}

class MockAppointmentRepository implements AppointmentRepository {
  async listUpcoming(): Promise<Appointment[]> {
    return APPOINTMENTS;
  }
}

// ---------- CRM Activity Layer (sprint Step 2) ----------
// In-memory mirrors of the D1 semantics: same idempotency keys, same keyset
// pagination order, same band rules — the repo tests pin both adapters to
// this behavior.

const crmActivities: Activity[] = [];
const crmTasks: CrmTask[] = [];
const crmSuggestions: ActivitySuggestion[] = [];
// Seeded from the embedded account contacts, matching seed/seed.sql ids.
const crmContacts: CrmContact[] = ACCOUNTS.flatMap((a) =>
  a.contacts.map((c, i) => ({
    id: `CT-${a.id}-${i + 1}` as ContactId,
    accountId: a.id,
    name: c.name,
    jobTitle: c.role || null,
    department: null,
    email: null,
    phone: c.phone || null,
    lineId: null,
    buyingRole: i === 0 ? ("DECISION_MAKER" as const) : null,
    influenceLevel: null,
    isPrimary: i === 0,
    status: "ACTIVE" as const,
    notes: null,
    createdAt: "2026-08-22T00:00:00Z",
    updatedAt: "2026-08-22T00:00:00Z",
  })),
);

function byOccurredDesc(a: Activity, b: Activity): number {
  return b.occurredAt === a.occurredAt
    ? b.id.localeCompare(a.id)
    : b.occurredAt.localeCompare(a.occurredAt);
}

function buildActivity(id: ActivityId, input: CreateActivityInput, now: string): Activity {
  return {
    id,
    accountId: input.accountId,
    contactId: input.contactId ?? null,
    opportunityId: input.opportunityId ?? null,
    momentEventId: input.momentEventId ?? null,
    activityType: input.activityType,
    title: input.title ?? null,
    body: input.body ?? null,
    outcome: input.outcome ?? null,
    nextAction: input.nextAction ?? null,
    nextActionAt: input.nextActionAt ?? null,
    occurredAt: input.occurredAt,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
    metadata: input.metadata ?? null,
    deletedAt: null,
  };
}

function buildTask(id: TaskId, input: CreateCrmTaskInput, now: string): CrmTask {
  return {
    id,
    accountId: input.accountId ?? null,
    contactId: input.contactId ?? null,
    momentEventId: input.momentEventId ?? null,
    opportunityId: input.opportunityId ?? null,
    title: input.title,
    description: input.description ?? null,
    dueDate: input.dueDate ?? null,
    assigneeId: input.assigneeId ?? null,
    createdBy: input.createdBy ?? null,
    // Canonical value from the application layer — persisted verbatim.
    priority: input.priority,
    status: "OPEN",
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

const activityRequestKeys = new Map<string, ActivityId>();
const taskRequestKeys = new Map<string, TaskId>();
const contactRequestKeys = new Map<string, ContactId>();

/** In-memory audit trail mirroring D1's audit_logs — exported so tests can
 * assert the atomic mutation+audit contract (Step-3 review item 4). */
export interface MockAuditRecord {
  action: "ACTIVITY_UPDATED" | "ACTIVITY_DELETED";
  entityId: string;
  userId: UserId;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  createdAt: string;
}
export const MOCK_AUDIT_LOGS: MockAuditRecord[] = [];

class MockActivityRepository implements ActivityRepository {
  async getById(id: ActivityId): Promise<Activity | null> {
    return crmActivities.find((a) => a.id === id && !a.deletedAt) ?? null;
  }

  async listByAccount(
    accountId: AccountId,
    options: ActivityListOptions = {},
  ): Promise<Paginated<Activity>> {
    const limit = options.limit ?? 20;
    let items = crmActivities
      .filter((a) => a.accountId === accountId && !a.deletedAt)
      .sort(byOccurredDesc);
    if (options.types && options.types.length > 0) {
      items = items.filter((a) => options.types!.includes(a.activityType));
    }
    if (options.cursor) {
      const at = options.cursor.indexOf("|");
      const cOccurred = options.cursor.slice(0, at);
      const cId = options.cursor.slice(at + 1);
      items = items.filter(
        (a) =>
          a.occurredAt < cOccurred || (a.occurredAt === cOccurred && a.id < cId),
      );
    }
    const page = items.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page,
      nextCursor:
        items.length > limit && last ? `${last.occurredAt}|${last.id}` : undefined,
    };
  }

  async listRecentByAccounts(
    accountIds: AccountId[],
    limitPerAccount = 5,
  ): Promise<Map<AccountId, Activity[]>> {
    const out = new Map<AccountId, Activity[]>();
    for (const id of accountIds) {
      const page = await this.listByAccount(id, { limit: limitPerAccount });
      if (page.items.length > 0) out.set(id, page.items);
    }
    return out;
  }

  async create(
    input: CreateActivityInput,
  ): Promise<{ activity: Activity; created: boolean }> {
    if (input.clientRequestId) {
      const existing = activityRequestKeys.get(input.clientRequestId);
      if (existing) {
        const activity = crmActivities.find((a) => a.id === existing)!;
        return { activity, created: false };
      }
    }
    const activity = buildActivity(
      `ACT-${crypto.randomUUID()}` as ActivityId,
      input,
      new Date().toISOString(),
    );
    crmActivities.push(activity);
    if (input.clientRequestId) activityRequestKeys.set(input.clientRequestId, activity.id);
    return { activity, created: true };
  }

  async update(
    id: ActivityId,
    patch: UpdateActivityPatch,
    actor: UserId,
  ): Promise<Activity | null> {
    const a = crmActivities.find((x) => x.id === id && !x.deletedAt);
    if (!a) return null;
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    if (patch.body !== undefined) { before.body = a.body; after.body = patch.body; a.body = patch.body; }
    if (patch.outcome !== undefined) { before.outcome = a.outcome; after.outcome = patch.outcome; a.outcome = patch.outcome; }
    if (patch.nextAction !== undefined) { before.nextAction = a.nextAction; after.nextAction = patch.nextAction; a.nextAction = patch.nextAction; }
    if (patch.nextActionAt !== undefined) { before.nextActionAt = a.nextActionAt; after.nextActionAt = patch.nextActionAt; a.nextActionAt = patch.nextActionAt; }
    if (Object.keys(after).length === 0) return a;
    a.updatedAt = new Date().toISOString();
    MOCK_AUDIT_LOGS.push({
      action: "ACTIVITY_UPDATED",
      entityId: id,
      userId: actor,
      before,
      after,
      createdAt: a.updatedAt,
    });
    return a;
  }

  async softDelete(id: ActivityId, userId: UserId): Promise<boolean> {
    const a = crmActivities.find((x) => x.id === id && !x.deletedAt);
    if (!a) return false; // already deleted → no mutation, no audit (D1 parity)
    a.deletedAt = new Date().toISOString();
    MOCK_AUDIT_LOGS.push({
      action: "ACTIVITY_DELETED",
      entityId: id,
      userId,
      createdAt: a.deletedAt,
    });
    return true;
  }

  async lastActivityByOpportunities(ids: OpportunityId[]): Promise<Map<string, string>> {
    const wanted = new Set<string>(ids);
    const out = new Map<string, string>();
    for (const a of crmActivities) {
      if (!a.opportunityId || a.deletedAt || !wanted.has(a.opportunityId)) continue;
      const prev = out.get(a.opportunityId);
      if (!prev || a.occurredAt > prev) out.set(a.opportunityId, a.occurredAt);
    }
    return out;
  }
}

class MockTaskRepository implements TaskRepository {
  async getById(id: TaskId): Promise<CrmTask | null> {
    return crmTasks.find((t) => t.id === id) ?? null;
  }

  async create(input: CreateCrmTaskInput): Promise<{ task: CrmTask; created: boolean }> {
    if (input.clientRequestId) {
      const existing = taskRequestKeys.get(input.clientRequestId);
      if (existing) {
        const task = crmTasks.find((t) => t.id === existing)!;
        return { task, created: false };
      }
    }
    const task = buildTask(
      `TSK-${crypto.randomUUID()}` as TaskId,
      input,
      new Date().toISOString(),
    );
    crmTasks.push(task);
    if (input.clientRequestId) taskRequestKeys.set(input.clientRequestId, task.id);
    return { task, created: true };
  }

  async complete(id: TaskId): Promise<boolean> {
    const t = crmTasks.find((x) => x.id === id);
    if (!t || (t.status !== "OPEN" && t.status !== "IN_PROGRESS")) return false;
    t.status = "DONE";
    t.completedAt = new Date().toISOString();
    t.updatedAt = t.completedAt;
    return true;
  }

  async listByAssignee(
    assigneeId: UserId,
    band: TaskDueBand,
    today: string,
    limit: number,
  ): Promise<CrmTask[]> {
    return crmTasks
      .filter((t) => {
        if (t.assigneeId !== assigneeId || !t.dueDate) return false;
        if (t.status !== "OPEN" && t.status !== "IN_PROGRESS") return false;
        if (band === "overdue") return t.dueDate < today;
        if (band === "today") return t.dueDate === today;
        return t.dueDate > today;
      })
      .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))
      .slice(0, limit);
  }

  async listByAccount(accountId: AccountId, limit: number): Promise<CrmTask[]> {
    return crmTasks.filter((t) => t.accountId === accountId).slice(0, limit);
  }

  async listByOpportunity(opportunityId: OpportunityId, limit: number): Promise<CrmTask[]> {
    return crmTasks.filter((t) => t.opportunityId === opportunityId).slice(0, limit);
  }

  async nextOpenTaskByOpportunities(
    ids: OpportunityId[],
  ): Promise<Map<string, CrmTask>> {
    const wanted = new Set<string>(ids);
    const out = new Map<string, CrmTask>();
    const candidates = crmTasks
      .filter(
        (t) =>
          t.opportunityId !== null &&
          wanted.has(t.opportunityId) &&
          (t.status === "OPEN" || t.status === "IN_PROGRESS"),
      )
      .sort((a, b) => {
        if (a.dueDate === null && b.dueDate === null) return a.id.localeCompare(b.id);
        if (a.dueDate === null) return 1;
        if (b.dueDate === null) return -1;
        return a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id);
      });
    for (const t of candidates) {
      if (!out.has(t.opportunityId!)) out.set(t.opportunityId!, t);
    }
    return out;
  }
}

class MockContactRepository implements ContactRepository {
  async getById(id: ContactId): Promise<CrmContact | null> {
    return crmContacts.find((c) => c.id === id) ?? null;
  }

  async getByIds(ids: ContactId[]): Promise<CrmContact[]> {
    const wanted = new Set(ids);
    return crmContacts.filter((c) => wanted.has(c.id));
  }

  async listByAccount(accountId: AccountId): Promise<CrmContact[]> {
    return crmContacts
      .filter((c) => c.accountId === accountId)
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name));
  }

  async create(
    input: CreateCrmContactInput,
  ): Promise<{ contact: CrmContact; created: boolean }> {
    if (input.clientRequestId) {
      const existing = contactRequestKeys.get(input.clientRequestId);
      if (existing) {
        const contact = crmContacts.find((c) => c.id === existing)!;
        return { contact, created: false };
      }
    }
    const now = new Date().toISOString();
    const contact: CrmContact = {
      id: `CT-${crypto.randomUUID()}` as ContactId,
      accountId: input.accountId,
      name: input.name,
      jobTitle: input.jobTitle ?? null,
      department: input.department ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      lineId: input.lineId ?? null,
      buyingRole: input.buyingRole ?? null,
      influenceLevel: input.influenceLevel ?? null,
      isPrimary: input.isPrimary ?? false,
      status: input.status ?? "ACTIVE",
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    crmContacts.push(contact);
    if (input.clientRequestId) contactRequestKeys.set(input.clientRequestId, contact.id);
    return { contact, created: true };
  }

  async update(id: ContactId, patch: UpdateCrmContactPatch): Promise<CrmContact | null> {
    const c = crmContacts.find((x) => x.id === id);
    if (!c) return null;
    if (patch.name !== undefined) c.name = patch.name;
    if (patch.jobTitle !== undefined) c.jobTitle = patch.jobTitle ?? null;
    if (patch.department !== undefined) c.department = patch.department ?? null;
    if (patch.email !== undefined) c.email = patch.email ?? null;
    if (patch.phone !== undefined) c.phone = patch.phone ?? null;
    if (patch.lineId !== undefined) c.lineId = patch.lineId ?? null;
    if (patch.buyingRole !== undefined) c.buyingRole = patch.buyingRole ?? null;
    if (patch.influenceLevel !== undefined) c.influenceLevel = patch.influenceLevel ?? null;
    if (patch.isPrimary !== undefined) c.isPrimary = patch.isPrimary;
    if (patch.status !== undefined) c.status = patch.status;
    if (patch.notes !== undefined) c.notes = patch.notes ?? null;
    c.updatedAt = new Date().toISOString();
    return c;
  }
}

class MockSuggestionRepository implements SuggestionRepository {
  async getById(id: SuggestionId): Promise<ActivitySuggestion | null> {
    return crmSuggestions.find((s) => s.id === id) ?? null;
  }

  async create(input: CreateSuggestionInput): Promise<ActivitySuggestion> {
    const suggestion: ActivitySuggestion = {
      id: `SUG-${crypto.randomUUID()}` as SuggestionId,
      activityId: input.activityId,
      payload: input.payload,
      confidence: input.confidence ?? null,
      status: "PENDING",
      createdAt: new Date().toISOString(),
      decidedAt: null,
      decidedBy: null,
    };
    crmSuggestions.push(suggestion);
    return suggestion;
  }

  async listPendingByAccount(
    accountId: AccountId,
    limit: number,
  ): Promise<ActivitySuggestion[]> {
    const accountActivityIds = new Set(
      crmActivities.filter((a) => a.accountId === accountId).map((a) => a.id),
    );
    return crmSuggestions
      .filter((s) => s.status === "PENDING" && accountActivityIds.has(s.activityId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
}

class MockInteractionWriteRepository implements InteractionWriteRepository {
  constructor(
    private activities: MockActivityRepository,
    private tasks: MockTaskRepository,
  ) {}

  async logInteraction(
    input: LogInteractionInput,
  ): Promise<{ activity: Activity; task?: CrmTask; deduped: boolean }> {
    const requestId = input.activity.clientRequestId;
    if (!requestId) {
      throw new Error("logInteraction requires activity.clientRequestId");
    }
    const { activity, created } = await this.activities.create(input.activity);
    let task: CrmTask | undefined;
    if (input.followUpTask) {
      const res = await this.tasks.create({
        ...input.followUpTask,
        clientRequestId: followUpTaskKey(requestId),
      });
      task = res.task;
    }
    return { activity, task, deduped: !created };
  }
}

export function createMockRepositories(): Repositories {
  const activities = new MockActivityRepository();
  const tasks = new MockTaskRepository();
  return {
    accounts: new MockAccountRepository(),
    moments: new MockMomentRepository(),
    masterMoments: new MockMasterMomentRepository(),
    solutions: new MockSolutionRepository(),
    opportunities: new MockOpportunityRepository(),
    users: new MockUserRepository(),
    appointments: new MockAppointmentRepository(),
    signals: new MockSignalRepository(),
    activities,
    tasks,
    contacts: new MockContactRepository(),
    suggestions: new MockSuggestionRepository(),
    interactions: new MockInteractionWriteRepository(activities, tasks),
  };
}
