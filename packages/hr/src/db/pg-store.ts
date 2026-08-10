import { and, asc, eq, isNull, lt, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import type {
  AuditEvent,
  Candidate,
  CandidateStatus,
  OutboxEvent,
  RoleProfile,
  ScreeningResult,
  ReviewDecision,
} from "../types.js";
import type {
  AuditStore,
  CandidateStore,
  ClaimableOutboxStore,
  RoleStore,
  Store,
} from "../store.js";
import { auditEvents, candidates, outboxEvents, roles } from "./schema.js";

export type HrDatabase = NodePgDatabase;

export class PgRoleStore implements RoleStore {
  constructor(private readonly db: HrDatabase) {}

  async create(role: RoleProfile): Promise<void> {
    await this.db.insert(roles).values(roleToRow(role));
  }

  async get(id: string): Promise<RoleProfile | null> {
    const [row] = await this.db
      .select()
      .from(roles)
      .where(eq(roles.id, id))
      .limit(1);
    return row ? rowToRole(row) : null;
  }

  async list(): Promise<RoleProfile[]> {
    const rows = await this.db
      .select()
      .from(roles)
      .orderBy(asc(roles.createdAt));
    return rows.map(rowToRole);
  }
}

export class PgCandidateStore implements CandidateStore {
  constructor(private readonly db: HrDatabase) {}

  async create(candidate: Candidate): Promise<void> {
    await this.db.insert(candidates).values(candidateToRow(candidate));
  }

  async get(id: string): Promise<Candidate | null> {
    const [row] = await this.db
      .select()
      .from(candidates)
      .where(eq(candidates.id, id))
      .limit(1);
    return row ? rowToCandidate(row) : null;
  }

  async list(): Promise<Candidate[]> {
    const rows = await this.db
      .select()
      .from(candidates)
      .orderBy(asc(candidates.createdAt));
    return rows.map(rowToCandidate);
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

  async remove(id: string): Promise<void> {
    await this.db.delete(candidates).where(eq(candidates.id, id));
  }
}

export class PgAuditStore implements AuditStore {
  constructor(private readonly db: HrDatabase) {}

  async append(event: AuditEvent): Promise<void> {
    await this.db.insert(auditEvents).values(auditEventToRow(event));
  }

  async list(): Promise<AuditEvent[]> {
    const rows = await this.db
      .select()
      .from(auditEvents)
      .orderBy(asc(auditEvents.at));
    return rows.map(rowToAuditEvent);
  }

  async anonymizeBefore(cutoff: string): Promise<number> {
    const rows = await this.db
      .update(auditEvents)
      .set({
        candidateId: null,
        detail: { anonymized: true },
      })
      .where(lt(auditEvents.at, cutoff))
      .returning({ id: auditEvents.id });
    return rows.length;
  }
}

export class PgOutboxStore implements ClaimableOutboxStore {
  constructor(private readonly db: HrDatabase) {}

  async enqueue(event: OutboxEvent): Promise<void> {
    await this.db.insert(outboxEvents).values(outboxEventToRow(event));
  }

  async pending(): Promise<OutboxEvent[]> {
    const rows = await this.db
      .select()
      .from(outboxEvents)
      .where(isNull(outboxEvents.dispatchedAt))
      .orderBy(asc(outboxEvents.at));
    return rows.map(rowToOutboxEvent);
  }

  async markDispatched(id: string): Promise<void> {
    await this.db
      .update(outboxEvents)
      .set({ dispatchedAt: new Date().toISOString(), claimedUntil: null })
      .where(eq(outboxEvents.id, id));
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

  async expireBefore(cutoff: string): Promise<number> {
    const rows = await this.db
      .delete(outboxEvents)
      .where(lt(outboxEvents.at, cutoff))
      .returning({ id: outboxEvents.id });
    return rows.length;
  }
}

export function createPgStore(db: HrDatabase): Store {
  return {
    candidates: new PgCandidateStore(db),
    roles: new PgRoleStore(db),
    audit: new PgAuditStore(db),
    outbox: new PgOutboxStore(db),
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
  createdAt: string;
  updatedAt: string;
}

interface AuditEventRow {
  id: string;
  candidateId: string | null;
  action: string;
  detail: unknown;
  at: string;
}

interface OutboxEventRow {
  id: string;
  type: string;
  candidateId: string;
  payload: unknown;
  at: string;
  dispatchedAt: string | null;
  claimedUntil: string | null;
}

function roleToRow(role: RoleProfile): RoleRow {
  return { ...role };
}

function rowToRole(row: RoleRow): RoleProfile {
  return {
    id: row.id,
    title: row.title,
    requirements: row.requirements,
    niceToHave: row.niceToHave,
    createdAt: row.createdAt,
  };
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
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function auditEventToRow(event: AuditEvent): AuditEventRow {
  return { ...event };
}

function rowToAuditEvent(row: AuditEventRow): AuditEvent {
  return { ...row };
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
  };
}
