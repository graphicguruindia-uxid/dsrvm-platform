import { PERMISSIONS, requirePermission } from "./rbac.js";
import type { User } from "./types.js";
import type { WebStore } from "./store.js";

export interface TenantOverview {
  tenantId: string;
  name: string;
  plan: string;
  hosts: string[];
  users: number;
  publishedItems: number;
  monthUsageUsd: number;
}

export interface AdminOverview {
  generatedAt: string;
  tenants: number;
  users: number;
  sessions: number;
  contentItems: number;
  usageRecords: number;
  monthUsageUsd: number;
  perTenant: TenantOverview[];
}

export interface AdminService {
  overview(actor: User): Promise<AdminOverview>;
  tenantOverview(actor: User, tenantId: string): Promise<TenantOverview>;
}

export function createAdminService(
  store: WebStore,
  billing: { usage(tenantId?: string): Promise<UsageLike[]> },
  now: () => Date = () => new Date(),
): AdminService {
  const monthPrefix = () => now().toISOString().slice(0, 7);
  const monthTotal = async (tenantId: string) => {
    const usage = await billing.usage(tenantId);
    return usage
      .filter((u) => u.at.startsWith(monthPrefix()))
      .reduce((sum, u) => sum + u.estCostUsd, 0);
  };

  const tenantOverview = async (tenantId: string): Promise<TenantOverview> => {
    const tenant = await store.getTenant(tenantId);
    if (!tenant) {
      throw new Error(`tenant "${tenantId}" not found`);
    }
    const [users, items] = await Promise.all([
      store.getUsersByTenant(tenantId),
      store.listContentByTenant(tenantId),
    ]);
    return {
      tenantId,
      name: tenant.name,
      plan: tenant.plan,
      hosts: tenant.hosts,
      users: users.length,
      publishedItems: items.filter((c) => c.status === "published").length,
      monthUsageUsd: await monthTotal(tenantId),
    };
  };

  return {
    async overview(actor) {
      requirePermission(actor, PERMISSIONS.consoleAccess);
      const [tenants, snapshot, sessions, contentItems, usageRecords] =
        await Promise.all([
          store.listTenants(),
          store.snapshot(),
          store.listSessions(),
          store.listContent(),
          store.listUsage(),
        ]);
      const perTenant: TenantOverview[] = [];
      for (const t of tenants) {
        perTenant.push(await tenantOverview(t.id));
      }
      return {
        generatedAt: now().toISOString(),
        tenants: tenants.length,
        users: snapshot.users.length,
        sessions: sessions.length,
        contentItems: contentItems.length,
        usageRecords: usageRecords.length,
        monthUsageUsd: perTenant.reduce((sum, t) => sum + t.monthUsageUsd, 0),
        perTenant,
      };
    },
    async tenantOverview(actor, tenantId) {
      requirePermission(actor, PERMISSIONS.consoleAccess);
      return tenantOverview(tenantId);
    },
  };
}

interface UsageLike {
  estCostUsd: number;
  at: string;
}
