import type {
  Account,
  AccountId,
  Activity,
  ActivityId,
  ActivitySuggestion,
  ActivityType,
  Appointment,
  Channel,
  ContactId,
  ContactRole,
  ContactStatus,
  CrmContact,
  CrmTask,
  CustomerHealth,
  InfluenceLevel,
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
  SuggestionStatus,
  TaskId,
  TaskPriority,
  TaskStatus,
  User,
  UserId,
  WhitespaceCategory,
} from "@/lib/types";
import { WHITESPACE_CATEGORIES } from "@/lib/domain/account";
import { ACTIVE_MOMENT_STATUSES } from "@/lib/domain/moment";
import {
  ANALYZABLE_ACTIVITY_TYPES,
  followUpTaskKey,
  suggestionTaskKey,
} from "@/lib/domain/activity";
import type {
  AccountRepository,
  AccountSearchInput,
  AccountStats,
  AcceptSuggestionInput,
  AcceptSuggestionOutcome,
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
  SuggestionDecisionWriteRepository,
  SuggestionRepository,
  TaskDueBand,
  TaskRepository,
  UpdateActivityPatch,
  UpdateCrmContactPatch,
  UserRepository,
} from "@/lib/repositories";
import { getBindings } from "../env";

// Single-org deployment until auth lands (Sprint 7); every query is already
// org-scoped so multi-tenancy is a data change, not a code change (§37).
const ORG = "ORG-001";

// Master data (20 moments, solution catalog) changes rarely — cache per
// isolate with a short TTL instead of re-querying per request (review perf §9,
// plan §52). Dynamic sales data is never cached here.
const MASTER_CACHE_TTL_MS = 60_000;

interface CacheEntry<T> {
  at: number;
  data: T;
}

let masterMomentsCache: CacheEntry<MasterMoment[]> | null = null;
let solutionsCache: CacheEntry<Solution[]> | null = null;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

function inClause(n: number): string {
  return Array(n).fill("?").join(", ");
}

// D1 bounds bind parameters per statement — keep IN () lists small.
const D1_SAFE_IN_CHUNK_SIZE = 50;

function chunked<T>(items: T[], size = D1_SAFE_IN_CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ---------- row mappers ----------

function mapAccount(
  r: Row,
  contacts: Row[],
  whitespace: Row[],
  orders: Row[],
): Account {
  const ws = Object.fromEntries(
    WHITESPACE_CATEGORIES.map((c) => [c, false]),
  ) as Record<WhitespaceCategory, boolean>;
  for (const w of whitespace) {
    if ((WHITESPACE_CATEGORIES as readonly string[]).includes(w.category)) {
      ws[w.category as WhitespaceCategory] = w.bought === 1;
    }
  }
  return {
    id: r.id as AccountId,
    name: r.name,
    industry: r.industry ?? "",
    employeeSize: r.employee_size,
    location: r.location ?? "",
    branchCount: r.branch_count,
    tier: r.tier,
    ownerId: r.owner_id as UserId,
    customerSince: r.customer_since,
    ltv: r.lifetime_value,
    grossProfit: r.gross_profit,
    health: r.health,
    accountScore: r.account_score,
    whitespace: ws,
    purchases: orders.map((o) => ({
      date: o.order_date,
      item: o.item,
      moment: o.moment_code as MomentCode,
      amount: o.revenue,
    })),
    // 0004 renamed contacts.role → job_title; read both so the app works on
    // either side of the migration (full CRM Contact model lands in Step 2).
    contacts: contacts.map((c) => ({
      name: c.name,
      role: c.job_title ?? c.role ?? "",
      phone: c.phone ?? "",
    })),
    notes: r.notes ?? undefined,
  };
}

function mapEvent(r: Row, stakeholders: Row[], solutions: Row[]): MomentEvent {
  return {
    id: r.id as MomentEventId,
    accountId: r.account_id as AccountId,
    momentType: r.moment_code as MomentCode,
    subMoment: r.sub_moment,
    stakeholders: stakeholders.map((s) => s.stakeholder),
    triggerSource: r.trigger_source,
    triggerDetail: r.trigger_detail ?? "",
    detectedAt: r.detected_at,
    expectedEventDate: r.expected_event_date ?? r.detected_at,
    score: {
      businessFit: r.score_business_fit,
      intent: r.score_intent,
      timing: r.score_timing,
      wallet: r.score_wallet,
      relationship: r.score_relationship,
    },
    potentialWalletMin: r.potential_wallet_min,
    potentialWalletMax: r.potential_wallet_max,
    recommendedSolutionIds: solutions.map((s) => s.solution_id as SolutionId),
    recommendedAction: r.recommended_action ?? "",
    ownerId: r.owner_id as UserId,
    status: r.status as MomentEventStatus,
    nextExpectedMoment: r.next_expected_moment as MomentCode,
    channel: (r.channel ?? undefined) as Channel | undefined,
    detectionConfidence: r.detection_confidence ?? undefined,
    detectedBy: r.detected_by ?? undefined,
    verifiedBy: (r.verified_by ?? undefined) as UserId | undefined,
    verifiedAt: r.verified_at ?? undefined,
  };
}

function mapSolution(r: Row, stakeholders: Row[], industries: Row[], packages: Row[], crossSell: Row[]): Solution {
  return {
    id: r.id as SolutionId,
    name: r.name,
    moment: r.moment_code as MomentCode,
    stakeholders: stakeholders.map((s) => s.stakeholder),
    industries: industries.map((i) => i.industry),
    startingPrice: r.starting_price,
    averageWallet: r.average_wallet,
    grossMarginTarget: r.gross_margin_target,
    leadTimeDays: r.lead_time_days,
    productionRequired: r.production_required === 1,
    recommendedOffline: r.recommended_offline === 1,
    crossSellSolutionIds: crossSell.map((c) => c.target_solution_id as SolutionId),
    nextMoment: r.next_moment as MomentCode,
    packages:
      packages.length > 0
        ? packages.map((p) => ({
            name: p.name,
            startingPrice: p.starting_price,
            items: JSON.parse(p.items_json),
          }))
        : undefined,
  };
}

function mapOpportunity(r: Row): Opportunity {
  return {
    id: r.id as OpportunityId,
    momentEventId: r.moment_event_id as MomentEventId,
    accountId: r.account_id as AccountId,
    name: r.name,
    expectedRevenue: r.expected_revenue,
    expectedGP: r.expected_gp,
    closeDate: r.close_date ?? "",
    stage: r.stage,
    ownerId: r.owner_id as UserId,
    nextAction: r.next_action ?? "",
    slaHours: r.sla_hours ?? undefined,
    channel: (r.channel ?? undefined) as Channel | undefined,
    createdAt: r.created_at,
  };
}

// ---------- hydration helpers ----------
// Every relation load is chunked to D1_SAFE_IN_CHUNK_SIZE (no arbitrary-size
// IN lists) and grouped into Maps once, so hydration is O(rows + related),
// not O(rows × related) — pre-deploy review P2.

/** Chunk-safe `SELECT ... WHERE <keyColumn> IN (chunk)` across all ids. */
async function fetchRelatedChunked(
  db: D1Database,
  sql: (placeholders: string) => string,
  ids: string[],
): Promise<Row[]> {
  const out: Row[] = [];
  for (const chunk of chunked(ids)) {
    const res = await db
      .prepare(sql(inClause(chunk.length)))
      .bind(...chunk)
      .all<Row>();
    out.push(...res.results);
  }
  return out;
}

function groupBy(rows: Row[], key: string): Map<string, Row[]> {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const k = row[key] as string;
    const bucket = map.get(k);
    if (bucket) bucket.push(row);
    else map.set(k, [row]);
  }
  return map;
}

async function hydrateAccounts(db: D1Database, rows: Row[]): Promise<Account[]> {
  if (rows.length === 0) return [];
  const ids = [...new Set(rows.map((r) => r.id as string))];
  const [contacts, whitespace, orders] = await Promise.all([
    fetchRelatedChunked(db, (ph) => `SELECT * FROM contacts WHERE account_id IN (${ph})`, ids),
    fetchRelatedChunked(db, (ph) => `SELECT * FROM account_whitespace WHERE account_id IN (${ph})`, ids),
    fetchRelatedChunked(db, (ph) => `SELECT * FROM orders_external WHERE account_id IN (${ph}) ORDER BY order_date`, ids),
  ]);
  const contactsBy = groupBy(contacts, "account_id");
  const whitespaceBy = groupBy(whitespace, "account_id");
  const ordersBy = groupBy(orders, "account_id");
  return rows.map((r) =>
    mapAccount(
      r,
      contactsBy.get(r.id) ?? [],
      whitespaceBy.get(r.id) ?? [],
      ordersBy.get(r.id) ?? [],
    ),
  );
}

