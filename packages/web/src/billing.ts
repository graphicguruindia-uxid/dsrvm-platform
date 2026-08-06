import { estimateCostUsd } from "@dsrvm/telemetry";
import type {
  PlanInfo,
  PlanLimit,
  PlanName,
  Statement,
  Tenant,
  UsageRecord,
  UsageReport,
} from "./types.js";
import type { WebStore } from "./store.js";

export const PLAN_CATALOG: Record<PlanName, PlanInfo> = {
  starter: {
    priceUsd: 0,
    seats: 5,
    publishedItems: 20,
    monthlyAiBudgetUsd: 50,
  },
  growth: {
    priceUsd: 299,
    seats: 25,
    publishedItems: 200,
    monthlyAiBudgetUsd: 500,
  },
  enterprise: {
    priceUsd: 1499,
    seats: Infinity,
    publishedItems: Infinity,
    monthlyAiBudgetUsd: Infinity,
  },
};

export const PLAN_LIMITS: Record<PlanName, PlanLimit> = {
  starter: PLAN_CATALOG.starter,
  growth: PLAN_CATALOG.growth,
  enterprise: PLAN_CATALOG.enterprise,
};

export interface BillingHook {
  recordUsage(input: {
    tenantId: string;
    task: string;
    model: string;
    inputTokens?: number;
    outputTokens?: number;
    at?: string;
  }): Promise<UsageRecord>;
  usage(tenantId?: string): Promise<UsageRecord[]>;
  planLimits(tenantId: string): Promise<PlanLimit>;
  monthUsageUsd(tenantId: string): Promise<number>;
  remainingAiBudgetUsd(tenantId: string): Promise<number>;
  plans(): Array<PlanInfo & { plan: PlanName }>;
  setPlan(input: { tenantId: string; plan: PlanName }): Promise<Tenant>;
  usageReport(tenantId: string): Promise<UsageReport>;
  statement(tenantId: string): Promise<Statement>;
}

export function createBillingService(
  store: WebStore,
  now: () => Date = () => new Date(),
): BillingHook {
  const monthPrefix = () => now().toISOString().slice(0, 7);

  return {
    async recordUsage(input) {
      const tenant = await store.getTenant(input.tenantId);
      if (!tenant) {
        throw new Error(`tenant "${input.tenantId}" not found`);
      }
      const record: UsageRecord = {
        tenantId: input.tenantId,
        task: input.task,
        model: input.model,
        inputTokens: input.inputTokens ?? 0,
        outputTokens: input.outputTokens ?? 0,
        estCostUsd: estimateCostUsd(
          input.model,
          input.inputTokens ?? 0,
          input.outputTokens ?? 0,
        ),
        at: input.at ?? now().toISOString(),
      };
      await store.addUsage(record);
      return record;
    },
    async usage(tenantId) {
      return store.listUsage(tenantId);
    },
    async planLimits(tenantId) {
      const tenant = await store.getTenant(tenantId);
      if (!tenant) {
        throw new Error(`tenant "${tenantId}" not found`);
      }
      const name = tenant.plan as PlanName;
      return PLAN_LIMITS[name] ?? PLAN_LIMITS.starter;
    },
    async monthUsageUsd(tenantId) {
      const usage = await store.listUsage(tenantId);
      return usage
        .filter((u) => u.at.startsWith(monthPrefix()))
        .reduce((sum, u) => sum + u.estCostUsd, 0);
    },
    async remainingAiBudgetUsd(tenantId) {
      const limit = (await this.planLimits(tenantId)).monthlyAiBudgetUsd;
      if (!Number.isFinite(limit)) return Infinity;
      return Math.max(0, limit - (await this.monthUsageUsd(tenantId)));
    },
    plans() {
      return Object.entries(PLAN_CATALOG).map(([plan, info]) => ({
        plan: plan as PlanName,
        ...info,
      }));
    },
    async setPlan({ tenantId, plan }) {
      const tenant = await store.getTenant(tenantId);
      if (!tenant) {
        throw new Error(`tenant "${tenantId}" not found`);
      }
      if (!(plan in PLAN_CATALOG)) {
        throw new Error(`unknown plan "${plan}"`);
      }
      const updated: Tenant = { ...tenant, plan };
      await store.saveTenant(updated);
      return updated;
    },
    async usageReport(tenantId) {
      const usage = (await store.listUsage(tenantId)).filter((u) =>
        u.at.startsWith(monthPrefix()),
      );
      const byTask = new Map<string, number>();
      const byModel = new Map<string, { count: number; estCostUsd: number }>();
      let totalUsd = 0;
      for (const record of usage) {
        totalUsd += record.estCostUsd;
        byTask.set(record.task, (byTask.get(record.task) ?? 0) + 1);
        const model = byModel.get(record.model) ?? { count: 0, estCostUsd: 0 };
        byModel.set(record.model, {
          count: model.count + 1,
          estCostUsd: model.estCostUsd + record.estCostUsd,
        });
      }
      return {
        tenantId,
        period: monthPrefix(),
        totalUsd,
        totalRecords: usage.length,
        byTask: [...byTask.entries()].map(([task, count]) => ({
          task,
          count,
          estCostUsd: usage
            .filter((u) => u.task === task)
            .reduce((sum, u) => sum + u.estCostUsd, 0),
        })),
        byModel: [...byModel.entries()].map(([model, value]) => ({
          model,
          ...value,
        })),
      };
    },
    async statement(tenantId) {
      const tenant = await store.getTenant(tenantId);
      if (!tenant) {
        throw new Error(`tenant "${tenantId}" not found`);
      }
      const plan =
        (tenant.plan as PlanName) in PLAN_CATALOG
          ? (tenant.plan as PlanName)
          : "starter";
      const usageCostUsd = await this.monthUsageUsd(tenantId);
      const planFeeUsd = PLAN_CATALOG[plan].priceUsd;
      return {
        tenantId,
        period: monthPrefix(),
        plan,
        planFeeUsd,
        usageCostUsd,
        totalUsd: planFeeUsd + usageCostUsd,
        remainingAiBudgetUsd: await this.remainingAiBudgetUsd(tenantId),
        generatedAt: now().toISOString(),
      };
    },
  };
}
