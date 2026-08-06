import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import type {
  ContentItem,
  ContentStatus,
  Session,
  Tenant,
  UsageRecord,
  User,
  UserRole,
  WebAppSnapshot,
} from "../types.js";
import type { WebStore } from "../store.js";
import {
  contentItems,
  sessions,
  tenants,
  usageRecords,
  users,
} from "./schema.js";

export type WebDatabase = NodePgDatabase;

export class PgWebStore implements WebStore {
  constructor(private readonly db: WebDatabase) {}

  async saveTenant(tenant: Tenant): Promise<void> {
    await this.db
      .insert(tenants)
      .values(tenantToRow(tenant))
      .onConflictDoUpdate({
        target: tenants.id,
        set: tenantToRow(tenant),
      });
  }

  async getTenant(tenantId: string): Promise<Tenant | null> {
    const [row] = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    return row ? rowToTenant(row) : null;
  }

  async listTenants(): Promise<Tenant[]> {
    const rows = await this.db
      .select()
      .from(tenants)
      .orderBy(asc(tenants.createdAt));
    return rows.map(rowToTenant);
  }

  async resolveHost(host: string): Promise<Tenant | null> {
    const [row] = await this.db
      .select()
      .from(tenants)
      .where(sql`${tenants.hosts} @> ${JSON.stringify([host])}::jsonb`)
      .limit(1);
    return row ? rowToTenant(row) : null;
  }

  async saveUser(user: User): Promise<void> {
    await this.db
      .insert(users)
      .values(userToRow(user))
      .onConflictDoUpdate({
        target: users.id,
        set: userToRow(user),
      });
  }

  async getUser(userId: string): Promise<User | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row ? rowToUser(row) : null;
  }

  async getUsersByTenant(tenantId: string): Promise<User[]> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.tenantId, tenantId))
      .orderBy(asc(users.createdAt));
    return rows.map(rowToUser);
  }

  async getUserByEmail(tenantId: string, email: string): Promise<User | null> {
    const normalized = email.trim().toLowerCase();
    const [row] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.email, normalized)))
      .limit(1);
    return row ? rowToUser(row) : null;
  }

  async saveSession(session: Session): Promise<void> {
    await this.db.insert(sessions).values(sessionToRow(session));
  }

  async getSession(token: string): Promise<Session | null> {
    const [row] = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.token, token))
      .limit(1);
    return row ? rowToSession(row) : null;
  }

  async deleteSession(token: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.token, token));
  }

  async listSessions(): Promise<Session[]> {
    const rows = await this.db
      .select()
      .from(sessions)
      .orderBy(asc(sessions.createdAt));
    return rows.map(rowToSession);
  }

  async saveContent(item: ContentItem): Promise<void> {
    await this.db
      .insert(contentItems)
      .values(contentToRow(item))
      .onConflictDoUpdate({
        target: contentItems.id,
        set: contentToRow(item),
      });
  }

  async getContent(id: string): Promise<ContentItem | null> {
    const [row] = await this.db
      .select()
      .from(contentItems)
      .where(eq(contentItems.id, id))
      .limit(1);
    return row ? rowToContent(row) : null;
  }

  async getContentBySlug(
    tenantId: string,
    slug: string,
  ): Promise<ContentItem | null> {
    const [row] = await this.db
      .select()
      .from(contentItems)
      .where(
        and(eq(contentItems.tenantId, tenantId), eq(contentItems.slug, slug)),
      )
      .limit(1);
    return row ? rowToContent(row) : null;
  }

  async listContentByTenant(tenantId: string): Promise<ContentItem[]> {
    const rows = await this.db
      .select()
      .from(contentItems)
      .where(eq(contentItems.tenantId, tenantId))
      .orderBy(asc(contentItems.slug));
    return rows.map(rowToContent);
  }

  async listContent(): Promise<ContentItem[]> {
    const rows = await this.db
      .select()
      .from(contentItems)
      .orderBy(asc(contentItems.createdAt));
    return rows.map(rowToContent);
  }

  async addUsage(record: UsageRecord): Promise<void> {
    await this.db.insert(usageRecords).values({
      id: randomUUID(),
      tenantId: record.tenantId,
      task: record.task,
      model: record.model,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      estCostUsd: record.estCostUsd,
      at: record.at,
    });
  }

  async listUsage(tenantId?: string): Promise<UsageRecord[]> {
    const query = this.db
      .select()
      .from(usageRecords)
      .orderBy(asc(usageRecords.at));
    const rows = tenantId
      ? await query.where(eq(usageRecords.tenantId, tenantId))
      : await query;
    return rows.map(rowToUsage);
  }

  async snapshot(): Promise<WebAppSnapshot> {
    const [ts, us, ss, cs, rs] = await Promise.all([
      this.db.select().from(tenants),
      this.db.select().from(users),
      this.db.select().from(sessions),
      this.db.select().from(contentItems),
      this.db.select().from(usageRecords),
    ]);
    return {
      tenants: ts.map(rowToTenant),
      users: us.map(rowToUser),
      sessions: ss.map(rowToSession),
      content: cs.map(rowToContent),
      usage: rs.map(rowToUsage),
    };
  }
}

export function createPgWebStore(db: WebDatabase): WebStore {
  return new PgWebStore(db);
}

export interface PostgresWebStoreHandle {
  store: WebStore;
  close: () => Promise<void>;
}

export function createPostgresWebStore(url: string): PostgresWebStoreHandle {
  const pool = new pg.Pool({ connectionString: url });
  const db = drizzle(pool) as WebDatabase;
  return {
    store: createPgWebStore(db),
    close: async () => {
      await pool.end();
    },
  };
}

interface TenantRow {
  id: string;
  name: string;
  hosts: string[];
  plan: string;
  createdAt: string;
}

interface UserRow {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

interface SessionRow {
  token: string;
  userId: string;
  tenantId: string;
  role: UserRole;
  expiresAt: string;
  createdAt: string;
}

interface ContentItemRow {
  id: string;
  tenantId: string;
  slug: string;
  title: string;
  body: string;
  status: ContentStatus;
  publishedAt: string | null;
  updatedBy: string;
  updatedAt: string;
  createdAt: string;
}

interface UsageRecordRow {
  id: string;
  tenantId: string;
  task: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estCostUsd: number;
  at: string;
}

function tenantToRow(tenant: Tenant): TenantRow {
  return { ...tenant };
}

function rowToTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    name: row.name,
    hosts: row.hosts,
    plan: row.plan,
    createdAt: row.createdAt,
  };
}

function userToRow(user: User): UserRow {
  return {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    passwordHash: user.passwordHash,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
  };
}

function rowToUser(row: UserRow): User {
  return { ...row };
}

function sessionToRow(session: Session): SessionRow {
  return { ...session };
}

function rowToSession(row: SessionRow): Session {
  return { ...row };
}

function contentToRow(item: ContentItem): ContentItemRow {
  return { ...item };
}

function rowToContent(row: ContentItemRow): ContentItem {
  return { ...row };
}

function rowToUsage(row: UsageRecordRow): UsageRecord {
  return {
    tenantId: row.tenantId,
    task: row.task,
    model: row.model,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    estCostUsd: row.estCostUsd,
    at: row.at,
  };
}
