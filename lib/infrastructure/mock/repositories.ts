import type {
  Account,
  AccountId,
  Appointment,
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
  User,
  UserId,
} from "@/lib/types";
import { isActiveMomentStatus } from "@/lib/domain/moment";
import { priorityOf, totalScore } from "@/lib/domain/score";
import type {
  AccountRepository,
  AppointmentRepository,
  CreateMomentInput,
  CreateOpportunityInput,
  CreateSignalInput,
  MasterMomentRepository,
  MomentRadarQuery,
  MomentRepository,
  OpportunityRepository,
  Paginated,
  Repositories,
  SignalRepository,
  SolutionRepository,
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

  async listAll(): Promise<Opportunity[]> {
    return [...opportunities];
  }

  async create(input: CreateOpportunityInput): Promise<Opportunity> {
    const id = `OPP-2026-${String(opportunities.length + 1).padStart(3, "0")}` as OpportunityId;
    const opp: Opportunity = { id, ...input };
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

export function createMockRepositories(): Repositories {
  return {
    accounts: new MockAccountRepository(),
    moments: new MockMomentRepository(),
    masterMoments: new MockMasterMomentRepository(),
    solutions: new MockSolutionRepository(),
    opportunities: new MockOpportunityRepository(),
    users: new MockUserRepository(),
    appointments: new MockAppointmentRepository(),
    signals: new MockSignalRepository(),
  };
}
