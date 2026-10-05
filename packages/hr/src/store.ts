import type {
  AuditEvent,
  Candidate,
  CandidateStatus,
  OutboxEvent,
  Policy,
  RoleProfile,
  Scorecard,
  Tenant,
  TenantSettings,
  UserAccess,
} from "./types.js";

export interface TenantStore {
  create(tenant: Tenant): Promise<void>;
  get(id: string): Promise<Tenant | null>;
  list(): Promise<Tenant[]>;
  updateSettings(id: string, settings: TenantSettings): Promise<Tenant | null>;
}

export interface UserAccessStore {
  create(user: UserAccess): Promise<void>;
  get(id: string, tenantId: string): Promise<UserAccess | null>;
  list(tenantId: string): Promise<UserAccess[]>;
  update(user: UserAccess): Promise<void>;
  remove(id: string, tenantId: string): Promise<void>;
}

export interface PolicyStore {
  create(policy: Policy): Promise<void>;
  get(id: string, tenantId: string): Promise<Policy | null>;
  list(tenantId: string): Promise<Policy[]>;
  update(policy: Policy): Promise<void>;
  remove(id: string, tenantId: string): Promise<void>;
}

export interface CandidateStore {
  create(candidate: Candidate): Promise<void>;
  get(id: string, tenantId?: string): Promise<Candidate | null>;
  list(tenantId?: string): Promise<Candidate[]>;
  all(tenantId?: string): Promise<Candidate[]>;
  update(candidate: Candidate): Promise<void>;
  remove(id: string, tenantId?: string): Promise<void>;
}

export interface RoleStore {
  create(role: RoleProfile): Promise<void>;
  get(id: string, tenantId?: string): Promise<RoleProfile | null>;
  list(tenantId?: string): Promise<RoleProfile[]>;
  all(tenantId?: string): Promise<RoleProfile[]>;
  update(role: RoleProfile): Promise<void>;
}

export interface AuditStore {
  append(event: AuditEvent): Promise<void>;
  list(tenantId?: string): Promise<AuditEvent[]>;
  anonymizeBefore(
    cutoff: string,
    keepCandidateIds?: readonly string[],
    tenantId?: string,
  ): Promise<number>;
}

export interface OutboxStore {
  enqueue(event: OutboxEvent): Promise<void>;
  pending(tenantId?: string): Promise<OutboxEvent[]>;
  markDispatched(id: string, tenantId?: string): Promise<void>;
  expireBefore(cutoff: string, tenantId?: string): Promise<number>;
}

export interface ClaimableOutboxStore extends OutboxStore {
  claimForDispatch(id: string, leaseUntil: string): Promise<boolean>;
  releaseClaim(id: string): Promise<void>;
}

export interface ScorecardStore {
  put(scorecard: Scorecard): Promise<void>;
  get(id: string, tenantId?: string): Promise<Scorecard | null>;
  all(tenantId?: string): Promise<Scorecard[]>;
}

export interface Store {
  tenants: TenantStore;
  candidates: CandidateStore;
  roles: RoleStore;
  audit: AuditStore;
  outbox: ClaimableOutboxStore;
  scorecards: ScorecardStore;
  userAccess: UserAccessStore;
  policies: PolicyStore;
}

export class InMemoryTenantStore implements TenantStore {
  private readonly rows = new Map<string, Tenant>();

  async create(tenant: Tenant): Promise<void> {
    this.rows.set(tenant.id, tenant);
  }

  async get(id: string): Promise<Tenant | null> {
    return this.rows.get(id) ?? null;
  }

  async list(): Promise<Tenant[]> {
    return [...this.rows.values()];
  }

  async updateSettings(
    id: string,
    settings: TenantSettings,
  ): Promise<Tenant | null> {
    const row = this.rows.get(id);
    if (!row) return null;
    const updated: Tenant = { ...row, settings };
    this.rows.set(id, updated);
    return updated;
  }
}

export class InMemoryUserAccessStore implements UserAccessStore {
  private readonly rows = new Map<string, UserAccess>();

  async create(user: UserAccess): Promise<void> {
    this.rows.set(user.id, user);
  }