async function hydrateEvents(db: D1Database, rows: Row[]): Promise<MomentEvent[]> {
  if (rows.length === 0) return [];
  const ids = [...new Set(rows.map((r) => r.id as string))];
  const [stakeholders, solutions] = await Promise.all([
    fetchRelatedChunked(db, (ph) => `SELECT * FROM moment_event_stakeholders WHERE moment_event_id IN (${ph})`, ids),
    fetchRelatedChunked(db, (ph) => `SELECT * FROM moment_event_solutions WHERE moment_event_id IN (${ph})`, ids),
  ]);
  const stakeholdersBy = groupBy(stakeholders, "moment_event_id");
  const solutionsBy = groupBy(solutions, "moment_event_id");
  return rows.map((r) =>
    mapEvent(r, stakeholdersBy.get(r.id) ?? [], solutionsBy.get(r.id) ?? []),
  );
}

async function hydrateSolutions(db: D1Database, rows: Row[]): Promise<Solution[]> {
  if (rows.length === 0) return [];
  const ids = [...new Set(rows.map((r) => r.id as string))];
  const [stakeholders, industries, packages, crossSell] = await Promise.all([
    fetchRelatedChunked(db, (ph) => `SELECT * FROM solution_stakeholders WHERE solution_id IN (${ph})`, ids),
    fetchRelatedChunked(db, (ph) => `SELECT * FROM solution_industries WHERE solution_id IN (${ph})`, ids),
    fetchRelatedChunked(db, (ph) => `SELECT * FROM solution_packages WHERE solution_id IN (${ph})`, ids),
    fetchRelatedChunked(db, (ph) => `SELECT * FROM solution_relations WHERE relation_type = 'CROSS_SELL' AND source_solution_id IN (${ph})`, ids),
  ]);
  const stakeholdersBy = groupBy(stakeholders, "solution_id");
  const industriesBy = groupBy(industries, "solution_id");
  const packagesBy = groupBy(packages, "solution_id");
  const crossSellBy = groupBy(crossSell, "source_solution_id");
  return rows.map((r) =>
    mapSolution(
      r,
      stakeholdersBy.get(r.id) ?? [],
      industriesBy.get(r.id) ?? [],
      packagesBy.get(r.id) ?? [],
      crossSellBy.get(r.id) ?? [],
    ),
  );
}

// ---------- repositories ----------

class D1AccountRepository implements AccountRepository {
  constructor(private db: D1Database) {}

  async getById(id: AccountId): Promise<Account | null> {
    const row = await this.db
      .prepare("SELECT * FROM accounts WHERE organization_id = ? AND id = ?")
      .bind(ORG, id)
      .first<Row>();
    if (!row) return null;
    const [account] = await hydrateAccounts(this.db, [row]);
    return account ?? null;
  }

  async getByIds(ids: AccountId[]): Promise<Account[]> {
    if (ids.length === 0) return [];
    const out: Row[] = [];
    for (const chunk of chunked(ids)) {
      const res = await this.db
        .prepare(
          `SELECT * FROM accounts WHERE organization_id = ? AND id IN (${inClause(chunk.length)})`,
        )
        .bind(ORG, ...chunk)
        .all<Row>();
      out.push(...res.results);
    }
    return hydrateAccounts(this.db, out);
  }

