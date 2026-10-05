import { and, asc, eq, isNull, lt, ne, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import type {
  AuditEvent,
  Candidate,
  CandidateEnrichment,
  CandidateStatus,
  DisputeRecord,
  OutboxEvent,
  Policy,
  PolicyCategory,
  RoleProfile,
  Scorecard,
  ScorecardAnswer,
  ScreeningResult,
  ReviewDecision,
  Tenant,
  TenantSettings,
  UserAccess,
} from "../types.js";
import type { ScorecardRow } from "./schema.js";
import type {
  AuditStore,
  CandidateStore,
  ClaimableOutboxStore,
  PolicyStore,
  RoleStore,
  ScorecardStore,
  Store,
  TenantStore,
  UserAccessStore,
} from "../store.js";
import {
  auditEvents,
  candidates,
  outboxEvents,
  policies,
  roles,
  scorecards,
  tenants,
  userAccess,
} from "./schema.js";

export type HrDatabase = NodePgDatabase;

export class PgTenantStore implements TenantStore {
  constructor(private readonly db: HrDatabase) {}

  async create(tenant: Tenant): Promise<void> {
    await this.db.insert(tenants).values({
      id: tenant.id,
      name: tenant.name,
      createdAt: tenant.createdAt,
      settings: tenant.settings ?? null,
    });
  }

  async get(id: string): Promise<Tenant | null> {
    const [row] = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1);
    return row ? rowToTenant(row) : null;
  }

  async list(): Promise<Tenant[]> {
    const rows = await this.db
      .select()
      .from(tenants)
      .orderBy(asc(tenants.createdAt));
    return rows.map(rowToTenant);
  }

  async updateSettings(
    id: string,
    settings: TenantSettings,
  ): Promise<Tenant | null> {
    const rows = await this.db
      .update(tenants)
      .set({ settings })
      .where(eq(tenants.id, id))
      .returning();
    const row = rows.length ? rows[0] : undefined;
    return row ? rowToTenant(row) : null;
  }
}

export class PgUserAccessStore implements UserAccessStore {
  constructor(private readonly db: HrDatabase) {}

  async create(user: UserAccess): Promise<void> {
    await this.db.insert(userAccess).values({
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    });
  }

  async get(id: string, tenantId: string): Promise<UserAccess | null> {
    const [row] = await this.db
      .select()
      .from(userAccess)
      .where(and(eq(userAccess.id, id), eq(userAccess.tenantId, tenantId)))
      .limit(1);
    return row ?? null;
  }

  async list(tenantId: string): Promise<UserAccess[]> {
    return this.db
      .select()
      .from(userAccess)
      .where(eq(userAccess.tenantId, tenantId))
      .orderBy(asc(userAccess.createdAt));
  }

  async update(user: UserAccess): Promise<void> {
    const rows = await this.db
      .update(userAccess)
      .set({ role: user.role })
      .where(
        and(eq(userAccess.id, user.id), eq(userAccess.tenantId, user.tenantId)),
      )
      .returning({ id: userAccess.id });
    if (rows.length === 0) {
      throw new Error(`user access "${user.id}" not found`);
    }
  }

  async remove(id: string, tenantId: string): Promise<void> {
    await this.db
      .delete(userAccess)
      .where(and(eq(userAccess.id, id), eq(userAccess.tenantId, tenantId)));
  }
}

export class PgPolicyStore implements PolicyStore {
  constructor(private readonly db: HrDatabase) {}

  async create(policy: Policy): Promise<void> {
    await this.db.insert(policies).values(policyToRow(policy));
  }

  async get(id: string, tenantId: string): Promise<Policy | null> {
    const [row] = await this.db
      .select()
      .from(policies)
      .where(and(eq(policies.id, id), eq(policies.tenantId, tenantId)))
      .limit(1);
    return row ? rowToPolicy(row) : null;
  }

  async list(tenantId: string): Promise<Policy[]> {
    const rows = await this.db
      .select()
      .from(policies)
      .where(eq(policies.tenantId, tenantId))
      .orderBy(asc(policies.createdAt));
    return rows.map(rowToPolicy);
  }