  async get(id: string, tenantId: string): Promise<UserAccess | null> {
    const row = this.rows.get(id) ?? null;
    if (!row) return null;
    if (row.tenantId !== tenantId) return null;
    return row;
  }

  async list(tenantId: string): Promise<UserAccess[]> {
    return [...this.rows.values()].filter((r) => r.tenantId === tenantId);
  }

  async update(user: UserAccess): Promise<void> {
    const row = this.rows.get(user.id);
    if (!row || row.tenantId !== user.tenantId) {
      throw new Error(`user access "${user.id}" not found`);
    }
    this.rows.set(user.id, user);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const row = this.rows.get(id);
    if (row && row.tenantId !== tenantId) return;
    this.rows.delete(id);
  }
}

export class InMemoryPolicyStore implements PolicyStore {
  private readonly rows = new Map<string, Policy>();

  async create(policy: Policy): Promise<void> {
    this.rows.set(policy.id, policy);
  }

  async get(id: string, tenantId: string): Promise<Policy | null> {
    const row = this.rows.get(id) ?? null;
    if (!row) return null;
    if (row.tenantId !== tenantId) return null;
    return row;
  }

  async list(tenantId: string): Promise<Policy[]> {
    return [...this.rows.values()].filter((r) => r.tenantId === tenantId);
  }

  async update(policy: Policy): Promise<void> {
    const row = this.rows.get(policy.id);
    if (!row || row.tenantId !== policy.tenantId) {
      throw new Error(`policy "${policy.id}" not found`);
    }
    this.rows.set(policy.id, policy);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const row = this.rows.get(id);
    if (row && row.tenantId !== tenantId) return;
    this.rows.delete(id);
  }
}

export class InMemoryCandidateStore implements CandidateStore {
  private readonly rows = new Map<string, Candidate>();

  async create(candidate: Candidate): Promise<void> {
    this.rows.set(candidate.id, candidate);
  }

  async get(id: string, tenantId?: string): Promise<Candidate | null> {
    const row = this.rows.get(id) ?? null;
    if (!row) return null;
    if (tenantId !== undefined && row.tenantId !== tenantId) return null;
    return row;
  }

  async list(tenantId?: string): Promise<Candidate[]> {
    const all = [...this.rows.values()];
    if (tenantId !== undefined)
      return all.filter((r) => r.tenantId === tenantId);
    return all;
  }

  async all(tenantId?: string): Promise<Candidate[]> {
    return this.list(tenantId);
  }

  async update(candidate: Candidate): Promise<void> {
    if (!this.rows.has(candidate.id)) {
      throw new Error(`candidate "${candidate.id}" not found`);
    }
    this.rows.set(candidate.id, candidate);
  }

  async remove(id: string, tenantId?: string): Promise<void> {
    if (tenantId !== undefined) {
      const row = this.rows.get(id);
      if (row && row.tenantId !== tenantId) return;
    }
    this.rows.delete(id);
  }
}

export class InMemoryRoleStore implements RoleStore {
  private readonly rows = new Map<string, RoleProfile>();

  async create(role: RoleProfile): Promise<void> {
    this.rows.set(role.id, role);
  }

  async get(id: string, tenantId?: string): Promise<RoleProfile | null> {
    const row = this.rows.get(id) ?? null;
    if (!row) return null;
    if (tenantId !== undefined && row.tenantId !== tenantId) return null;
    return row;
  }

  async list(tenantId?: string): Promise<RoleProfile[]> {
    const all = [...this.rows.values()];
    if (tenantId !== undefined)
      return all.filter((r) => r.tenantId === tenantId);
    return all;
  }

  async all(tenantId?: string): Promise<RoleProfile[]> {
    return this.list(tenantId);
  }

  async update(role: RoleProfile): Promise<void> {
    const row = this.rows.get(role.id);
    if (!row) {
      throw new Error(`role "${role.id}" not found`);
    }
    if (role.tenantId !== undefined && row.tenantId !== role.tenantId) {
      throw new Error(`role "${role.id}" not found`);
    }
    this.rows.set(role.id, role);
  }
}
export class InMemoryAuditStore implements AuditStore {
  private readonly rows: AuditEvent[] = [];