  async search(input: AccountSearchInput): Promise<Paginated<Account>> {
    const offset = input.cursor ? Number.parseInt(input.cursor, 10) || 0 : 0;
    const conditions = ["organization_id = ?"];
    const binds: unknown[] = [ORG];
    if (input.query) {
      conditions.push("(name LIKE ? OR industry LIKE ?)");
      binds.push(`%${input.query}%`, `%${input.query}%`);
    }
    if (input.ownerId) {
      conditions.push("owner_id = ?");
      binds.push(input.ownerId);
    }
    if (input.tier) {
      conditions.push("tier = ?");
      binds.push(input.tier);
    }
    const res = await this.db
      .prepare(
        `SELECT * FROM accounts WHERE ${conditions.join(" AND ")} ORDER BY account_score DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, input.limit + 1, offset)
      .all<Row>();
    const hasMore = res.results.length > input.limit;
    const items = await hydrateAccounts(this.db, res.results.slice(0, input.limit));
    return { items, nextCursor: hasMore ? String(offset + input.limit) : undefined };
  }

  async stats(): Promise<AccountStats> {
    const row = await this.db
      .prepare(
        `SELECT
           SUM(CASE WHEN customer_since IS NOT NULL AND customer_since != '' THEN 1 ELSE 0 END) AS active,
           SUM(CASE WHEN health = 'Healthy' THEN 1 ELSE 0 END) AS healthy,
           SUM(CASE WHEN health = 'At Risk' THEN 1 ELSE 0 END) AS at_risk,
           COALESCE(SUM(lifetime_value), 0) AS ltv,
           COALESCE(SUM(gross_profit), 0) AS gp
         FROM accounts WHERE organization_id = ?`,
      )
      .bind(ORG)
      .first<{
        active: number | null;
        healthy: number | null;
        at_risk: number | null;
        ltv: number;
        gp: number;
      }>();
    return {
      activeAccounts: row?.active ?? 0,
      healthyCount: row?.healthy ?? 0,
      atRiskCount: row?.at_risk ?? 0,
      totalLtv: row?.ltv ?? 0,
      totalGp: row?.gp ?? 0,
    };
  }

  async listByHealth(health: CustomerHealth, limit: number): Promise<Account[]> {
    const res = await this.db
      .prepare(
        "SELECT * FROM accounts WHERE organization_id = ? AND health = ? ORDER BY account_score DESC LIMIT ?",
      )
      .bind(ORG, health, limit)
      .all<Row>();
    return hydrateAccounts(this.db, res.results);
  }
}

class D1MomentRepository implements MomentRepository {
  constructor(private db: D1Database) {}

  async getById(id: MomentEventId): Promise<MomentEvent | null> {
    const row = await this.db
      .prepare("SELECT * FROM moment_events WHERE organization_id = ? AND id = ?")
      .bind(ORG, id)
      .first<Row>();
    if (!row) return null;
    const [event] = await hydrateEvents(this.db, [row]);
    return event ?? null;
  }

  async getByIds(ids: MomentEventId[]): Promise<MomentEvent[]> {
    if (ids.length === 0) return [];
    const rows: Row[] = [];
    for (const chunk of chunked(ids)) {
      const res = await this.db
        .prepare(
          `SELECT * FROM moment_events WHERE organization_id = ? AND id IN (${inClause(chunk.length)})`,
        )
        .bind(ORG, ...chunk)
        .all<Row>();
      rows.push(...res.results);
    }
    return hydrateEvents(this.db, rows);
  }

  async findActiveByAccounts(accountIds: AccountId[]): Promise<MomentEvent[]> {
    if (accountIds.length === 0) return [];
    const total =
      "(score_business_fit + score_intent + score_timing + score_wallet + score_relationship)";
    const rows: Row[] = [];
    for (const chunk of chunked(accountIds)) {
      const res = await this.db
        .prepare(
          `SELECT * FROM moment_events
           WHERE organization_id = ? AND account_id IN (${inClause(chunk.length)})
             AND status IN (${inClause(ACTIVE_MOMENT_STATUSES.length)})
           ORDER BY ${total} DESC`,
        )
        .bind(ORG, ...chunk, ...ACTIVE_MOMENT_STATUSES)
        .all<Row>();
      rows.push(...res.results);
    }
    return hydrateEvents(this.db, rows);
  }

  async findActiveByAccount(accountId: AccountId): Promise<MomentEvent[]> {
    const res = await this.db
      .prepare(
        `SELECT * FROM moment_events
         WHERE organization_id = ? AND account_id = ?
           AND status IN (${inClause(ACTIVE_MOMENT_STATUSES.length)})
         ORDER BY (score_business_fit + score_intent + score_timing + score_wallet + score_relationship) DESC`,
      )
      .bind(ORG, accountId, ...ACTIVE_MOMENT_STATUSES)
      .all<Row>();
    return hydrateEvents(this.db, res.results);
  }

  async listByAccount(accountId: AccountId): Promise<MomentEvent[]> {
    const res = await this.db
      .prepare(
        "SELECT * FROM moment_events WHERE organization_id = ? AND account_id = ? ORDER BY detected_at",
      )
      .bind(ORG, accountId)
      .all<Row>();
    return hydrateEvents(this.db, res.results);
  }

  async listAll(): Promise<MomentEvent[]> {
    const res = await this.db
      .prepare("SELECT * FROM moment_events WHERE organization_id = ?")
      .bind(ORG)
      .all<Row>();
    return hydrateEvents(this.db, res.results);
  }

  async listFiltered(filter: MomentListFilter): Promise<MomentEvent[]> {
    const conditions = ["organization_id = ?"];
    const binds: unknown[] = [ORG];
    if (filter.statuses && filter.statuses.length > 0) {
      conditions.push(`status IN (${inClause(filter.statuses.length)})`);
      binds.push(...filter.statuses);
    }
    if (filter.momentCodes && filter.momentCodes.length > 0) {
      conditions.push(`moment_code IN (${inClause(filter.momentCodes.length)})`);
      binds.push(...filter.momentCodes);
    }
    if (filter.activeOnly) {
      conditions.push(`status IN (${inClause(ACTIVE_MOMENT_STATUSES.length)})`);
      binds.push(...ACTIVE_MOMENT_STATUSES);
    }
    if (filter.expectedFrom) {
      conditions.push("expected_event_date >= ?");
      binds.push(filter.expectedFrom);
    }
    if (filter.expectedTo) {
      conditions.push("expected_event_date <= ?");
      binds.push(filter.expectedTo);
    }
    const order = filter.orderByExpectedDateDesc
      ? "expected_event_date DESC"
      : "detected_at DESC";
    const res = await this.db
      .prepare(
        `SELECT * FROM moment_events WHERE ${conditions.join(" AND ")} ORDER BY ${order} LIMIT ?`,
      )
      .bind(...binds, filter.limit)
      .all<Row>();
    return hydrateEvents(this.db, res.results);
  }

  async stats(): Promise<MomentStats> {
    const total =
      "(score_business_fit + score_intent + score_timing + score_wallet + score_relationship)";
    const row = await this.db
      .prepare(
        `SELECT COUNT(*) AS detected,
           SUM(CASE WHEN ${total} >= 85 THEN 1 ELSE 0 END) AS hot,
           SUM(CASE WHEN status = 'Won' THEN 1 ELSE 0 END) AS won
         FROM moment_events WHERE organization_id = ?`,
      )
      .bind(ORG)
      .first<{ detected: number; hot: number | null; won: number | null }>();
    return {
      detected: row?.detected ?? 0,
      hot: row?.hot ?? 0,
      won: row?.won ?? 0,
    };
  }

  async workStats(today: string): Promise<MomentWorkStats> {
    const total =
      "(score_business_fit + score_intent + score_timing + score_wallet + score_relationship)";
    const activeIn = `status IN (${inClause(ACTIVE_MOMENT_STATUSES.length)})`;
    const row = await this.db
      .prepare(
        `SELECT
           SUM(CASE WHEN ${activeIn} AND ${total} >= 85 THEN 1 ELSE 0 END) AS active_hot,
           SUM(CASE WHEN detected_at = ? THEN 1 ELSE 0 END) AS new_today,
           SUM(CASE WHEN julianday(?) - julianday(detected_at) BETWEEN 0 AND 7 THEN 1 ELSE 0 END) AS new_week,
           SUM(CASE WHEN status IN ('Qualified','Meeting Booked','Discovery Completed','Solution Design') THEN 1 ELSE 0 END) AS qualified,
           SUM(CASE WHEN status = 'Won' AND substr(expected_event_date, 1, 7) = substr(?, 1, 7) THEN 1 ELSE 0 END) AS won_month
         FROM moment_events WHERE organization_id = ?`,
      )
      .bind(...ACTIVE_MOMENT_STATUSES, today, today, today, ORG)
      .first<{
        active_hot: number | null;
        new_today: number | null;
        new_week: number | null;
        qualified: number | null;
        won_month: number | null;
      }>();
    return {
      activeHot: row?.active_hot ?? 0,
      newToday: row?.new_today ?? 0,
      newThisWeek: row?.new_week ?? 0,
      qualifiedActive: row?.qualified ?? 0,
      wonThisMonth: row?.won_month ?? 0,
    };
  }

  async radar(query: MomentRadarQuery): Promise<Paginated<MomentEvent>> {
    const offset = query.cursor ? Number.parseInt(query.cursor, 10) || 0 : 0;
    const conditions = ["organization_id = ?"];
    const binds: unknown[] = [ORG];
    if (query.activeOnly !== false) {
      conditions.push(`status IN (${inClause(ACTIVE_MOMENT_STATUSES.length)})`);
      binds.push(...ACTIVE_MOMENT_STATUSES);
    }
    if (query.triggerSources && query.triggerSources.length > 0) {
      conditions.push(`trigger_source IN (${inClause(query.triggerSources.length)})`);
      binds.push(...query.triggerSources);
    }
    if (query.ownerId) {
      conditions.push("owner_id = ?");
      binds.push(query.ownerId);
    }
    const total =
      "(score_business_fit + score_intent + score_timing + score_wallet + score_relationship)";
    if (query.priority) {
      // Priority bands from PRD §13 — expressed on the summed score in SQL.
      const bands: Record<string, string> = {
        HOT: `${total} >= 85`,
        WARM: `${total} BETWEEN 70 AND 84`,
        NURTURE: `${total} BETWEEN 50 AND 69`,
        WATCH: `${total} < 50`,
      };
      conditions.push(bands[query.priority]);
    }
    const res = await this.db
      .prepare(
        `SELECT * FROM moment_events WHERE ${conditions.join(" AND ")} ORDER BY ${total} DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, query.limit + 1, offset)
      .all<Row>();
    const hasMore = res.results.length > query.limit;
    const items = await hydrateEvents(this.db, res.results.slice(0, query.limit));
    return { items, nextCursor: hasMore ? String(offset + query.limit) : undefined };
  }