  async update(policy: Policy): Promise<void> {
    const rows = await this.db
      .update(policies)
      .set(policyToRow(policy))
      .where(
        and(eq(policies.id, policy.id), eq(policies.tenantId, policy.tenantId)),
      )
      .returning({ id: policies.id });
    if (rows.length === 0) {
      throw new Error(`policy "${policy.id}" not found`);
    }
  }

  async remove(id: string, tenantId: string): Promise<void> {
    await this.db
      .delete(policies)
      .where(and(eq(policies.id, id), eq(policies.tenantId, tenantId)));
  }
}

export class PgRoleStore implements RoleStore {
  constructor(private readonly db: HrDatabase) {}

  async create(role: RoleProfile): Promise<void> {
    await this.db.insert(roles).values(roleToRow(role));
  }

  async get(id: string, tenantId?: string): Promise<RoleProfile | null> {
    const conditions: SQL[] = [eq(roles.id, id)];
    if (tenantId !== undefined) conditions.push(eq(roles.tenantId, tenantId));
    const [row] = await this.db
      .select()
      .from(roles)
      .where(and(...conditions))
      .limit(1);
    return row ? rowToRole(row) : null;
  }

  async list(tenantId?: string): Promise<RoleProfile[]> {
    const conditions: SQL[] = [];
    if (tenantId !== undefined) conditions.push(eq(roles.tenantId, tenantId));
    const rows = conditions.length
      ? await this.db
          .select()
          .from(roles)
          .where(and(...conditions))
          .orderBy(asc(roles.createdAt))
      : await this.db.select().from(roles).orderBy(asc(roles.createdAt));
    return rows.map(rowToRole);
  }

  async all(tenantId?: string): Promise<RoleProfile[]> {
    return this.list(tenantId);
  }

  async update(role: RoleProfile): Promise<void> {
    const conditions: SQL[] = [eq(roles.id, role.id)];
    if (role.tenantId !== undefined) {
      conditions.push(eq(roles.tenantId, role.tenantId));
    }
    const updated = await this.db
      .update(roles)
      .set(roleToRow(role))
      .where(and(...conditions))
      .returning({ id: roles.id });
    if (updated.length === 0) {
      throw new Error(`role "${role.id}" not found`);
    }
  }
}

export class PgCandidateStore implements CandidateStore {
  constructor(private readonly db: HrDatabase) {}

  async create(candidate: Candidate): Promise<void> {
    await this.db.insert(candidates).values(candidateToRow(candidate));
  }

  async get(id: string, tenantId?: string): Promise<Candidate | null> {
    const conditions: SQL[] = [eq(candidates.id, id)];
    if (tenantId !== undefined)
      conditions.push(eq(candidates.tenantId, tenantId));
    const [row] = await this.db
      .select()
      .from(candidates)
      .where(and(...conditions))
      .limit(1);
    return row ? rowToCandidate(row) : null;
  }

  async list(tenantId?: string): Promise<Candidate[]> {
    const conditions: SQL[] = [];
    if (tenantId !== undefined)
      conditions.push(eq(candidates.tenantId, tenantId));
    const rows = conditions.length
      ? await this.db
          .select()
          .from(candidates)
          .where(and(...conditions))
          .orderBy(asc(candidates.createdAt))
      : await this.db
          .select()
          .from(candidates)
          .orderBy(asc(candidates.createdAt));
    return rows.map(rowToCandidate);
  }

  async all(tenantId?: string): Promise<Candidate[]> {
    return this.list(tenantId);
  }

  async update(candidate: Candidate): Promise<void> {
    const updated = await this.db
      .update(candidates)
      .set(candidateToRow(candidate))
      .where(eq(candidates.id, candidate.id))
      .returning({ id: candidates.id });
    if (updated.length === 0) {
      throw new Error(`candidate "${candidate.id}" not found`);
    }
  }

  async remove(id: string, tenantId?: string): Promise<void> {
    const conditions: SQL[] = [eq(candidates.id, id)];
    if (tenantId !== undefined)
      conditions.push(eq(candidates.tenantId, tenantId));
    await this.db.delete(candidates).where(and(...conditions));
  }
}

export class PgAuditStore implements AuditStore {
  constructor(private readonly db: HrDatabase) {}

