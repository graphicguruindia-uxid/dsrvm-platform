import { randomUUID } from "node:crypto";
import type {
  AuditEvent,
  Candidate,
  CreateCandidateInput,
  OutboxEvent,
  ReviewInput,
  RoleProfile,
} from "./types.js";
import type { ScreeningEngine } from "./screening.js";
import type { Store } from "./store.js";

export interface HrServiceOptions {
  store: Store;
  screeningEngine: ScreeningEngine;
  now?: () => Date;
}

export class HrService {
  private readonly store: Store;
  private readonly screeningEngine: ScreeningEngine;
  private readonly now: () => Date;

  constructor(options: HrServiceOptions) {
    this.store = options.store;
    this.screeningEngine = options.screeningEngine;
    this.now = options.now ?? (() => new Date());
  }

  async createRole(input: {
    title: string;
    requirements: string[];
    niceToHave?: string[];
  }): Promise<RoleProfile> {
    const role: RoleProfile = {
      id: randomUUID(),
      title: input.title,
      requirements: input.requirements,
      niceToHave: input.niceToHave ?? [],
      createdAt: this.now().toISOString(),
    };
    await this.store.roles.create(role);
    await this.store.audit.append(
      this.auditEvent(null, "role.created", {
        roleId: role.id,
        title: role.title,
      }),
    );
    return role;
  }

  async listRoles(): Promise<RoleProfile[]> {
    return this.store.roles.list();
  }

  async createCandidate(input: CreateCandidateInput): Promise<Candidate> {
    const role = await this.store.roles.get(input.roleId);
    if (!role) {
      throw new Error(`role "${input.roleId}" not found`);
    }
    const timestamp = this.now().toISOString();
    const candidate: Candidate = {
      id: randomUUID(),
      roleId: input.roleId,
      name: input.name,
      email: input.email,
      resumeText: input.resumeText,
      status: "pending_screening",
      screening: null,
      review: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.store.candidates.create(candidate);
    await this.store.audit.append(
      this.auditEvent(candidate.id, "candidate.created", {
        name: candidate.name,
        email: candidate.email,
        roleId: candidate.roleId,
      }),
    );
    return candidate;
  }

  async screenCandidate(id: string): Promise<Candidate> {
    const candidate = await this.requireCandidate(id);
    if (candidate.status !== "pending_screening") {
      throw new Error(
        `candidate "${id}" cannot be screened from status "${candidate.status}"`,
      );
    }
    const role = await this.store.roles.get(candidate.roleId);
    if (!role) {
      throw new Error(`role "${candidate.roleId}" not found`);
    }

    const screening = await this.screeningEngine.screen(role, candidate);
    const updated: Candidate = {
      ...candidate,
      status: "pending_review",
      screening,
      updatedAt: this.now().toISOString(),
    };
    await this.store.candidates.update(updated);
    await this.store.audit.append(
      this.auditEvent(candidate.id, "candidate.screened", {
        score: screening.score,
        recommendation: screening.recommendation,
        flags: screening.flags,
      }),
    );
    return updated;
  }

  async reviewCandidate(id: string, input: ReviewInput): Promise<Candidate> {
    const candidate = await this.requireCandidate(id);
    if (candidate.status !== "pending_review") {
      throw new Error(
        `candidate "${id}" cannot be reviewed from status "${candidate.status}"`,
      );
    }
    const timestamp = this.now().toISOString();
    const updated: Candidate = {
      ...candidate,
      status: input.approved ? "approved" : "rejected",
      review: {
        approved: input.approved,
        reviewer: input.reviewer,
        note: input.note ?? null,
        decidedAt: timestamp,
      },
      updatedAt: timestamp,
    };
    await this.store.candidates.update(updated);
    await this.store.audit.append(
      this.auditEvent(candidate.id, "candidate.reviewed", {
        approved: input.approved,
        reviewer: input.reviewer,
        note: input.note ?? null,
      }),
    );

    await this.store.outbox.enqueue({
      id: randomUUID(),
      type: input.approved ? "candidate.approved" : "candidate.rejected",
      candidateId: candidate.id,
      payload: {
        candidateId: candidate.id,
        name: candidate.name,
        email: candidate.email,
        roleId: candidate.roleId,
        approved: input.approved,
      },
      at: timestamp,
      dispatchedAt: null,
    });

    return updated;
  }

  async getCandidate(id: string): Promise<Candidate | null> {
    return this.store.candidates.get(id);
  }

  async listCandidates(status?: string): Promise<Candidate[]> {
    const candidates = await this.store.candidates.list();
    if (!status) return candidates;
    return candidates.filter((candidate) => candidate.status === status);
  }

  async auditLog(): Promise<AuditEvent[]> {
    return this.store.audit.list();
  }

  async pendingOutbox(): Promise<OutboxEvent[]> {
    return this.store.outbox.pending();
  }

  async dispatchOutbox(
    handler: (event: OutboxEvent) => Promise<void>,
  ): Promise<number> {
    const pending = await this.store.outbox.pending();
    let dispatched = 0;
    for (const event of pending) {
      await handler(event);
      await this.store.outbox.markDispatched(event.id);
      dispatched += 1;
    }
    return dispatched;
  }

  private async requireCandidate(id: string): Promise<Candidate> {
    const candidate = await this.store.candidates.get(id);
    if (!candidate) {
      throw new Error(`candidate "${id}" not found`);
    }
    return candidate;
  }

  private auditEvent(
    candidateId: string | null,
    action: string,
    detail: unknown,
  ): AuditEvent {
    return {
      id: randomUUID(),
      candidateId,
      action,
      detail,
      at: this.now().toISOString(),
    };
  }
}
