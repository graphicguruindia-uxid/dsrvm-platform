import type {
  AuditEvent,
  Candidate,
  CandidateStatus,
  OutboxEvent,
  RoleProfile,
} from "./types.js";

export interface CandidateStore {
  create(candidate: Candidate): Promise<void>;
  get(id: string): Promise<Candidate | null>;
  list(): Promise<Candidate[]>;
  update(candidate: Candidate): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface RoleStore {
  create(role: RoleProfile): Promise<void>;
  get(id: string): Promise<RoleProfile | null>;
  list(): Promise<RoleProfile[]>;
}

export interface AuditStore {
  append(event: AuditEvent): Promise<void>;
  list(): Promise<AuditEvent[]>;
  anonymizeBefore(cutoff: string): Promise<number>;
}

export interface OutboxStore {
  enqueue(event: OutboxEvent): Promise<void>;
  pending(): Promise<OutboxEvent[]>;
  markDispatched(id: string): Promise<void>;
  expireBefore(cutoff: string): Promise<number>;
}

export interface ClaimableOutboxStore extends OutboxStore {
  claimForDispatch(id: string, leaseUntil: string): Promise<boolean>;
  releaseClaim(id: string): Promise<void>;
}

export interface Store {
  candidates: CandidateStore;
  roles: RoleStore;
  audit: AuditStore;
  outbox: ClaimableOutboxStore;
}

export class InMemoryCandidateStore implements CandidateStore {
  private readonly rows = new Map<string, Candidate>();

  async create(candidate: Candidate): Promise<void> {
    this.rows.set(candidate.id, candidate);
  }

  async get(id: string): Promise<Candidate | null> {
    return this.rows.get(id) ?? null;
  }

  async list(): Promise<Candidate[]> {
    return [...this.rows.values()];
  }

  async update(candidate: Candidate): Promise<void> {
    if (!this.rows.has(candidate.id)) {
      throw new Error(`candidate "${candidate.id}" not found`);
    }
    this.rows.set(candidate.id, candidate);
  }

  async remove(id: string): Promise<void> {
    this.rows.delete(id);
  }
}

export class InMemoryRoleStore implements RoleStore {
  private readonly rows = new Map<string, RoleProfile>();

  async create(role: RoleProfile): Promise<void> {
    this.rows.set(role.id, role);
  }

  async get(id: string): Promise<RoleProfile | null> {
    return this.rows.get(id) ?? null;
  }

  async list(): Promise<RoleProfile[]> {
    return [...this.rows.values()];
  }
}

export class InMemoryAuditStore implements AuditStore {
  private readonly rows: AuditEvent[] = [];

  async append(event: AuditEvent): Promise<void> {
    this.rows.push(event);
  }

  async list(): Promise<AuditEvent[]> {
    return [...this.rows];
  }

  async anonymizeBefore(cutoff: string): Promise<number> {
    let anonymized = 0;
    for (const event of this.rows) {
      if (event.at < cutoff) {
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

  async pending(): Promise<OutboxEvent[]> {
    return [...this.rows.values()].filter(
      (event) => event.dispatchedAt === null,
    );
  }

  async markDispatched(id: string): Promise<void> {
    const event = this.rows.get(id);
    if (event) {
      this.rows.set(id, { ...event, dispatchedAt: new Date().toISOString() });
      this.claims.delete(id);
    }
  }

  async expireBefore(cutoff: string): Promise<number> {
    let expired = 0;
    for (const [id, event] of this.rows) {
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
    candidates: new InMemoryCandidateStore(),
    roles: new InMemoryRoleStore(),
    audit: new InMemoryAuditStore(),
    outbox: new InMemoryOutboxStore(),
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
