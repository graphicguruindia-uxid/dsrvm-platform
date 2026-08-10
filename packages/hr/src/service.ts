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
import { candidateAiNotice } from "./notice.js";

export interface HrServiceOptions {
  store: Store;
  screeningEngine: ScreeningEngine;
  now?: () => Date;
}

export interface RetentionSchedule {
  candidatesMs: number;
  auditMs: number;
  outboxMs: number;
}

export const DEFAULT_RETENTION_SCHEDULE: RetentionSchedule = {
  candidatesMs: 6 * 30 * 24 * 60 * 60 * 1000,
  auditMs: 2 * 365 * 24 * 60 * 60 * 1000,
  outboxMs: 90 * 24 * 60 * 60 * 1000,
};

export interface RetentionCleanupCounts {
  candidatesDeleted: number;
  auditAnonymized: number;
  outboxExpired: number;
}

export class CandidateNoticeNotDisclosedError extends Error {
  constructor(candidateId: string) {
    super(
      `candidate "${candidateId}" has not been disclosed the AI transparency notice; review is blocked until disclosure is recorded`,
    );
    this.name = "CandidateNoticeNotDisclosedError";
  }
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
      aiNoticeDisclosedAt: timestamp,
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
    const notice = candidateAiNotice();
    await this.store.audit.append(
      this.auditEvent(candidate.id, "candidate.ai_notice", {
        version: notice.version,
        disclosedAt: "pending_screening",
      }),
    );
    await this.store.outbox.enqueue({
      id: randomUUID(),
      type: "candidate.acknowledged",
      candidateId: candidate.id,
      payload: {
        candidateId: candidate.id,
        name: candidate.name,
        email: candidate.email,
        roleId: candidate.roleId,
        notice,
      },
      at: timestamp,
      dispatchedAt: null,
    });
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
    if (!candidate.aiNoticeDisclosedAt) {
      throw new CandidateNoticeNotDisclosedError(id);
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
        notice: candidateAiNotice(),
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

  async retentionCleanup(
    schedule: RetentionSchedule = DEFAULT_RETENTION_SCHEDULE,
  ): Promise<RetentionCleanupCounts> {
    const nowMs = this.now().getTime();
    const outboxCutoff = new Date(nowMs - schedule.outboxMs).toISOString();
    const auditCutoff = new Date(nowMs - schedule.auditMs).toISOString();
    const candidateCutoff = new Date(
      nowMs - schedule.candidatesMs,
    ).toISOString();

    const outboxExpired = await this.store.outbox.expireBefore(outboxCutoff);
    const auditAnonymized = await this.store.audit.anonymizeBefore(auditCutoff);

    let candidatesDeleted = 0;
    const candidates = await this.store.candidates.list();
    for (const candidate of candidates) {
      const decidedAt = candidate.review?.decidedAt;
      if (decidedAt && decidedAt < candidateCutoff) {
        await this.store.candidates.remove(candidate.id);
        candidatesDeleted += 1;
      }
    }

    return { candidatesDeleted, auditAnonymized, outboxExpired };
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