  async create(input: CreateMomentInput): Promise<MomentEvent> {
    const id = `ME-${crypto.randomUUID()}` as MomentEventId;
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    await this.db
      .prepare(
        `INSERT INTO moment_events (
           id, organization_id, account_id, moment_code, sub_moment,
           trigger_source, trigger_detail, detected_at, expected_event_date,
           score_business_fit, score_intent, score_timing, score_wallet, score_relationship,
           potential_wallet_min, potential_wallet_max,
           recommended_action, owner_id, status, next_expected_moment,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id, ORG, input.accountId, input.momentType, input.subMoment,
        "Manual", input.triggerDetail, today, input.expectedEventDate,
        input.score.businessFit, input.score.intent, input.score.timing,
        input.score.wallet, input.score.relationship,
        input.potentialWalletMin, input.potentialWalletMax,
        "Review Moment ใหม่ + Qualify", input.ownerId, "Detected", input.momentType,
        now, now,
      )
      .run();
    await this.db.batch(
      input.stakeholders.map((st) =>
        this.db
          .prepare(
            "INSERT INTO moment_event_stakeholders (moment_event_id, stakeholder) VALUES (?, ?)",
          )
          .bind(id, st),
      ),
    );
    const created = await this.getById(id);
    if (!created) throw new Error("Failed to create moment event");
    return created;
  }

  async updateStatus(id: MomentEventId, status: MomentEventStatus): Promise<void> {
    await this.db
      .prepare(
        "UPDATE moment_events SET status = ?, updated_at = ? WHERE organization_id = ? AND id = ?",
      )
      .bind(status, new Date().toISOString(), ORG, id)
      .run();
  }

  // Both decisions are atomic (D1 batch: state change + audit commit
  // together) and idempotent (verified_at IS NULL guard — a second click or
  // concurrent request changes nothing and returns false). Review §8, §Y6.
  private async decide(
    id: MomentEventId,
    userId: UserId,
    action: "confirm" | "reject",
    reason?: string,
  ): Promise<boolean> {
    // Fast path: already decided → no-op with no audit write at all. The
    // guarded UPDATE below still protects against the SELECT/UPDATE race.
    const existing = await this.db
      .prepare(
        "SELECT verified_at FROM moment_events WHERE organization_id = ? AND id = ?",
      )
      .bind(ORG, id)
      .first<{ verified_at: string | null }>();
    if (!existing || existing.verified_at !== null) return false;

    const now = new Date().toISOString();
    const statusSql =
      action === "confirm"
        ? "CASE WHEN status = 'Detected' THEN 'Review' ELSE status END"
        : "'Lost'";
    const [update] = await this.db.batch([
      this.db
        .prepare(
          `UPDATE moment_events
           SET verified_by = ?, verified_at = ?, updated_at = ?, status = ${statusSql}
           WHERE organization_id = ? AND id = ? AND verified_at IS NULL`,
        )
        .bind(userId, now, now, ORG, id),
      this.db
        .prepare(
          `INSERT INTO audit_logs (id, organization_id, user_id, entity_type, entity_id, action, after_json, created_at)
           VALUES (?, ?, ?, 'moment_event', ?, ?, ?, ?)`,
        )
        .bind(
          `AUD-${crypto.randomUUID()}`, ORG, userId, id, action,
          JSON.stringify({ verified_by: userId, verified_at: now, reason: reason ?? null }),
          now,
        ),
    ]);
    const changed = (update.meta.changes ?? 0) > 0;
    if (!changed) {
      // Already decided — remove the just-written audit row so history only
      // records decisions that actually changed state.
      await this.db
        .prepare(
          `DELETE FROM audit_logs
           WHERE organization_id = ? AND entity_id = ? AND action = ? AND created_at = ?`,
        )
        .bind(ORG, id, action, now)
        .run();
    }
    return changed;
  }

  async confirm(id: MomentEventId, userId: UserId): Promise<boolean> {
    return this.decide(id, userId, "confirm");
  }

  async reject(id: MomentEventId, userId: UserId, reason?: string): Promise<boolean> {
    return this.decide(id, userId, "reject", reason);
  }
}

class D1SignalRepository implements SignalRepository {
  constructor(private db: D1Database) {}

  private map(r: Row): MomentSignal {
    return {
      id: r.id,
      accountId: r.account_id as AccountId,
      momentEventId: (r.moment_event_id ?? null) as MomentEventId | null,
      sourceType: r.source_type,
      sourceRef: r.source_ref ?? undefined,
      sourceUrl: r.source_url ?? undefined,
      rawText: r.raw_text ?? "",
      confidence: r.confidence ?? undefined,
      detectedAt: r.detected_at,
      modelName: r.model_name ?? undefined,
      modelVersion: r.model_version ?? undefined,
    };
  }

  async listByEvent(momentEventId: MomentEventId): Promise<MomentSignal[]> {
    const res = await this.db
      .prepare(
        "SELECT * FROM moment_signals WHERE organization_id = ? AND moment_event_id = ? ORDER BY detected_at",
      )
      .bind(ORG, momentEventId)
      .all<Row>();
    return res.results.map((r) => this.map(r));
  }

  async listByAccount(accountId: AccountId): Promise<MomentSignal[]> {
    const res = await this.db
      .prepare(
        "SELECT * FROM moment_signals WHERE organization_id = ? AND account_id = ? ORDER BY detected_at",
      )
      .bind(ORG, accountId)
      .all<Row>();
    return res.results.map((r) => this.map(r));
  }

  async create(
    input: CreateSignalInput,
  ): Promise<{ signal: MomentSignal; created: boolean }> {
    const id = `SIG-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    // Unique index on (organization_id, ingest_key) makes retries safe.
    const res = await this.db
      .prepare(
        `INSERT OR IGNORE INTO moment_signals (
           id, organization_id, account_id, source_type, source_ref, source_url,
           raw_text, detected_at, ingest_key, processing_status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      )
      .bind(
        id, ORG, input.accountId, input.sourceType,
        input.sourceRef ?? null, input.sourceUrl ?? null, input.rawText,
        now, input.ingestKey,
      )
      .run();
    const created = (res.meta.changes ?? 0) > 0;
    const row = await this.db
      .prepare(
        "SELECT * FROM moment_signals WHERE organization_id = ? AND ingest_key = ?",
      )
      .bind(ORG, input.ingestKey)
      .first<Row>();
    if (!row) throw new Error("Signal insert failed");
    return { signal: this.map(row), created };
  }

  async markStatus(
    ids: string[],
    status: "queued" | "processed" | "failed",
  ): Promise<void> {
    if (ids.length === 0) return;
    for (const chunk of chunked(ids)) {
      await this.db
        .prepare(
          `UPDATE moment_signals SET processing_status = ?
           WHERE organization_id = ? AND id IN (${inClause(chunk.length)})`,
        )
        .bind(status, ORG, ...chunk)
        .run();
    }
  }
}

class D1MasterMomentRepository implements MasterMomentRepository {
  constructor(private db: D1Database) {}

  private async hydrate(rows: Row[]): Promise<MasterMoment[]> {
    if (rows.length === 0) return [];
    const codes = rows.map((r) => r.code);
    const [questions, next] = await Promise.all([
      this.db
        .prepare(
          `SELECT * FROM moment_discovery_questions WHERE moment_code IN (${inClause(codes.length)}) ORDER BY ordinal`,
        )
        .bind(...codes)
        .all<Row>(),
      this.db
        .prepare(`SELECT * FROM master_moment_next WHERE moment_code IN (${inClause(codes.length)})`)
        .bind(...codes)
        .all<Row>(),
    ]);
    return rows.map((r) => ({
      code: r.code as MomentCode,
      no: r.no,
      phase: r.phase,
      description: r.description,
      color: r.color ?? "#94a3b8",
      discoveryQuestions: questions.results
        .filter((q: Row) => q.moment_code === r.code)
        .map((q: Row) => q.question),
      nextMoments: next.results
        .filter((n: Row) => n.moment_code === r.code)
        .map((n: Row) => n.next_moment_code as MomentCode),
    }));
  }

  async getByCode(code: MomentCode): Promise<MasterMoment | null> {
    const row = await this.db
      .prepare("SELECT * FROM master_moments WHERE code = ? AND active = 1")
      .bind(code)
      .first<Row>();
    if (!row) return null;
    const [m] = await this.hydrate([row]);
    return m ?? null;
  }

  async listAll(): Promise<MasterMoment[]> {
    if (masterMomentsCache && Date.now() - masterMomentsCache.at < MASTER_CACHE_TTL_MS) {
      return masterMomentsCache.data;
    }
    const res = await this.db
      .prepare("SELECT * FROM master_moments WHERE active = 1 ORDER BY no")
      .all<Row>();
    const data = await this.hydrate(res.results);
    masterMomentsCache = { at: Date.now(), data };
    return data;
  }
}

class D1SolutionRepository implements SolutionRepository {
  constructor(private db: D1Database) {}

  async getById(id: SolutionId): Promise<Solution | null> {
    const row = await this.db
      .prepare("SELECT * FROM solutions WHERE organization_id = ? AND id = ? AND active = 1")
      .bind(ORG, id)
      .first<Row>();
    if (!row) return null;
    const [s] = await hydrateSolutions(this.db, [row]);
    return s ?? null;
  }

  async listByMoment(moment: MomentCode): Promise<Solution[]> {
    const res = await this.db
      .prepare("SELECT * FROM solutions WHERE organization_id = ? AND moment_code = ? AND active = 1")
      .bind(ORG, moment)
      .all<Row>();
    return hydrateSolutions(this.db, res.results);
  }

  async listAll(): Promise<Solution[]> {
    if (solutionsCache && Date.now() - solutionsCache.at < MASTER_CACHE_TTL_MS) {
      return solutionsCache.data;
    }
    const res = await this.db
      .prepare("SELECT * FROM solutions WHERE organization_id = ? AND active = 1 ORDER BY id")
      .bind(ORG)
      .all<Row>();
    const data = await hydrateSolutions(this.db, res.results);
    solutionsCache = { at: Date.now(), data };
    return data;
  }
}

class D1OpportunityRepository implements OpportunityRepository {
  constructor(private db: D1Database) {}

  async getById(id: OpportunityId): Promise<Opportunity | null> {
    const row = await this.db
      .prepare("SELECT * FROM opportunities WHERE organization_id = ? AND id = ?")
      .bind(ORG, id)
      .first<Row>();
    return row ? mapOpportunity(row) : null;
  }

  async list(input: { limit: number; cursor?: string }): Promise<Paginated<Opportunity>> {
    const offset = input.cursor ? Number.parseInt(input.cursor, 10) || 0 : 0;
    const res = await this.db
      .prepare(
        "SELECT * FROM opportunities WHERE organization_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
      )
      .bind(ORG, input.limit + 1, offset)
      .all<Row>();
    const hasMore = res.results.length > input.limit;
    return {
      items: res.results.slice(0, input.limit).map(mapOpportunity),
      nextCursor: hasMore ? String(offset + input.limit) : undefined,
    };
  }

  async listAll(): Promise<Opportunity[]> {
    const res = await this.db
      .prepare("SELECT * FROM opportunities WHERE organization_id = ? ORDER BY created_at DESC")
      .bind(ORG)
      .all<Row>();
    return res.results.map(mapOpportunity);
  }

  async create(input: CreateOpportunityInput): Promise<Opportunity> {
    const id = `OPP-${crypto.randomUUID()}` as OpportunityId;
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO opportunities (
           id, organization_id, moment_event_id, account_id, name,
           expected_revenue, expected_gp, close_date, stage,
           owner_id, next_action, channel, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id, ORG, input.momentEventId, input.accountId, input.name,
        input.expectedRevenue, input.expectedGP, input.closeDate, input.stage,
        input.ownerId, input.nextAction, input.channel ?? null, now, now,
      )
      .run();
    // Audit log for the commercial write (§38).
    await this.db
      .prepare(
        `INSERT INTO audit_logs (id, organization_id, user_id, entity_type, entity_id, action, after_json, created_at)
         VALUES (?, ?, ?, 'opportunity', ?, 'create', ?, ?)`,
      )
      .bind(`AUD-${crypto.randomUUID()}`, ORG, input.ownerId, id, JSON.stringify(input), now)
      .run();
    const created = await this.getById(id);
    if (!created) throw new Error("Failed to create opportunity");
    return created;
  }
}

class D1UserRepository implements UserRepository {
  constructor(private db: D1Database) {}

  async getById(id: UserId): Promise<User | null> {
    const row = await this.db
      .prepare("SELECT * FROM users WHERE organization_id = ? AND id = ?")
      .bind(ORG, id)
      .first<Row>();
    if (!row) return null;
    return {
      id: row.id as UserId,
      name: row.name,
      nickname: row.nickname ?? row.name,
      role: row.role,
      center: row.center ?? undefined,
    };
  }

  async getByIds(ids: UserId[]): Promise<User[]> {
    if (ids.length === 0) return [];
    const out: User[] = [];
    for (const chunk of chunked(ids)) {
      const res = await this.db
        .prepare(`SELECT * FROM users WHERE organization_id = ? AND id IN (${inClause(chunk.length)})`)
        .bind(ORG, ...chunk)
        .all<Row>();
      out.push(
        ...res.results.map((row: Row) => ({
          id: row.id as UserId,
          name: row.name,
          nickname: row.nickname ?? row.name,
          role: row.role,
          center: row.center ?? undefined,
        })),
      );
    }
    return out;
  }

  async listAll(): Promise<User[]> {
    const res = await this.db
      .prepare("SELECT * FROM users WHERE organization_id = ? ORDER BY id")
      .bind(ORG)
      .all<Row>();
    return res.results.map((row: Row) => ({
      id: row.id as UserId,
      name: row.name,
      nickname: row.nickname ?? row.name,
      role: row.role,
      center: row.center ?? undefined,
    }));
  }
}

class D1AppointmentRepository implements AppointmentRepository {
  constructor(private db: D1Database) {}

  async listUpcoming(): Promise<Appointment[]> {
    const res = await this.db
      .prepare(
        "SELECT * FROM appointments WHERE organization_id = ? AND status = 'Booked' ORDER BY datetime",
      )
      .bind(ORG)
      .all<Row>();
    return res.results.map((r: Row) => ({
      id: r.id,
      accountId: r.account_id as AccountId,
      momentEventId: r.moment_event_id as MomentEventId,
      center: r.center,
      datetime: r.datetime,
      consultantId: r.consultant_id as UserId,
      need: r.need ?? "",
      expectedWallet: r.expected_wallet,
      samples: r.samples_json ? JSON.parse(r.samples_json) : [],
      status: r.status,
    }));
  }
}

// ---------- CRM Activity Layer (sprint Step 2) ----------

function mapActivity(r: Row): Activity {
  return {
    id: r.id as ActivityId,
    accountId: r.account_id,
    contactId: (r.contact_id as ContactId) ?? null,
    opportunityId: r.opportunity_id ?? null,
    momentEventId: r.moment_event_id ?? null,
    activityType: r.activity_type as ActivityType,
    title: r.title ?? null,
    body: r.body ?? null,
    outcome: r.outcome ?? null,
    nextAction: r.next_action ?? null,
    nextActionAt: r.next_action_at ?? null,
    occurredAt: r.occurred_at,
    createdBy: r.created_by as UserId,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    metadata: r.metadata_json ? JSON.parse(r.metadata_json) : null,
    deletedAt: r.deleted_at ?? null,
    analysisStatus: r.analysis_status ?? null,
  };
}

function mapCrmTask(r: Row): CrmTask {
  return {
    id: r.id as TaskId,
    accountId: r.account_id ?? null,
    contactId: (r.contact_id as ContactId) ?? null,
    momentEventId: r.moment_event_id ?? null,
    opportunityId: r.opportunity_id ?? null,
    title: r.title,
    description: r.description ?? null,
    dueDate: r.due_date ?? null,
    assigneeId: (r.assignee_id as UserId) ?? null,
    createdBy: (r.created_by as UserId) ?? null,
    priority: r.priority as TaskPriority,
    status: r.status as TaskStatus,
    completedAt: r.completed_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapCrmContact(r: Row): CrmContact {
  return {
    id: r.id as ContactId,
    accountId: r.account_id,
    name: r.name,
    jobTitle: r.job_title ?? null,
    department: r.department ?? null,
    email: r.email ?? null,
    phone: r.phone ?? null,
    lineId: r.line_id ?? null,
    buyingRole: (r.buying_role as ContactRole) ?? null,
    influenceLevel: (r.influence_level as InfluenceLevel) ?? null,
    isPrimary: r.is_primary === 1,
    status: r.status as ContactStatus,
    notes: r.notes ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapSuggestion(r: Row): ActivitySuggestion {
  return {
    id: r.id as SuggestionId,
    activityId: r.activity_id as ActivityId,
    payload: JSON.parse(r.payload_json),
    confidence: r.confidence ?? null,
    status: r.status as SuggestionStatus,
    createdAt: r.created_at,
    decidedAt: r.decided_at ?? null,
    decidedBy: (r.decided_by as UserId) ?? null,
  };
}

/** Keyset cursor "occurredAt|id" — occurred_at ISO first, id after the first pipe. */
function decodeActivityCursor(cursor: string): { occurredAt: string; id: string } | null {
  const at = cursor.indexOf("|");
  if (at <= 0) return null;
  return { occurredAt: cursor.slice(0, at), id: cursor.slice(at + 1) };
}

function activityInsertStatement(
  db: D1Database,
  id: string,
  input: CreateActivityInput,
  now: string,
): D1PreparedStatement {
  // Durable dispatch (Step-6 P0): the outbox record IS part of the activity
  // row, so it commits in the same batch as the write — analysis can always
  // be recovered even if the enqueue attempt later fails.
  const analysisStatus = (ANALYZABLE_ACTIVITY_TYPES as readonly string[]).includes(
    input.activityType,
  )
    ? "PENDING"
    : null;
  return db
    .prepare(
      `INSERT OR IGNORE INTO activities (
         id, organization_id, account_id, contact_id, opportunity_id, moment_event_id,
         activity_type, title, body, outcome, next_action, next_action_at,
         occurred_at, created_by, created_at, updated_at, metadata_json,
         client_request_id, analysis_status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id, ORG, input.accountId, input.contactId ?? null, input.opportunityId ?? null,
      input.momentEventId ?? null, input.activityType, input.title ?? null,
      input.body ?? null, input.outcome ?? null, input.nextAction ?? null,
      input.nextActionAt ?? null, input.occurredAt, input.createdBy, now, now,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.clientRequestId ?? null, analysisStatus,
    );
}

function taskInsertStatement(
  db: D1Database,
  id: string,
  input: CreateCrmTaskInput,
  now: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT OR IGNORE INTO tasks (
         id, organization_id, account_id, contact_id, moment_event_id, opportunity_id,
         title, description, due_date, assignee_id, created_by, priority, status,
         client_request_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)`,
    )
    .bind(
      id, ORG, input.accountId ?? null, input.contactId ?? null,
      input.momentEventId ?? null, input.opportunityId ?? null, input.title,
      input.description ?? null, input.dueDate ?? null, input.assigneeId ?? null,
      // Canonical priority comes from the application layer — persisted verbatim.
      input.createdBy ?? null, input.priority,
      input.clientRequestId ?? null, now, now,
    );
}

class D1ActivityRepository implements ActivityRepository {
  constructor(private db: D1Database) {}

  async getById(id: ActivityId): Promise<Activity | null> {
    const row = await this.db
      .prepare(
        "SELECT * FROM activities WHERE organization_id = ? AND id = ? AND deleted_at IS NULL",
      )
      .bind(ORG, id)
      .first<Row>();
    return row ? mapActivity(row) : null;
  }

  async listByAccount(
    accountId: AccountId,
    options: ActivityListOptions = {},
  ): Promise<Paginated<Activity>> {
    const limit = options.limit ?? 20;
    const conditions = [
      "organization_id = ?",
      "account_id = ?",
      "deleted_at IS NULL",
    ];
    const binds: unknown[] = [ORG, accountId];
    if (options.types && options.types.length > 0) {
      conditions.push(`activity_type IN (${inClause(options.types.length)})`);
      binds.push(...options.types);
    }
    if (options.cursor) {
      const c = decodeActivityCursor(options.cursor);
      if (c) {
        conditions.push("(occurred_at < ? OR (occurred_at = ? AND id < ?))");
        binds.push(c.occurredAt, c.occurredAt, c.id);
      }
    }
    const res = await this.db
      .prepare(
        `SELECT * FROM activities WHERE ${conditions.join(" AND ")}
         ORDER BY occurred_at DESC, id DESC LIMIT ?`,
      )
      .bind(...binds, limit + 1)
      .all<Row>();
    const page = res.results.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map(mapActivity),
      nextCursor:
        res.results.length > limit && last
          ? `${last.occurred_at}|${last.id}`
          : undefined,
    };
  }

  async listRecentByAccounts(
    accountIds: AccountId[],
    limitPerAccount = 5,
  ): Promise<Map<AccountId, Activity[]>> {
    const out = new Map<AccountId, Activity[]>();
    if (accountIds.length === 0) return out;
    for (const chunk of chunked(accountIds)) {
      const res = await this.db
        .prepare(
          `SELECT * FROM (
             SELECT *, ROW_NUMBER() OVER (
               PARTITION BY account_id ORDER BY occurred_at DESC, id DESC
             ) AS rn
             FROM activities
             WHERE organization_id = ? AND account_id IN (${inClause(chunk.length)})
               AND deleted_at IS NULL
           ) WHERE rn <= ?`,
        )
        .bind(ORG, ...chunk, limitPerAccount)
        .all<Row>();
      for (const r of res.results) {
        const key = r.account_id as AccountId;
        const list = out.get(key) ?? [];
        list.push(mapActivity(r));
        out.set(key, list);
      }
    }
    return out;
  }

  async create(
    input: CreateActivityInput,
  ): Promise<{ activity: Activity; created: boolean }> {
    const id = `ACT-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    await activityInsertStatement(this.db, id, input, now).run();
    const survivorId = input.clientRequestId
      ? (
          await this.db
            .prepare(
              "SELECT id FROM activities WHERE organization_id = ? AND client_request_id = ?",
            )
            .bind(ORG, input.clientRequestId)
            .first<{ id: string }>()
        )?.id ?? id
      : id;
    const activity = await this.getById(survivorId as ActivityId);
    if (!activity) throw new Error("Activity insert failed: no survivor row");
    return { activity, created: survivorId === id };
  }

  async update(
    id: ActivityId,
    patch: UpdateActivityPatch,
    actor: UserId,
  ): Promise<Activity | null> {
    const existing = await this.getById(id);
    if (!existing) return null;
    const sets: string[] = [];
    const binds: unknown[] = [];
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const fields: [keyof UpdateActivityPatch, string, unknown][] = [
      ["body", "body", existing.body],
      ["outcome", "outcome", existing.outcome],
      ["nextAction", "next_action", existing.nextAction],
      ["nextActionAt", "next_action_at", existing.nextActionAt],
    ];
    for (const [key, column, prior] of fields) {
      if (patch[key] !== undefined) {
        sets.push(`${column} = ?`);
        binds.push(patch[key]);
        before[key] = prior;
        after[key] = patch[key];
      }
    }
    if (sets.length === 0) return existing;
    const now = new Date().toISOString();
    sets.push("updated_at = ?");
    binds.push(now);
    // Mutation + audit in ONE batch (Step-3 review item 4). The audit INSERT
    // is conditional on the same predicate as the UPDATE, so a row that was
    // deleted between read and write produces neither.
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE activities SET ${sets.join(", ")}
           WHERE organization_id = ? AND id = ? AND deleted_at IS NULL`,
        )
        .bind(...binds, ORG, id),
      this.db
        .prepare(
          `INSERT INTO audit_logs (
             id, organization_id, user_id, entity_type, entity_id, action,
             before_json, after_json, created_at
           )
           SELECT ?, ?, ?, 'activity', ?, 'ACTIVITY_UPDATED', ?, ?, ?
           WHERE EXISTS (
             SELECT 1 FROM activities
             WHERE organization_id = ? AND id = ? AND deleted_at IS NULL
           )`,
        )
        .bind(
          `AUD-${crypto.randomUUID()}`, ORG, actor, id,
          JSON.stringify(before), JSON.stringify(after), now, ORG, id,
        ),
    ]);
    return this.getById(id);
  }

  async softDelete(id: ActivityId, userId: UserId): Promise<boolean> {
    const now = new Date().toISOString();
    // Delete + audit in ONE batch. The audit guard matches deleted_at against
    // OUR timestamp, so only the batch that actually performed the delete
    // writes the audit row — a retry updates nothing and audits nothing.
    const results = await this.db.batch([
      this.db
        .prepare(
          `UPDATE activities SET deleted_at = ?, deleted_by = ?, updated_at = ?
           WHERE organization_id = ? AND id = ? AND deleted_at IS NULL`,
        )
        .bind(now, userId, now, ORG, id),
      this.db
        .prepare(
          `INSERT INTO audit_logs (
             id, organization_id, user_id, entity_type, entity_id, action,
             created_at
           )
           SELECT ?, ?, ?, 'activity', ?, 'ACTIVITY_DELETED', ?
           WHERE EXISTS (
             SELECT 1 FROM activities
             WHERE organization_id = ? AND id = ? AND deleted_at = ?
           )`,
        )
        .bind(`AUD-${crypto.randomUUID()}`, ORG, userId, id, now, ORG, id, now),
    ]);
    return ((results[0]?.meta as { changes?: number })?.changes ?? 0) > 0;
  }

  async lastActivityByOpportunities(ids: OpportunityId[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (ids.length === 0) return out;
    for (const chunk of chunked(ids)) {
      const res = await this.db
        .prepare(
          `SELECT opportunity_id, MAX(occurred_at) AS last_at
           FROM activities
           WHERE organization_id = ? AND opportunity_id IN (${inClause(chunk.length)})
             AND deleted_at IS NULL
           GROUP BY opportunity_id`,
        )
        .bind(ORG, ...chunk)
        .all<{ opportunity_id: string; last_at: string }>();
      for (const r of res.results) out.set(r.opportunity_id, r.last_at);
    }
    return out;
  }

  async markAnalysisStatus(
    ids: ActivityId[],
    status: "QUEUED" | "PROCESSED",
  ): Promise<void> {
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    for (const chunk of chunked(ids)) {
      await this.db
        .prepare(
          `UPDATE activities SET analysis_status = ?, updated_at = ?
           WHERE organization_id = ? AND id IN (${inClause(chunk.length)})`,
        )
        .bind(status, now, ORG, ...chunk)
        .run();
    }
  }
}

class D1TaskRepository implements TaskRepository {
  constructor(private db: D1Database) {}

  async getById(id: TaskId): Promise<CrmTask | null> {
    const row = await this.db
      .prepare("SELECT * FROM tasks WHERE organization_id = ? AND id = ?")
      .bind(ORG, id)
      .first<Row>();
    return row ? mapCrmTask(row) : null;
  }

  async create(input: CreateCrmTaskInput): Promise<{ task: CrmTask; created: boolean }> {
    const id = `TSK-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    await taskInsertStatement(this.db, id, input, now).run();
    const survivorId = input.clientRequestId
      ? (
          await this.db
            .prepare(
              "SELECT id FROM tasks WHERE organization_id = ? AND client_request_id = ?",
            )
            .bind(ORG, input.clientRequestId)
            .first<{ id: string }>()
        )?.id ?? id
      : id;
    const task = await this.getById(survivorId as TaskId);
    if (!task) throw new Error("Task insert failed: no survivor row");
    return { task, created: survivorId === id };
  }

  async complete(id: TaskId): Promise<boolean> {
    const now = new Date().toISOString();
    const res = await this.db
      .prepare(
        `UPDATE tasks SET status = 'DONE', completed_at = ?, updated_at = ?
         WHERE organization_id = ? AND id = ? AND status IN ('OPEN','IN_PROGRESS')`,
      )
      .bind(now, now, ORG, id)
      .run();
    return (res.meta.changes ?? 0) > 0;
  }

  async listByAssignee(
    assigneeId: UserId,
    band: TaskDueBand,
    today: string,
    limit: number,
  ): Promise<CrmTask[]> {
    const bandCondition =
      band === "overdue"
        ? "due_date < ?"
        : band === "today"
          ? "due_date = ?"
          : "due_date > ?";
    const res = await this.db
      .prepare(
        `SELECT * FROM tasks
         WHERE organization_id = ? AND assignee_id = ?
           AND status IN ('OPEN','IN_PROGRESS')
           AND due_date IS NOT NULL AND ${bandCondition}
         ORDER BY due_date, id LIMIT ?`,
      )
      .bind(ORG, assigneeId, today, limit)
      .all<Row>();
    return res.results.map(mapCrmTask);
  }

  async listByAccount(accountId: AccountId, limit: number): Promise<CrmTask[]> {
    const res = await this.db
      .prepare(
        `SELECT * FROM tasks WHERE organization_id = ? AND account_id = ?
         ORDER BY (due_date IS NULL), due_date, id LIMIT ?`,
      )
      .bind(ORG, accountId, limit)
      .all<Row>();
    return res.results.map(mapCrmTask);
  }

  async listByOpportunity(opportunityId: OpportunityId, limit: number): Promise<CrmTask[]> {
    const res = await this.db
      .prepare(
        `SELECT * FROM tasks WHERE organization_id = ? AND opportunity_id = ?
         ORDER BY (due_date IS NULL), due_date, id LIMIT ?`,
      )
      .bind(ORG, opportunityId, limit)
      .all<Row>();
    return res.results.map(mapCrmTask);
  }

  async nextOpenTaskByOpportunities(
    ids: OpportunityId[],
  ): Promise<Map<string, CrmTask>> {
    const out = new Map<string, CrmTask>();
    if (ids.length === 0) return out;
    for (const chunk of chunked(ids)) {
      const res = await this.db
        .prepare(
          `SELECT * FROM (
             SELECT *, ROW_NUMBER() OVER (
               PARTITION BY opportunity_id
               ORDER BY (due_date IS NULL), due_date, id
             ) AS rn
             FROM tasks
             WHERE organization_id = ? AND opportunity_id IN (${inClause(chunk.length)})
               AND status IN ('OPEN','IN_PROGRESS')
           ) WHERE rn = 1`,
        )
        .bind(ORG, ...chunk)
        .all<Row>();
      for (const r of res.results) out.set(r.opportunity_id, mapCrmTask(r));
    }
    return out;
  }
}

class D1ContactRepository implements ContactRepository {
  constructor(private db: D1Database) {}

  async getById(id: ContactId): Promise<CrmContact | null> {
    const row = await this.db
      .prepare("SELECT * FROM contacts WHERE organization_id = ? AND id = ?")
      .bind(ORG, id)
      .first<Row>();
    return row ? mapCrmContact(row) : null;
  }

  async getByIds(ids: ContactId[]): Promise<CrmContact[]> {
    if (ids.length === 0) return [];
    const out: CrmContact[] = [];
    for (const chunk of chunked(ids)) {
      const res = await this.db
        .prepare(
          `SELECT * FROM contacts WHERE organization_id = ? AND id IN (${inClause(chunk.length)})`,
        )
        .bind(ORG, ...chunk)
        .all<Row>();
      out.push(...res.results.map(mapCrmContact));
    }
    return out;
  }

  async listByAccount(accountId: AccountId): Promise<CrmContact[]> {
    const res = await this.db
      .prepare(
        `SELECT * FROM contacts WHERE organization_id = ? AND account_id = ?
         ORDER BY is_primary DESC, name`,
      )
      .bind(ORG, accountId)
      .all<Row>();
    return res.results.map(mapCrmContact);
  }

  async create(
    input: CreateCrmContactInput,
  ): Promise<{ contact: CrmContact; created: boolean }> {
    const id = `CT-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO contacts (
           id, organization_id, account_id, name, job_title, department, email,
           phone, line_id, buying_role, influence_level, is_primary, status,
           notes, client_request_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id, ORG, input.accountId, input.name, input.jobTitle ?? null,
        input.department ?? null, input.email ?? null, input.phone ?? null,
        input.lineId ?? null, input.buyingRole ?? null,
        input.influenceLevel ?? null, input.isPrimary ? 1 : 0,
        input.status ?? "ACTIVE", input.notes ?? null,
        input.clientRequestId ?? null, now, now,
      )
      .run();
    const survivorId = input.clientRequestId
      ? (
          await this.db
            .prepare(
              "SELECT id FROM contacts WHERE organization_id = ? AND client_request_id = ?",
            )
            .bind(ORG, input.clientRequestId)
            .first<{ id: string }>()
        )?.id ?? id
      : id;
    const contact = await this.getById(survivorId as ContactId);
    if (!contact) throw new Error("Contact insert failed");
    return { contact, created: survivorId === id };
  }

  async update(id: ContactId, patch: UpdateCrmContactPatch): Promise<CrmContact | null> {
    const columns: Record<string, unknown> = {
      name: patch.name,
      job_title: patch.jobTitle,
      department: patch.department,
      email: patch.email,
      phone: patch.phone,
      line_id: patch.lineId,
      buying_role: patch.buyingRole,
      influence_level: patch.influenceLevel,
      is_primary: patch.isPrimary === undefined ? undefined : patch.isPrimary ? 1 : 0,
      status: patch.status,
      notes: patch.notes,
    };
    const sets: string[] = [];
    const binds: unknown[] = [];
    for (const [col, value] of Object.entries(columns)) {
      if (value !== undefined) {
        sets.push(`${col} = ?`);
        binds.push(value);
      }
    }
    if (sets.length > 0) {
      sets.push("updated_at = ?");
      binds.push(new Date().toISOString());
      await this.db
        .prepare(
          `UPDATE contacts SET ${sets.join(", ")} WHERE organization_id = ? AND id = ?`,
        )
        .bind(...binds, ORG, id)
        .run();
    }
    return this.getById(id);
  }
}

class D1SuggestionRepository implements SuggestionRepository {
  constructor(private db: D1Database) {}

  async getById(id: SuggestionId): Promise<ActivitySuggestion | null> {
    const row = await this.db
      .prepare(
        "SELECT * FROM activity_ai_suggestions WHERE organization_id = ? AND id = ?",
      )
      .bind(ORG, id)
      .first<Row>();
    return row ? mapSuggestion(row) : null;
  }

  async create(input: CreateSuggestionInput): Promise<ActivitySuggestion> {
    const id = `SUG-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO activity_ai_suggestions (
           id, organization_id, activity_id, payload_json, confidence, status, created_at
         ) VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`,
      )
      .bind(id, ORG, input.activityId, JSON.stringify(input.payload),
            input.confidence ?? null, now)
      .run();
    const suggestion = await this.getById(id as SuggestionId);
    if (!suggestion) throw new Error("Suggestion insert failed");
    return suggestion;
  }

  async listPendingByAccount(
    accountId: AccountId,
    limit: number,
  ): Promise<ActivitySuggestion[]> {
    const res = await this.db
      .prepare(
        `SELECT s.* FROM activity_ai_suggestions s
         JOIN activities a ON a.id = s.activity_id AND a.organization_id = s.organization_id
         WHERE s.organization_id = ? AND a.account_id = ? AND s.status = 'PENDING'
         ORDER BY s.created_at DESC LIMIT ?`,
      )
      .bind(ORG, accountId, limit)
      .all<Row>();
    return res.results.map(mapSuggestion);
  }
}

class D1SuggestionDecisionWriteRepository implements SuggestionDecisionWriteRepository {
  constructor(private db: D1Database) {}

  async acceptAtomic(input: AcceptSuggestionInput): Promise<AcceptSuggestionOutcome> {
    const now = new Date().toISOString();
    const acceptedGuard = `EXISTS (
      SELECT 1 FROM activity_ai_suggestions
      WHERE organization_id = ? AND id = ? AND status = 'ACCEPTED'
    )`;
    const dedupeKey = input.moment
      ? `SUGGESTION:${ORG}:${input.accountId}:${input.moment.momentCode}:${input.suggestionId}`
      : null;

    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `UPDATE activity_ai_suggestions
           SET status = 'ACCEPTED', decided_at = ?, decided_by = ?
           WHERE organization_id = ? AND id = ? AND status = 'PENDING'`,
        )
        .bind(now, input.userId, ORG, input.suggestionId),
    ];
    if (input.moment && dedupeKey) {
      const m = input.moment;
      statements.push(
        this.db
          .prepare(
            `INSERT OR IGNORE INTO moment_events (
               id, organization_id, account_id, moment_code, sub_moment,
               trigger_source, trigger_detail, detected_at, expected_event_date,
               score_business_fit, score_intent, score_timing, score_wallet, score_relationship,
               potential_wallet_min, potential_wallet_max,
               recommended_action, status, next_expected_moment,
               detection_confidence, detected_by, dedupe_key, created_at, updated_at
             )
             SELECT ?, ?, ?, ?, ?, 'CRM Note', ?, ?, ?, 15, ?, 10, 5, 5, 0, 0,
                    ?, 'Detected', ?, ?, ?, ?, ?, ?
             WHERE ${acceptedGuard}`,
          )
          .bind(
            `ME-${crypto.randomUUID()}`, ORG, input.accountId, m.momentCode, m.subMoment,
            m.reason, now.slice(0, 10), m.expectedEventDate,
            Math.round(m.confidence * 20),
            "Review Moment จาก AI Suggestion", m.momentCode,
            m.confidence, "AI-SUGGESTION@1", dedupeKey, now, now,
            ORG, input.suggestionId,
          ),
      );
      for (const solutionId of m.solutionIds) {
        statements.push(
          this.db
            .prepare(
              `INSERT OR IGNORE INTO moment_event_solutions (moment_event_id, solution_id)
               SELECT e.id, ? FROM moment_events e
               WHERE e.organization_id = ? AND e.dedupe_key = ? AND ${acceptedGuard}`,
            )
            .bind(solutionId, ORG, dedupeKey, ORG, input.suggestionId),
        );
      }
    }
    if (input.task) {
      statements.push(
        this.db
          .prepare(
            `INSERT OR IGNORE INTO tasks (
               id, organization_id, account_id, title, due_date, assignee_id,
               created_by, priority, status, client_request_id, created_at, updated_at
             )
             SELECT ?, ?, ?, ?, ?, ?, ?, 'NORMAL', 'OPEN', ?, ?, ?
             WHERE ${acceptedGuard}`,
          )
          .bind(
            `TSK-${crypto.randomUUID()}`, ORG, input.accountId, input.task.title,
            input.task.dueDate ?? null, input.userId, input.userId,
            suggestionTaskKey(input.suggestionId), now, now,
            ORG, input.suggestionId,
          ),
      );
    }
    statements.push(
      this.db
        .prepare(
          `INSERT OR IGNORE INTO audit_logs (
             id, organization_id, user_id, entity_type, entity_id, action, created_at
           )
           SELECT ?, ?, ?, 'activity_ai_suggestion', ?, 'SUGGESTION_ACCEPTED', ?
           WHERE ${acceptedGuard}`,
        )
        .bind(
          `AUD:SUG:${input.suggestionId}`, ORG, input.userId, input.suggestionId, now,
          ORG, input.suggestionId,
        ),
    );

    const results = await this.db.batch(statements);
    const changed = ((results[0]?.meta as { changes?: number })?.changes ?? 0) > 0;

    let momentEventId: string | null = null;
    if (dedupeKey) {
      momentEventId =
        (
          await this.db
            .prepare(
              "SELECT id FROM moment_events WHERE organization_id = ? AND dedupe_key = ?",
            )
            .bind(ORG, dedupeKey)
            .first<{ id: string }>()
        )?.id ?? null;
    }
    let taskId: string | null = null;
    if (input.task) {
      taskId =
        (
          await this.db
            .prepare(
              "SELECT id FROM tasks WHERE organization_id = ? AND client_request_id = ?",
            )
            .bind(ORG, suggestionTaskKey(input.suggestionId))
            .first<{ id: string }>()
        )?.id ?? null;
    }
    return { changed, momentEventId, taskId };
  }

  async ignoreAtomic(id: SuggestionId, userId: UserId): Promise<{ changed: boolean }> {
    const now = new Date().toISOString();
    const results = await this.db.batch([
      this.db
        .prepare(
          `UPDATE activity_ai_suggestions
           SET status = 'IGNORED', decided_at = ?, decided_by = ?
           WHERE organization_id = ? AND id = ? AND status = 'PENDING'`,
        )
        .bind(now, userId, ORG, id),
      this.db
        .prepare(
          `INSERT OR IGNORE INTO audit_logs (
             id, organization_id, user_id, entity_type, entity_id, action, created_at
           )
           SELECT ?, ?, ?, 'activity_ai_suggestion', ?, 'SUGGESTION_IGNORED', ?
           WHERE EXISTS (
             SELECT 1 FROM activity_ai_suggestions
             WHERE organization_id = ? AND id = ? AND status = 'IGNORED'
           )`,
        )
        .bind(`AUD:SUG-IGN:${id}`, ORG, userId, id, now, ORG, id),
    ]);
    return { changed: ((results[0]?.meta as { changes?: number })?.changes ?? 0) > 0 };
  }
}

class D1InteractionWriteRepository implements InteractionWriteRepository {
  constructor(
    private db: D1Database,
    private activities: D1ActivityRepository,
    private tasks: D1TaskRepository,
  ) {}

  async logInteraction(
    input: LogInteractionInput,
  ): Promise<{ activity: Activity; task?: CrmTask; deduped: boolean }> {
    const requestId = input.activity.clientRequestId;
    if (!requestId) {
      throw new Error("logInteraction requires activity.clientRequestId");
    }
    const now = new Date().toISOString();
    const activityId = `ACT-${crypto.randomUUID()}`;
    const taskKey = followUpTaskKey(requestId);

    const statements: D1PreparedStatement[] = [
      activityInsertStatement(this.db, activityId, input.activity, now),
    ];
    if (input.followUpTask) {
      statements.push(
        taskInsertStatement(
          this.db,
          `TSK-${crypto.randomUUID()}`,
          { ...input.followUpTask, clientRequestId: taskKey },
          now,
        ),
      );
    }
    if (input.audit) {
      // Deterministic id — a retried batch collides on the PK and is ignored.
      statements.push(
        this.db
          .prepare(
            `INSERT OR IGNORE INTO audit_logs (
               id, organization_id, user_id, entity_type, entity_id, action,
               after_json, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            `AUD-ACT-${requestId}`, ORG, input.audit.userId,
            input.audit.entityType, input.audit.entityId, input.audit.action,
            input.audit.afterJson ? JSON.stringify(input.audit.afterJson) : null,
            now,
          ),
      );
    }
    await this.db.batch(statements);

    const survivor = await this.db
      .prepare(
        "SELECT id FROM activities WHERE organization_id = ? AND client_request_id = ?",
      )
      .bind(ORG, requestId)
      .first<{ id: string }>();
    if (!survivor) throw new Error("logInteraction: no survivor activity");
    const activity = await this.activities.getById(survivor.id as ActivityId);
    if (!activity) throw new Error("logInteraction: survivor activity unreadable");

    let task: CrmTask | undefined;
    if (input.followUpTask) {
      const taskRow = await this.db
        .prepare(
          "SELECT id FROM tasks WHERE organization_id = ? AND client_request_id = ?",
        )
        .bind(ORG, taskKey)
        .first<{ id: string }>();
      task = taskRow ? (await this.tasks.getById(taskRow.id as TaskId)) ?? undefined : undefined;
    }
    return { activity, task, deduped: survivor.id !== activityId };
  }
}

export async function createD1Repositories(): Promise<Repositories> {
  const env = await getBindings();
  if (!env.DB) {
    throw new Error(
      "MOMENT_OS_DATA_SOURCE=d1 but no DB binding — provision D1 and set database_id in wrangler.jsonc",
    );
  }
  const db = env.DB;
  const activities = new D1ActivityRepository(db);
  const tasks = new D1TaskRepository(db);
  return {
    accounts: new D1AccountRepository(db),
    moments: new D1MomentRepository(db),
    masterMoments: new D1MasterMomentRepository(db),
    solutions: new D1SolutionRepository(db),
    opportunities: new D1OpportunityRepository(db),
    users: new D1UserRepository(db),
    appointments: new D1AppointmentRepository(db),
    signals: new D1SignalRepository(db),
    activities,
    tasks,
    contacts: new D1ContactRepository(db),
    suggestions: new D1SuggestionRepository(db),
    suggestionDecisions: new D1SuggestionDecisionWriteRepository(db),
    interactions: new D1InteractionWriteRepository(db, activities, tasks),
  };
}
