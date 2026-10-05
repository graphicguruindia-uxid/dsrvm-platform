import { randomUUID } from "node:crypto";
import type { AiServiceKind, CmsKind, Tenant } from "./types.js";

export interface TenantRegistry {
  create(input: {
    name: string;
    hosts?: string[];
    plan?: string;
    preferredCMS?: CmsKind;
    preferredAIService?: AiServiceKind;
  }): Promise<Tenant>;
  get(tenantId: string): Promise<Tenant | null>;
  list(): Promise<Tenant[]>;
  resolveFromHost(host: string): Promise<Tenant | null>;
  setHosts(tenantId: string, hosts: string[]): Promise<Tenant>;
  setPreferences(
    tenantId: string,
    input: { preferredCMS?: CmsKind; preferredAIService?: AiServiceKind },
  ): Promise<Tenant>;
  remove(tenantId: string): Promise<void>;
}

export interface TenantStore {
  saveTenant(tenant: Tenant): Promise<void>;
  getTenant(tenantId: string): Promise<Tenant | null>;
  listTenants(): Promise<Tenant[]>;
  resolveHost(host: string): Promise<Tenant | null>;
  deleteTenant(tenantId: string): Promise<void>;
}

export function createTenantRegistry(store: TenantStore): TenantRegistry {
  return {
    async create(input) {
      const existing = await store.resolveHost(input.hosts?.[0] ?? "");
      if (input.hosts?.length && existing) {
        throw new Error(`host "${input.hosts[0]}" already assigned`);
      }
      const tenant: Tenant = {
        id: randomUUID(),
        name: input.name,
        hosts: input.hosts ?? [],
        plan: input.plan ?? "starter",
        preferredCMS: input.preferredCMS ?? "none",
        preferredAIService: input.preferredAIService ?? "none",
        createdAt: new Date().toISOString(),
      };
      await store.saveTenant(tenant);
      return tenant;
    },
    async get(tenantId) {
      return store.getTenant(tenantId);
    },
    async list() {
      return store.listTenants();
    },
    async resolveFromHost(host) {
      const normalized = normalizeHost(host);
      if (!normalized) return null;
      return store.resolveHost(normalized);
    },
    async setHosts(tenantId, hosts) {
      const tenant = await store.getTenant(tenantId);
      if (!tenant) {
        throw new Error(`tenant "${tenantId}" not found`);
      }
      for (const host of hosts) {
        const owner = await store.resolveHost(normalizeHost(host) ?? "");
        if (owner && owner.id !== tenantId) {
          throw new Error(`host "${host}" already assigned`);
        }
      }
      const updated: Tenant = { ...tenant, hosts };
      await store.saveTenant(updated);
      return updated;
    },
    async setPreferences(tenantId, input) {
      const tenant = await store.getTenant(tenantId);
      if (!tenant) {
        throw new Error(`tenant "${tenantId}" not found`);
      }
      const updated: Tenant = {
        ...tenant,
        preferredCMS: input.preferredCMS ?? tenant.preferredCMS,
        preferredAIService:
          input.preferredAIService ?? tenant.preferredAIService,
      };
      await store.saveTenant(updated);
      return updated;
    },
    async remove(tenantId) {
      const tenant = await store.getTenant(tenantId);
      if (!tenant) {
        throw new Error(`tenant "${tenantId}" not found`);
      }
      await store.deleteTenant(tenantId);
    },
  };
}

export function normalizeHost(host: string): string | null {
  const cleaned = host.trim().toLowerCase().replace(/:\d+$/, "");
  return cleaned.length > 0 ? cleaned : null;
}
