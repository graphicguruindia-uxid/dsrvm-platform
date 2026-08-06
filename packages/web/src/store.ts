import type {
  ContentItem,
  Session,
  Tenant,
  UsageRecord,
  User,
  WebAppSnapshot,
} from "./types.js";
import type { TenantStore } from "./tenant.js";

export interface WebStore extends TenantStore {
  saveUser(user: User): Promise<void>;
  getUser(userId: string): Promise<User | null>;
  getUsersByTenant(tenantId: string): Promise<User[]>;
  getUserByEmail(tenantId: string, email: string): Promise<User | null>;
  saveSession(session: Session): Promise<void>;
  getSession(token: string): Promise<Session | null>;
  deleteSession(token: string): Promise<void>;
  listSessions(): Promise<Session[]>;
  saveContent(item: ContentItem): Promise<void>;
  getContent(id: string): Promise<ContentItem | null>;
  getContentBySlug(tenantId: string, slug: string): Promise<ContentItem | null>;
  listContentByTenant(tenantId: string): Promise<ContentItem[]>;
  listContent(): Promise<ContentItem[]>;
  addUsage(record: UsageRecord): Promise<void>;
  listUsage(tenantId?: string): Promise<UsageRecord[]>;
  snapshot(): Promise<WebAppSnapshot>;
}

export function createWebStore(now: () => Date = () => new Date()): WebStore {
  const tenants = new Map<string, Tenant>();
  const hostIndex = new Map<string, string>();
  const users = new Map<string, User>();
  const sessions = new Map<string, Session>();
  const content = new Map<string, ContentItem>();
  const usage: UsageRecord[] = [];

  return {
    async saveTenant(tenant) {
      for (const old of tenants.get(tenant.id)?.hosts ?? []) {
        if (hostIndex.get(old) === tenant.id) hostIndex.delete(old);
      }
      tenants.set(tenant.id, tenant);
      for (const host of tenant.hosts) {
        hostIndex.set(host, tenant.id);
      }
    },
    async getTenant(tenantId) {
      return tenants.get(tenantId) ?? null;
    },
    async listTenants() {
      return [...tenants.values()];
    },
    async resolveHost(host) {
      const tenantId = hostIndex.get(host);
      return tenantId ? (tenants.get(tenantId) ?? null) : null;
    },

    async saveUser(user) {
      users.set(user.id, user);
    },
    async getUser(userId) {
      return users.get(userId) ?? null;
    },
    async getUsersByTenant(tenantId) {
      return [...users.values()].filter((u) => u.tenantId === tenantId);
    },
    async getUserByEmail(tenantId, email) {
      const normalized = email.trim().toLowerCase();
      return (
        [...users.values()].find(
          (u) =>
            u.tenantId === tenantId && u.email.toLowerCase() === normalized,
        ) ?? null
      );
    },

    async saveSession(session) {
      sessions.set(session.token, session);
    },
    async getSession(token) {
      return sessions.get(token) ?? null;
    },
    async deleteSession(token) {
      sessions.delete(token);
    },
    async listSessions() {
      return [...sessions.values()];
    },

    async saveContent(item) {
      content.set(item.id, item);
    },
    async getContent(id) {
      return content.get(id) ?? null;
    },
    async getContentBySlug(tenantId, slug) {
      return (
        [...content.values()].find(
          (c) => c.tenantId === tenantId && c.slug === slug,
        ) ?? null
      );
    },
    async listContentByTenant(tenantId) {
      return [...content.values()]
        .filter((c) => c.tenantId === tenantId)
        .sort((a, b) => a.slug.localeCompare(b.slug));
    },
    async listContent() {
      return [...content.values()];
    },

    async addUsage(record) {
      usage.push(record);
    },
    async listUsage(tenantId) {
      return tenantId
        ? usage.filter((u) => u.tenantId === tenantId)
        : [...usage];
    },

    async snapshot() {
      return {
        tenants: [...tenants.values()],
        users: [...users.values()],
        sessions: [...sessions.values()],
        content: [...content.values()],
        usage: [...usage],
      };
    },
  };
}
