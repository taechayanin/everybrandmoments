import type {
  Account,
  AccountId,
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
  Solution,
  SolutionId,
  User,
  UserId,
  WhitespaceCategory,
} from "@/lib/types";
import { WHITESPACE_CATEGORIES } from "@/lib/domain/account";
import { ACTIVE_MOMENT_STATUSES } from "@/lib/domain/moment";
import type {
  AccountRepository,
  AccountSearchInput,
  AppointmentRepository,
  CreateMomentInput,
  CreateOpportunityInput,
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
import { getBindings } from "../env";

// Single-org deployment until auth lands (Sprint 7); every query is already
// org-scoped so multi-tenancy is a data change, not a code change (§37).
const ORG = "ORG-001";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

function inClause(n: number): string {
  return Array(n).fill("?").join(", ");
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
    contacts: contacts.map((c) => ({ name: c.name, role: c.role ?? "", phone: c.phone ?? "" })),
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
  };
}

// ---------- hydration helpers ----------

async function hydrateAccounts(db: D1Database, rows: Row[]): Promise<Account[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [contacts, whitespace, orders] = await Promise.all([
    db.prepare(`SELECT * FROM contacts WHERE account_id IN (${inClause(ids.length)})`).bind(...ids).all(),
    db.prepare(`SELECT * FROM account_whitespace WHERE account_id IN (${inClause(ids.length)})`).bind(...ids).all(),
    db.prepare(`SELECT * FROM orders_external WHERE account_id IN (${inClause(ids.length)}) ORDER BY order_date`).bind(...ids).all(),
  ]);
  return rows.map((r) =>
    mapAccount(
      r,
      contacts.results.filter((c: Row) => c.account_id === r.id),
      whitespace.results.filter((w: Row) => w.account_id === r.id),
      orders.results.filter((o: Row) => o.account_id === r.id),
    ),
  );
}

async function hydrateEvents(db: D1Database, rows: Row[]): Promise<MomentEvent[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [stakeholders, solutions] = await Promise.all([
    db.prepare(`SELECT * FROM moment_event_stakeholders WHERE moment_event_id IN (${inClause(ids.length)})`).bind(...ids).all(),
    db.prepare(`SELECT * FROM moment_event_solutions WHERE moment_event_id IN (${inClause(ids.length)})`).bind(...ids).all(),
  ]);
  return rows.map((r) =>
    mapEvent(
      r,
      stakeholders.results.filter((s: Row) => s.moment_event_id === r.id),
      solutions.results.filter((s: Row) => s.moment_event_id === r.id),
    ),
  );
}

async function hydrateSolutions(db: D1Database, rows: Row[]): Promise<Solution[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [stakeholders, industries, packages, crossSell] = await Promise.all([
    db.prepare(`SELECT * FROM solution_stakeholders WHERE solution_id IN (${inClause(ids.length)})`).bind(...ids).all(),
    db.prepare(`SELECT * FROM solution_industries WHERE solution_id IN (${inClause(ids.length)})`).bind(...ids).all(),
    db.prepare(`SELECT * FROM solution_packages WHERE solution_id IN (${inClause(ids.length)})`).bind(...ids).all(),
    db.prepare(`SELECT * FROM solution_relations WHERE relation_type = 'CROSS_SELL' AND source_solution_id IN (${inClause(ids.length)})`).bind(...ids).all(),
  ]);
  return rows.map((r) =>
    mapSolution(
      r,
      stakeholders.results.filter((s: Row) => s.solution_id === r.id),
      industries.results.filter((i: Row) => i.solution_id === r.id),
      packages.results.filter((p: Row) => p.solution_id === r.id),
      crossSell.results.filter((c: Row) => c.source_solution_id === r.id),
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

  async verify(id: MomentEventId, verifiedBy: UserId): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `UPDATE moment_events
         SET verified_by = ?, verified_at = ?, updated_at = ?,
             status = CASE WHEN status = 'Detected' THEN 'Review' ELSE status END
         WHERE organization_id = ? AND id = ?`,
      )
      .bind(verifiedBy, now, now, ORG, id)
      .run();
    await this.db
      .prepare(
        `INSERT INTO audit_logs (id, organization_id, user_id, entity_type, entity_id, action, after_json, created_at)
         VALUES (?, ?, ?, 'moment_event', ?, 'verify', ?, ?)`,
      )
      .bind(
        `AUD-${crypto.randomUUID()}`, ORG, verifiedBy, id,
        JSON.stringify({ verified_by: verifiedBy, verified_at: now }), now,
      )
      .run();
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
    const res = await this.db
      .prepare("SELECT * FROM master_moments WHERE active = 1 ORDER BY no")
      .all<Row>();
    return this.hydrate(res.results);
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
    const res = await this.db
      .prepare("SELECT * FROM solutions WHERE organization_id = ? AND active = 1 ORDER BY id")
      .bind(ORG)
      .all<Row>();
    return hydrateSolutions(this.db, res.results);
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

export async function createD1Repositories(): Promise<Repositories> {
  const env = await getBindings();
  if (!env.DB) {
    throw new Error(
      "MOMENT_OS_DATA_SOURCE=d1 but no DB binding — provision D1 and set database_id in wrangler.jsonc",
    );
  }
  const db = env.DB;
  return {
    accounts: new D1AccountRepository(db),
    moments: new D1MomentRepository(db),
    masterMoments: new D1MasterMomentRepository(db),
    solutions: new D1SolutionRepository(db),
    opportunities: new D1OpportunityRepository(db),
    users: new D1UserRepository(db),
    appointments: new D1AppointmentRepository(db),
    signals: new D1SignalRepository(db),
  };
}