  async append(event: AuditEvent): Promise<void> {
    await this.db.insert(auditEvents).values(auditEventToRow(event));
  }

  async list(tenantId?: string): Promise<AuditEvent[]> {
    const conditions: SQL[] = [];
    if (tenantId !== undefined)
      conditions.push(eq(auditEvents.tenantId, tenantId));
    const rows = conditions.length
      ? await this.db
          .select()
          .from(auditEvents)
          .where(and(...conditions))
          .orderBy(asc(auditEvents.at))
      : await this.db.select().from(auditEvents).orderBy(asc(auditEvents.at));
    return rows.map(rowToAuditEvent);
  }

  async anonymizeBefore(
    cutoff: string,
    keepCandidateIds?: readonly string[],
    tenantId?: string,
  ): Promise<number> {
    const conditions: SQL[] = [lt(auditEvents.at, cutoff)];
    if (tenantId !== undefined)
      conditions.push(eq(auditEvents.tenantId, tenantId));
    if (keepCandidateIds && keepCandidateIds.length > 0) {
      const orExpr = or(
        isNull(auditEvents.candidateId),
        ...keepCandidateIds.map((id) => ne(auditEvents.candidateId, id)),
      );
      if (orExpr) {
        conditions.push(orExpr);
      }
    }
    const rows = await this.db
      .update(auditEvents)
      .set({
        candidateId: null,
        detail: { anonymized: true },
      })
      .where(and(...conditions))
      .returning({ id: auditEvents.id });
    return rows.length;
  }
}

export class PgOutboxStore implements ClaimableOutboxStore {
  constructor(private readonly db: HrDatabase) {}

  async enqueue(event: OutboxEvent): Promise<void> {
    await this.db.insert(outboxEvents).values(outboxEventToRow(event));
  }

  async pending(tenantId?: string): Promise<OutboxEvent[]> {
    const conditions: SQL[] = [isNull(outboxEvents.dispatchedAt)];
    if (tenantId !== undefined)
      conditions.push(eq(outboxEvents.tenantId, tenantId));
    const rows = await this.db
      .select()
      .from(outboxEvents)
      .where(and(...conditions))
      .orderBy(asc(outboxEvents.at));
    return rows.map(rowToOutboxEvent);
  }

  async markDispatched(id: string, tenantId?: string): Promise<void> {
    const conditions: SQL[] = [eq(outboxEvents.id, id)];
    if (tenantId !== undefined)
      conditions.push(eq(outboxEvents.tenantId, tenantId));
    await this.db
      .update(outboxEvents)
      .set({ dispatchedAt: new Date().toISOString(), claimedUntil: null })
      .where(and(...conditions));
  }

  async claimForDispatch(id: string, leaseUntil: string): Promise<boolean> {
    const claimed = await this.db
      .update(outboxEvents)
      .set({ claimedUntil: leaseUntil })
      .where(
        and(
          eq(outboxEvents.id, id),
          isNull(outboxEvents.dispatchedAt),
          or(
            isNull(outboxEvents.claimedUntil),
            lt(outboxEvents.claimedUntil, leaseUntil),
          ),
        ),
      )
      .returning({ id: outboxEvents.id });
    return claimed.length > 0;
  }

  async releaseClaim(id: string): Promise<void> {
    await this.db
      .update(outboxEvents)
      .set({ claimedUntil: null })
      .where(eq(outboxEvents.id, id));
  }

  async expireBefore(cutoff: string, tenantId?: string): Promise<number> {
    const conditions: SQL[] = [lt(outboxEvents.at, cutoff)];
    if (tenantId !== undefined)
      conditions.push(eq(outboxEvents.tenantId, tenantId));
    const rows = await this.db
      .delete(outboxEvents)
      .where(and(...conditions))
      .returning({ id: outboxEvents.id });
    return rows.length;
  }
}

export function createPgStore(db: HrDatabase): Store {
  return {
    tenants: new PgTenantStore(db),
    candidates: new PgCandidateStore(db),
    roles: new PgRoleStore(db),
    audit: new PgAuditStore(db),
    outbox: new PgOutboxStore(db),
    scorecards: new PgScorecardStore(db),
    userAccess: new PgUserAccessStore(db),
    policies: new PgPolicyStore(db),
  };
}