  async append(event: AuditEvent): Promise<void> {
    this.rows.push(event);
  }

  async list(tenantId?: string): Promise<AuditEvent[]> {
    if (tenantId !== undefined)
      return this.rows.filter((r) => r.tenantId === tenantId);
    return [...this.rows];
  }

  async anonymizeBefore(
    cutoff: string,
    keepCandidateIds?: readonly string[],
    tenantId?: string,
  ): Promise<number> {
    const keep = new Set(keepCandidateIds ?? []);
    let anonymized = 0;
    for (const event of this.rows) {
      if (tenantId !== undefined && event.tenantId !== tenantId) continue;
      if (
        event.at < cutoff &&
        (event.candidateId === null || !keep.has(event.candidateId))
      ) {
        event.candidateId = null;
        event.detail = { anonymized: true };
        anonymized += 1;
      }
    }
    return anonymized;
  }
}

export class InMemoryOutboxStore implements ClaimableOutboxStore {
  private readonly rows = new Map<string, OutboxEvent>();
  private readonly claims = new Map<string, string>();

  async enqueue(event: OutboxEvent): Promise<void> {
    this.rows.set(event.id, event);
  }

  async pending(tenantId?: string): Promise<OutboxEvent[]> {
    return [...this.rows.values()].filter(
      (event) =>
        event.dispatchedAt === null &&
        (tenantId === undefined || event.tenantId === tenantId),
    );
  }

  async markDispatched(id: string, tenantId?: string): Promise<void> {
    const event = this.rows.get(id);
    if (event) {
      if (tenantId !== undefined && event.tenantId !== tenantId) return;
      this.rows.set(id, { ...event, dispatchedAt: new Date().toISOString() });
      this.claims.delete(id);
    }
  }

  async expireBefore(cutoff: string, tenantId?: string): Promise<number> {
    let expired = 0;
    for (const [id, event] of this.rows) {
      if (tenantId !== undefined && event.tenantId !== tenantId) continue;
      if (event.at < cutoff) {
        this.rows.delete(id);
        this.claims.delete(id);
        expired += 1;
      }
    }
    return expired;
  }

  async claimForDispatch(id: string, leaseUntil: string): Promise<boolean> {
    const event = this.rows.get(id);
    if (!event || event.dispatchedAt !== null) return false;
    const claimedUntil = this.claims.get(id);
    if (claimedUntil && claimedUntil >= leaseUntil) return false;
    this.claims.set(id, leaseUntil);
    return true;
  }

  async releaseClaim(id: string): Promise<void> {
    this.claims.delete(id);
  }
}

export function createInMemoryStore(): Store {
  return {
    tenants: new InMemoryTenantStore(),
    candidates: new InMemoryCandidateStore(),
    roles: new InMemoryRoleStore(),
    audit: new InMemoryAuditStore(),
    outbox: new InMemoryOutboxStore(),
    scorecards: new InMemoryScorecardStore(),
    userAccess: new InMemoryUserAccessStore(),
    policies: new InMemoryPolicyStore(),
  };
}

export function isCandidateStatus(value: string): value is CandidateStatus {
  return (
    value === "pending_screening" ||
    value === "pending_review" ||
    value === "approved" ||
    value === "rejected"
  );
}

export class InMemoryScorecardStore implements ScorecardStore {
  private readonly rows = new Map<string, Scorecard>();

  async put(scorecard: Scorecard): Promise<void> {
    this.rows.set(scorecard.id, scorecard);
  }

  async get(id: string, tenantId?: string): Promise<Scorecard | null> {
    const row = this.rows.get(id) ?? null;
    if (!row) return null;
    if (tenantId !== undefined && row.tenantId !== tenantId) return null;
    return row;
  }

  async all(tenantId?: string): Promise<Scorecard[]> {
    const all = [...this.rows.values()];
    if (tenantId !== undefined)
      return all.filter((r) => r.tenantId === tenantId);
    return all;
  }
}