function rowToTenant(row: typeof tenants.$inferSelect): Tenant {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    ...(row.settings ? { settings: row.settings } : {}),
  };
}

function policyToRow(policy: Policy): typeof policies.$inferInsert {
  return {
    id: policy.id,
    tenantId: policy.tenantId,
    title: policy.title,
    category: policy.category,
    content: policy.content,
    version: policy.version,
    active: policy.active,
    createdAt: policy.createdAt,
    updatedAt: policy.updatedAt,
  };
}

function rowToPolicy(row: typeof policies.$inferSelect): Policy {
  return {
    id: row.id,
    tenantId: row.tenantId,
    title: row.title,
    category: row.category as PolicyCategory,
    content: row.content,
    version: row.version,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface PostgresStoreHandle {
  store: Store;
  close: () => Promise<void>;
}

export function createPostgresStore(url: string): PostgresStoreHandle {
  const pool = new pg.Pool({ connectionString: url });
  const db = drizzle(pool) as HrDatabase;
  return {
    store: createPgStore(db),
    close: async () => {
      await pool.end();
    },
  };
}

interface RoleRow {
  id: string;
  title: string;
  requirements: string[];
  niceToHave: string[];
  createdAt: string;
  tenantId: string | null;
  skills: string[] | null;
  experienceMinYears: number | null;
  experienceMaxYears: number | null;
  budgetMin: string | null;
  budgetMax: string | null;
  budgetCurrency: string | null;
  updatedAt: string | null;
}

interface CandidateRow {
  id: string;
  roleId: string;
  name: string;
  email: string;
  resumeText: string;
  status: string;
  screening: ScreeningResult | null;
  review: ReviewDecision | null;
  aiNoticeDisclosedAt: string | null;
  dispute: DisputeRecord | null;
  enrichment: CandidateEnrichment | null;
  createdAt: string;
  updatedAt: string;
  tenantId: string | null;
}

interface AuditEventRow {
  id: string;
  candidateId: string | null;
  action: string;
  detail: unknown;
  at: string;
  tenantId: string | null;
}

interface OutboxEventRow {
  id: string;
  type: string;
  candidateId: string;
  payload: unknown;
  at: string;
  dispatchedAt: string | null;
  claimedUntil: string | null;
  tenantId: string | null;
}

function roleToRow(role: RoleProfile): RoleRow {
  return {
    id: role.id,
    title: role.title,
    requirements: role.requirements,
    niceToHave: role.niceToHave,
    createdAt: role.createdAt,
    tenantId: role.tenantId ?? null,
    skills: role.skills ?? null,
    experienceMinYears: role.experienceMinYears ?? null,
    experienceMaxYears: role.experienceMaxYears ?? null,
    budgetMin: role.budgetMin === undefined ? null : String(role.budgetMin),
    budgetMax: role.budgetMax === undefined ? null : String(role.budgetMax),
    budgetCurrency: role.budgetCurrency ?? null,
    updatedAt: role.updatedAt ?? null,
  };
}

function rowToRole(row: RoleRow): RoleProfile {
  const budgetMin = toOptionalNumber(row.budgetMin);
  const budgetMax = toOptionalNumber(row.budgetMax);
  return {
    id: row.id,
    title: row.title,
    requirements: row.requirements,
    niceToHave: row.niceToHave,
    createdAt: row.createdAt,
    ...(row.tenantId ? { tenantId: row.tenantId } : {}),
    ...(row.skills ? { skills: row.skills } : {}),
    ...(row.experienceMinYears !== null
      ? { experienceMinYears: row.experienceMinYears }
      : {}),
    ...(row.experienceMaxYears !== null
      ? { experienceMaxYears: row.experienceMaxYears }
      : {}),
    ...(budgetMin !== undefined ? { budgetMin } : {}),
    ...(budgetMax !== undefined ? { budgetMax } : {}),
    ...(row.budgetCurrency ? { budgetCurrency: row.budgetCurrency } : {}),
    ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
  };
}

function toOptionalNumber(value: string | null): number | undefined {
  if (value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function candidateToRow(candidate: Candidate): CandidateRow {
  return {
    id: candidate.id,
    roleId: candidate.roleId,
    name: candidate.name,
    email: candidate.email,
    resumeText: candidate.resumeText,
    status: candidate.status,
    screening: candidate.screening,
    review: candidate.review,
    aiNoticeDisclosedAt: candidate.aiNoticeDisclosedAt,
    dispute: candidate.dispute,
    enrichment: candidate.enrichment,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    tenantId: candidate.tenantId ?? null,
  };
}

function rowToCandidate(row: CandidateRow): Candidate {
  return {
    id: row.id,
    roleId: row.roleId,
    name: row.name,
    email: row.email,
    resumeText: row.resumeText,
    status: row.status as CandidateStatus,
    screening: row.screening,
    review: row.review,
    aiNoticeDisclosedAt: row.aiNoticeDisclosedAt,
    dispute: row.dispute,
    enrichment: row.enrichment,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.tenantId ? { tenantId: row.tenantId } : {}),
  };
}

function auditEventToRow(event: AuditEvent): AuditEventRow {
  return {
    ...event,
    tenantId: event.tenantId ?? null,
  };
}

function rowToAuditEvent(row: AuditEventRow): AuditEvent {
  const { tenantId: _tid, ...rest } = row;
  return {
    ...rest,
    ...(row.tenantId ? { tenantId: row.tenantId } : {}),
  };
}

function outboxEventToRow(event: OutboxEvent): OutboxEventRow {
  return {
    id: event.id,
    type: event.type,
    candidateId: event.candidateId,
    payload: event.payload,
    at: event.at,
    dispatchedAt: event.dispatchedAt,
    claimedUntil: null,
    tenantId: event.tenantId ?? null,
  };
}

function rowToOutboxEvent(row: OutboxEventRow): OutboxEvent {
  return {
    id: row.id,
    type: row.type,
    candidateId: row.candidateId,
    payload: row.payload,
    at: row.at,
    dispatchedAt: row.dispatchedAt,
    ...(row.tenantId ? { tenantId: row.tenantId } : {}),
  };
}

export class PgScorecardStore implements ScorecardStore {
  constructor(private readonly db: HrDatabase) {}

  async put(scorecard: Scorecard): Promise<void> {
    await this.db.insert(scorecards).values(scorecardToRow(scorecard));
  }

  async get(id: string, tenantId?: string): Promise<Scorecard | null> {
    const conditions: SQL[] = [eq(scorecards.id, id)];
    if (tenantId !== undefined)
      conditions.push(eq(scorecards.tenantId, tenantId));
    const [row] = await this.db
      .select()
      .from(scorecards)
      .where(and(...conditions))
      .limit(1);
    return row ? rowToScorecard(row) : null;
  }

  async all(tenantId?: string): Promise<Scorecard[]> {
    const conditions: SQL[] = [];
    if (tenantId !== undefined)
      conditions.push(eq(scorecards.tenantId, tenantId));
    const rows = conditions.length
      ? await this.db
          .select()
          .from(scorecards)
          .where(and(...conditions))
          .orderBy(asc(scorecards.createdAt))
      : await this.db
          .select()
          .from(scorecards)
          .orderBy(asc(scorecards.createdAt));
    return rows.map(rowToScorecard);
  }
}

function scorecardToRow(scorecard: Scorecard): ScorecardRow {
  return {
    id: scorecard.id,
    candidateId: scorecard.candidateId,
    reviewerId: scorecard.reviewerId,
    reviewerName: scorecard.reviewerName,
    answers: scorecard.answers,
    overallScore: String(scorecard.overallScore),
    createdAt: scorecard.createdAt,
    updatedAt: scorecard.updatedAt,
    tenantId: scorecard.tenantId ?? null,
  };
}

function rowToScorecard(row: ScorecardRow): Scorecard {
  return {
    id: row.id,
    candidateId: row.candidateId,
    reviewerId: row.reviewerId,
    reviewerName: row.reviewerName,
    answers: row.answers,
    overallScore: Number(row.overallScore),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.tenantId ? { tenantId: row.tenantId } : {}),
  };
}
