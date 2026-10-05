import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import type {
  AiComplianceMode,
  AuditEvent,
  Candidate,
  CapacityMetrics,
  ComplianceCheck,
  CreateCandidateInput,
  CreatePolicyInput,
  CreateRoleInput,
  CreateTenantInput,
  CreateUserAccessInput,
  CsvImportResult,
  DataResidency,
  EnrichCandidateInput,
  OutboxEvent,
  Policy,
  PolicyCategory,
  ReviewInput,
  RoleProfile,
  PipelineSummary,
  ReviewOutcome,
  Scorecard,
  ScorecardAnswer,
  Tenant,
  TenantSettings,
  UpdatePolicyInput,
  UpdateRoleInput,
  UpdateScorecardInput,
  UpdateTenantSettingsInput,
  UpdateUserAccessInput,
  UserAccess,
  UserRole,
} from "./types.js";
import type { ScreeningEngine } from "./screening.js";
import type { Store } from "./store.js";
import { candidateAiNotice } from "./notice.js";

export const tenantContext = new AsyncLocalStorage<string | undefined>();

export function currentTenantId(): string | undefined {
  return tenantContext.getStore();
}

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
  candidatesHeld: number;
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

  private get tid(): string | undefined {
    return currentTenantId();
  }

  /**
   * Reject cross-tenant access to a tenant-scoped resource. Callers that run
   * without a tenant context (CLI, background jobs, tests) are left alone.
   * Deliberately reports "not found" so probing cannot enumerate tenant ids.
   */
  private assertTenantScope(id: string): void {
    const caller = this.tid;
    if (caller && caller !== id) {
      throw new Error(`tenant "${id}" not found`);
    }
  }

  async createTenant(input: CreateTenantInput): Promise<Tenant> {
    const timestamp = this.now().toISOString();
    const tenant: Tenant = {
      id: randomUUID(),
      name: input.name,
      createdAt: timestamp,
      settings: {
        workflowStages: [...DEFAULT_WORKFLOW_STAGES],
        dataResidency: DEFAULT_DATA_RESIDENCY,
        aiComplianceMode: DEFAULT_AI_COMPLIANCE_MODE,
        updatedAt: timestamp,
      },
    };
    await this.store.tenants.create(tenant);
    return tenant;
  }

  async listTenants(): Promise<Tenant[]> {
    return this.store.tenants.list();
  }

  async getTenant(id: string): Promise<Tenant | null> {
    return this.store.tenants.get(id);
  }

  async getTenantSettings(id: string): Promise<TenantSettings> {
    this.assertTenantScope(id);
    const tenant = await this.store.tenants.get(id);
    if (!tenant) {
      throw new Error(`tenant "${id}" not found`);
    }
    return tenant.settings ?? defaultTenantSettings(this.now().toISOString());
  }

  async updateTenantSettings(
    id: string,
    input: UpdateTenantSettingsInput,
  ): Promise<Tenant> {
    this.assertTenantScope(id);
    const existing = await this.store.tenants.get(id);
    if (!existing) {
      throw new Error(`tenant "${id}" not found`);
    }
    const current =
      existing.settings ?? defaultTenantSettings(this.now().toISOString());
    const changed: string[] = [];
    let next: TenantSettings = current;
    if (input.workflowStages !== undefined) {
      const stages = normalizeWorkflowStages(input.workflowStages);
      if (JSON.stringify(stages) !== JSON.stringify(current.workflowStages)) {
        changed.push("workflowStages");
      }
      next = { ...next, workflowStages: stages };
    }
    if (input.dataResidency !== undefined) {
      const residency = normalizeDataResidency(input.dataResidency);
      if (residency !== current.dataResidency) changed.push("dataResidency");
      next = { ...next, dataResidency: residency };
    }
    if (input.aiComplianceMode !== undefined) {
      const mode = normalizeAiComplianceMode(input.aiComplianceMode);
      if (mode !== current.aiComplianceMode) changed.push("aiComplianceMode");
      next = { ...next, aiComplianceMode: mode };
    }
    const settings: TenantSettings = {
      ...next,
      updatedAt: this.now().toISOString(),
    };
    const updated = await this.store.tenants.updateSettings(id, settings);
    if (!updated) {
      throw new Error(`tenant "${id}" not found`);
    }
    await this.store.audit.append(
      this.auditEvent(null, "tenant.settings_updated", {
        tenantId: id,
        changed,
      }),
    );
    return updated;
  }

  async createUserAccess(input: CreateUserAccessInput): Promise<UserAccess> {
    const email = normalizeEmail(input.email);
    if (!isValidEmail(email)) {
      throw new Error("email must be a valid email address");
    }
    const role = normalizeUserRole(input.role);
    const existing = await this.store.userAccess.list(
      this.requireTenantId("createUserAccess"),
    );
    if (existing.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error(`email "${email}" already has access for this tenant`);
    }
    const user: UserAccess = {
      id: randomUUID(),
      tenantId: this.requireTenantId("createUserAccess"),
      email,
      role,
      createdAt: this.now().toISOString(),
    };
    await this.store.userAccess.create(user);
    await this.store.audit.append(
      this.auditEvent(null, "access.user_added", {
        userId: user.id,
        email: user.email,
        role: user.role,
      }),
    );
    return user;
  }

  async listUserAccess(): Promise<UserAccess[]> {
    return this.store.userAccess.list(this.requireTenantId("listUserAccess"));
  }

  async updateUserAccess(
    id: string,
    input: UpdateUserAccessInput,
  ): Promise<UserAccess> {
    const tenantId = this.requireTenantId("updateUserAccess");
    const existing = await this.store.userAccess.get(id, tenantId);
    if (!existing) {
      throw new Error(`user access "${id}" not found`);
    }
    const role = normalizeUserRole(input.role);
    const updated: UserAccess = { ...existing, role };
    await this.store.userAccess.update(updated);
    await this.store.audit.append(
      this.auditEvent(null, "access.user_role_changed", {
        userId: updated.id,
        email: updated.email,
        role: updated.role,
      }),
    );
    return updated;
  }

  async deleteUserAccess(id: string): Promise<void> {
    const tenantId = this.requireTenantId("deleteUserAccess");
    const existing = await this.store.userAccess.get(id, tenantId);
    if (!existing) {
      throw new Error(`user access "${id}" not found`);
    }
    await this.store.userAccess.remove(id, tenantId);
    await this.store.audit.append(
      this.auditEvent(null, "access.user_removed", {
        userId: existing.id,
        email: existing.email,
        role: existing.role,
      }),
    );
  }

  async getUserRole(): Promise<UserRole | null> {
    const users = await this.store.userAccess.list(
      this.requireTenantId("getUserRole"),
    );
    return users[0]?.role ?? null;
  }

  async createPolicy(input: CreatePolicyInput): Promise<Policy> {
    const tenantId = this.requireTenantId("createPolicy");
    const title = requireText(input.title, "title", MAX_POLICY_TITLE_LENGTH);
    const category = normalizePolicyCategory(input.category);
    const content = requireText(
      input.content,
      "content",
      MAX_POLICY_CONTENT_LENGTH,
    );
    const timestamp = this.now().toISOString();
    const policy: Policy = {
      id: randomUUID(),
      tenantId,
      title,
      category,
      content,
      version: 1,
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.store.policies.create(policy);
    await this.store.audit.append(
      this.auditEvent(null, "policy.created", {
        policyId: policy.id,
        title: policy.title,
        category: policy.category,
        version: policy.version,
      }),
    );
    return policy;
  }

  async listPolicies(): Promise<Policy[]> {
    return this.store.policies.list(this.requireTenantId("listPolicies"));
  }

  async updatePolicy(id: string, input: UpdatePolicyInput): Promise<Policy> {
    const tenantId = this.requireTenantId("updatePolicy");
    const existing = await this.store.policies.get(id, tenantId);
    if (!existing) {
      throw new Error(`policy "${id}" not found`);
    }
    const updated: Policy = { ...existing };
    if (input.title !== undefined) {
      updated.title = requireText(
        input.title,
        "title",
        MAX_POLICY_TITLE_LENGTH,
      );
    }
    if (input.category !== undefined) {
      updated.category = normalizePolicyCategory(input.category);
    }
    if (input.content !== undefined) {
      const content = requireText(
        input.content,
        "content",
        MAX_POLICY_CONTENT_LENGTH,
      );
      if (content !== existing.content) {
        updated.content = content;
        updated.version = existing.version + 1;
      }
    }
    if (input.active !== undefined) {
      if (typeof input.active !== "boolean") {
        throw new Error("active must be a boolean");
      }
      updated.active = input.active;
    }
    updated.updatedAt = this.now().toISOString();
    await this.store.policies.update(updated);
    await this.store.audit.append(
      this.auditEvent(null, "policy.updated", {
        policyId: updated.id,
        version: updated.version,
      }),
    );
    return updated;
  }

  async deletePolicy(id: string): Promise<void> {
    const tenantId = this.requireTenantId("deletePolicy");
    const existing = await this.store.policies.get(id, tenantId);
    if (!existing) {
      throw new Error(`policy "${id}" not found`);
    }
    await this.store.policies.remove(id, tenantId);
    await this.store.audit.append(
      this.auditEvent(null, "policy.deleted", {
        policyId: existing.id,
        title: existing.title,
        category: existing.category,
        version: existing.version,
      }),
    );
  }

  async complianceCheck(): Promise<ComplianceCheck> {
    const tenantId = this.requireTenantId("complianceCheck");
    const tenant = await this.store.tenants.get(tenantId);
    const settings =
      tenant?.settings ?? defaultTenantSettings(this.now().toISOString());
    const [candidates, policies] = await Promise.all([
      this.store.candidates.list(tenantId),
      this.store.policies.list(tenantId),
    ]);
    return evaluateCompliance(settings, candidates, policies);
  }

  private requireTenantId(operation: string): string {
    const tid = this.tid;
    if (!tid) {
      throw new Error(`${operation} requires a tenant scope`);
    }
    return tid;
  }

  async createRole(input: CreateRoleInput): Promise<RoleProfile> {
    const timestamp = this.now().toISOString();
    const fields = normalizeRoleFields(input);
    const role: RoleProfile = {
      id: randomUUID(),
      title: input.title,
      requirements: input.requirements,
      niceToHave: input.niceToHave ?? [],
      createdAt: timestamp,
      ...fields,
      budgetCurrency:
        fields.budgetCurrency ??
        normalizeBudgetCurrency(DEFAULT_BUDGET_CURRENCY),
      updatedAt: timestamp,
      ...(this.tid ? { tenantId: this.tid } : {}),
    };
    validateRoleFields(role);
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
    return this.store.roles.list(this.tid);
  }

  async updateRole(id: string, input: UpdateRoleInput): Promise<RoleProfile> {
    const existing = await this.store.roles.get(id, this.tid);
    if (!existing) {
      throw new Error(`role "${id}" not found`);
    }
    const patch = normalizeRoleFields(input) as UpdateRoleInput;
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) {
        throw new Error("title is required");
      }
      patch.title = title;
    }
    const merged: RoleProfile = {
      ...existing,
      ...patch,
    };
    validateRoleFields(merged);
    const changed: string[] = [];
    for (const key of Object.keys(patch) as Array<keyof UpdateRoleInput>) {
      const next = merged[key];
      const prev = existing[key];
      if (next === undefined) continue;
      if (Array.isArray(next) && Array.isArray(prev)) {
        if (JSON.stringify(next) !== JSON.stringify(prev)) changed.push(key);
      } else if (next !== prev) {
        changed.push(key);
      }
    }
    const updated: RoleProfile = {
      ...merged,
      updatedAt: this.now().toISOString(),
    };
    await this.store.roles.update(updated);
    await this.store.audit.append(
      this.auditEvent(null, "role.updated", {
        roleId: updated.id,
        title: updated.title,
        changed,
      }),
    );
    return updated;
  }

  async createCandidate(input: CreateCandidateInput): Promise<Candidate> {
    const role = await this.store.roles.get(input.roleId, this.tid);
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
      dispute: null,
      enrichment: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(this.tid ? { tenantId: this.tid } : {}),
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
      ...(this.tid ? { tenantId: this.tid } : {}),
    });
    if (input.autoScreen === false) {
      return candidate;
    }
    return this.screenCandidate(candidate.id);
  }

  async screenCandidate(id: string): Promise<Candidate> {
    const candidate = await this.requireCandidate(id);
    if (candidate.status !== "pending_screening") {
      return candidate;
    }
    const role = await this.store.roles.get(candidate.roleId, this.tid);
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
        roleId: candidate.roleId,
        score: screening.score,
        recommendation: screening.recommendation,
        provider: screening.provider,
        model: screening.model,
        flags: screening.flags,
      }),
    );
    return updated;
  }

  async enrichCandidate(
    id: string,
    input: EnrichCandidateInput,
  ): Promise<Candidate> {
    const candidate = await this.requireCandidate(id);
    if (candidate.status !== "pending_screening") {
      throw new Error(
        `candidate "${id}" cannot be enriched from status "${candidate.status}"`,
      );
    }
    const enrichment = {
      score: clampEnrichmentScore(input.score),
      pii: dedupePii(input.pii ?? []),
      ...(input.source ? { source: input.source } : {}),
    };
    const updated: Candidate = {
      ...candidate,
      enrichment,
      updatedAt: this.now().toISOString(),
    };
    await this.store.candidates.update(updated);
    await this.store.audit.append(
      this.auditEvent(candidate.id, "candidate.enriched", {
        score: enrichment.score,
        pii: enrichment.pii,
        source: enrichment.source ?? null,
      }),
    );
    return updated;
  }

  async reviewCandidate(
    id: string,
    input: ReviewInput,
  ): Promise<ReviewOutcome> {
    const candidate = await this.requireCandidate(id);
    if (candidate.status !== "pending_review") {
      throw new Error(
        `candidate "${id}" cannot be reviewed from status "${candidate.status}"`,
      );
    }
    if (!candidate.aiNoticeDisclosedAt) {
      throw new CandidateNoticeNotDisclosedError(id);
    }
    const previousStatus = candidate.status;
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
        previousStatus,
        newStatus: updated.status,
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
      ...(this.tid ? { tenantId: this.tid } : {}),
    });

    const scorecards = await this.getScorecardsByCandidate(candidate.id);
    if (scorecards.length === 0) {
      return {
        candidate: updated,
        warning: "No scorecards submitted",
      };
    }
    const scorecardAvg =
      scorecards.reduce((sum, card) => sum + card.overallScore, 0) /
      scorecards.length;
    return { candidate: updated, scorecardAvg };
  }

  async getCandidate(id: string): Promise<Candidate | null> {
    return this.store.candidates.get(id, this.tid);
  }

  async listCandidates(status?: string): Promise<Candidate[]> {
    const candidates = await this.store.candidates.list(this.tid);
    if (!status) return candidates;
    return candidates.filter((candidate) => candidate.status === status);
  }

  async auditLog(): Promise<AuditEvent[]> {
    return this.store.audit.list(this.tid);
  }

  async pendingOutbox(): Promise<OutboxEvent[]> {
    return this.store.outbox.pending(this.tid);
  }

  async dispatchOutbox(
    handler: (event: OutboxEvent) => Promise<void>,
  ): Promise<number> {
    const pending = await this.store.outbox.pending(this.tid);
    let dispatched = 0;
    for (const event of pending) {
      await handler(event);
      await this.store.outbox.markDispatched(event.id, this.tid);
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

    const outboxExpired = await this.store.outbox.expireBefore(
      outboxCutoff,
      this.tid,
    );

    const heldCandidateIds: string[] = [];
    let candidatesDeleted = 0;
    let candidatesHeld = 0;
    const candidates = await this.store.candidates.list(this.tid);
    for (const candidate of candidates) {
      if (this.isDisputeHeld(candidate.dispute, nowMs)) {
        heldCandidateIds.push(candidate.id);
        candidatesHeld += 1;
        continue;
      }
      const decidedAt = candidate.review?.decidedAt;
      if (decidedAt && decidedAt < candidateCutoff) {
        await this.store.candidates.remove(candidate.id, this.tid);
        candidatesDeleted += 1;
      }
    }

    const auditAnonymized = await this.store.audit.anonymizeBefore(
      auditCutoff,
      heldCandidateIds,
      this.tid,
    );

    return {
      candidatesDeleted,
      candidatesHeld,
      auditAnonymized,
      outboxExpired,
    };
  }

  async raiseDispute(
    id: string,
    input: { note?: string } = {},
  ): Promise<Candidate> {
    const candidate = await this.requireCandidate(id);
    const timestamp = this.now().toISOString();
    const updated: Candidate = {
      ...candidate,
      dispute: {
        raisedAt: timestamp,
        resolvedAt: null,
        note: input.note ?? null,
      },
      updatedAt: timestamp,
    };
    await this.store.candidates.update(updated);
    await this.store.audit.append(
      this.auditEvent(candidate.id, "candidate.dispute_raised", {
        note: input.note ?? null,
      }),
    );
    return updated;
  }

  async resolveDispute(id: string): Promise<Candidate> {
    const candidate = await this.requireCandidate(id);
    if (!candidate.dispute || candidate.dispute.resolvedAt !== null) {
      throw new Error(`candidate "${id}" has no open dispute to resolve`);
    }
    const timestamp = this.now().toISOString();
    const updated: Candidate = {
      ...candidate,
      dispute: {
        ...candidate.dispute,
        resolvedAt: timestamp,
      },
      updatedAt: timestamp,
    };
    await this.store.candidates.update(updated);
    await this.store.audit.append(
      this.auditEvent(candidate.id, "candidate.dispute_resolved", {}),
    );
    return updated;
  }

  async discloseAiNotice(id: string): Promise<Candidate> {
    const candidate = await this.requireCandidate(id);
    if (candidate.aiNoticeDisclosedAt) {
      throw new Error(`AI notice already disclosed for candidate "${id}"`);
    }
    const timestamp = this.now().toISOString();
    const updated: Candidate = {
      ...candidate,
      aiNoticeDisclosedAt: timestamp,
      updatedAt: timestamp,
    };
    await this.store.candidates.update(updated);
    await this.store.audit.append(
      this.auditEvent(candidate.id, "candidate.ai_notice_disclosed", {}),
    );
    return updated;
  }

  async deleteCandidate(id: string): Promise<void> {
    const candidate = await this.requireCandidate(id);
    if (candidate.dispute && !candidate.dispute.resolvedAt) {
      throw new Error(
        `candidate "${id}" has an open dispute and cannot be deleted`,
      );
    }
    await this.store.candidates.remove(id, this.tid);
    await this.store.audit.append(
      this.auditEvent(id, "candidate.deleted", {
        name: candidate.name,
        email: candidate.email,
      }),
    );
  }

  async updateCandidate(
    id: string,
    input: { name?: string; email?: string },
  ): Promise<Candidate> {
    const candidate = await this.requireCandidate(id);
    const timestamp = this.now().toISOString();
    const updated: Candidate = {
      ...candidate,
      name: input.name?.trim() || candidate.name,
      email: input.email?.trim().toLowerCase() || candidate.email,
      updatedAt: timestamp,
    };
    await this.store.candidates.update(updated);
    await this.store.audit.append(
      this.auditEvent(id, "candidate.updated", {
        name: input.name ?? undefined,
        email: input.email ?? undefined,
      }),
    );
    return updated;
  }

  private isDisputeHeld(
    dispute: { resolvedAt: string | null } | null,
    nowMs: number,
  ): boolean {
    if (!dispute) return false;
    if (dispute.resolvedAt === null) return true;
    return (
      new Date(dispute.resolvedAt).getTime() +
        DEFAULT_RETENTION_SCHEDULE.candidatesMs >
      nowMs
    );
  }

  private async requireCandidate(id: string): Promise<Candidate> {
    const candidate = await this.store.candidates.get(id, this.tid);
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
      ...(this.tid ? { tenantId: this.tid } : {}),
    };
  }

  async createScorecard(
    candidateId: string,
    reviewerId: string,
    reviewerName: string,
    answers: ScorecardAnswer[],
  ): Promise<Scorecard> {
    const scorecard: Scorecard = {
      id: randomUUID(),
      candidateId,
      reviewerId,
      reviewerName,
      answers,
      overallScore:
        answers.reduce((sum, a) => sum + a.score, 0) / answers.length,
      createdAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
      ...(this.tid ? { tenantId: this.tid } : {}),
    };
    await this.store.scorecards.put(scorecard);
    await this.store.audit.append(
      this.auditEvent(scorecard.candidateId, "scorecard.submitted", {
        candidateId: scorecard.candidateId,
        overallScore: scorecard.overallScore,
        reviewerName: scorecard.reviewerName,
      }),
    );
    return scorecard;
  }

  async updateScorecard(
    id: string,
    input: UpdateScorecardInput,
  ): Promise<Scorecard> {
    const existing = await this.store.scorecards.get(id, this.tid);
    if (!existing) {
      throw new Error(`scorecard "${id}" not found`);
    }
    const answers =
      input.answers !== undefined
        ? validateScorecardAnswers(input.answers)
        : existing.answers;
    const reviewerName =
      input.reviewerName !== undefined
        ? sanitizeScorecardText(input.reviewerName)
        : existing.reviewerName;
    const overallScore =
      answers.reduce((sum, a) => sum + a.score, 0) / answers.length;
    const updated: Scorecard = {
      ...existing,
      reviewerName,
      answers,
      overallScore,
      updatedAt: this.now().toISOString(),
    };
    await this.store.scorecards.put(updated);
    await this.store.audit.append(
      this.auditEvent(updated.candidateId, "scorecard.updated", {
        scorecardId: updated.id,
        candidateId: updated.candidateId,
        overallScore: updated.overallScore,
      }),
    );
    return updated;
  }

  async logAiEvent(
    candidateId: string | null,
    action: string,
    detail: Record<string, unknown>,
  ): Promise<void> {
    await this.store.audit.append(this.auditEvent(candidateId, action, detail));
  }

  async getScorecard(id: string): Promise<Scorecard | null> {
    return this.store.scorecards.get(id, this.tid);
  }

  async listScorecards(): Promise<Scorecard[]> {
    return this.store.scorecards.all(this.tid);
  }

  async getScorecardsByCandidate(candidateId: string): Promise<Scorecard[]> {
    const all = await this.store.scorecards.all(this.tid);
    return all.filter((s) => s.candidateId === candidateId);
  }

  async getOverallScore(candidateId: string): Promise<number | null> {
    const scorecards = await this.getScorecardsByCandidate(candidateId);
    if (!scorecards.length) return null;
    const allScores = scorecards.map((s) => s.overallScore);
    return allScores.reduce((a, b) => a + b, 0) / allScores.length;
  }

  async getCapacityMetrics(): Promise<CapacityMetrics> {
    const candidates = await this.store.candidates.all(this.tid);
    const roles = await this.store.roles.all(this.tid);

    const candidatesByRole = new Map<string, Candidate[]>();
    for (const c of candidates) {
      const arr = candidatesByRole.get(c.roleId) || [];
      arr.push(c);
      candidatesByRole.set(c.roleId, arr);
    }

    const metrics: CapacityMetrics = {
      roles: roles.map((role) => {
        const roleCands = candidatesByRole.get(role.id) || [];
        const byStatus = {
          pending_screening: 0,
          pending_review: 0,
          approved: 0,
          rejected: 0,
        };
        let totalScreeningTime = 0;
        for (const c of roleCands) {
          if (c.status === "pending_screening") byStatus.pending_screening++;
          else if (c.status === "pending_review") byStatus.pending_review++;
          else if (c.status === "approved") byStatus.approved++;
          else if (c.status === "rejected") byStatus.rejected++;
          if (c.screening) {
            const hours =
              (Date.now() - new Date(c.screening.screenedAt).getTime()) /
              (1000 * 60 * 60);
            totalScreeningTime += hours;
          }
        }
        return {
          id: role.id,
          title: role.title,
          openSlots: 2,
          candidatesInPipeline: roleCands.length,
          candidatesPendingReview: byStatus.pending_review,
          candidatesApproved: byStatus.approved,
          candidatesRejected: byStatus.rejected,
          avgScreeningTimeHours: roleCands.length
            ? totalScreeningTime / roleCands.length
            : 0,
        };
      }),
      reviewers: [],
      overall: {
        totalCandidates: candidates.length,
        pendingScreening: candidates.filter(
          (c) => c.status === "pending_screening",
        ).length,
        pendingReview: candidates.filter((c) => c.status === "pending_review")
          .length,
        approved: candidates.filter((c) => c.status === "approved").length,
        rejected: candidates.filter((c) => c.status === "rejected").length,
        avgScore: 0,
        disputeCount: candidates.filter((c) => c.dispute).length,
      },
    };
    metrics.overall.avgScore = 0;
    return metrics;
  }

  async getPipelineSummary(): Promise<PipelineSummary> {
    const [candidates, outbox, scorecards] = await Promise.all([
      this.store.candidates.all(this.tid),
      this.store.outbox.pending(this.tid),
      this.store.scorecards.all(this.tid),
    ]);

    const byStatus = {
      pending_screening: 0,
      pending_review: 0,
      approved: 0,
      rejected: 0,
    };
    let scoreSum = 0;
    let scoreCount = 0;
    let screeningTimeMs = 0;
    let screeningTimeCount = 0;
    for (const candidate of candidates) {
      byStatus[candidate.status]++;
      if (!candidate.screening) continue;
      scoreSum += candidate.screening.score;
      scoreCount++;
      const created = new Date(candidate.createdAt).getTime();
      const screened = new Date(candidate.screening.screenedAt).getTime();
      if (Number.isFinite(created) && Number.isFinite(screened)) {
        screeningTimeMs += Math.max(0, screened - created);
        screeningTimeCount++;
      }
    }

    return {
      total: candidates.length,
      byStatus,
      avgScore: scoreCount ? scoreSum / scoreCount : 0,
      avgScreeningTimeMs: screeningTimeCount
        ? screeningTimeMs / screeningTimeCount
        : 0,
      scorecardsSubmitted: scorecards.length,
      outboxPending: outbox.length,
    };
  }

  async importCandidatesFromCsv(csv: string): Promise<CsvImportResult> {
    const lines = csv.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      return {
        imported: 0,
        failed: 0,
        screened: 0,
        screeningFailed: 0,
        errors: ["CSV must have header + at least 1 row"],
      };
    }
    const header = (lines[0] ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase());
    const nameIdx = header.indexOf("name");
    const emailIdx = header.indexOf("email");
    const roleIdIdx = header.indexOf("roleid");
    if (nameIdx === -1 || emailIdx === -1) {
      return {
        imported: 0,
        failed: 0,
        screened: 0,
        screeningFailed: 0,
        errors: ["Missing required columns: name, email"],
      };
    }
    const errors: string[] = [];
    let imported = 0,
      failed = 0,
      screened = 0,
      screeningFailed = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = (lines[i] ?? "").split(",").map((c) => c.trim());
      if (nameIdx >= cols.length || emailIdx >= cols.length) {
        errors.push(`Row ${i + 1}: missing columns`);
        failed++;
        continue;
      }
      const name = cols[nameIdx];
      const email = cols[emailIdx];
      const roleId =
        roleIdIdx >= 0 && roleIdIdx < cols.length ? cols[roleIdIdx] : "";
      if (!name || !email || !roleId) {
        errors.push(`Row ${i + 1}: missing required values`);
        failed++;
        continue;
      }
      try {
        const allCandidates = await this.store.candidates.list(this.tid);
        const existing = allCandidates.find((c) => c.email === email);
        if (existing) {
          errors.push(`Row ${i + 1}: email ${email} already exists`);
          failed++;
          continue;
        }
        const created = await this.createCandidate({
          roleId,
          name,
          email,
          resumeText: "",
        });
        imported++;
        try {
          const candidate =
            created.status === "pending_review"
              ? created
              : await this.screenCandidate(created.id);
          if (candidate.screening) {
            screened++;
          } else {
            screeningFailed++;
            errors.push(`Row ${i + 1}: screening produced no result`);
          }
        } catch (err) {
          screeningFailed++;
          errors.push(`Row ${i + 1}: screening failed: ${String(err)}`);
        }
      } catch (err) {
        errors.push(`Row ${i + 1}: ${String(err)}`);
        failed++;
      }
    }
    return { imported, failed, screened, screeningFailed, errors };
  }

  async exportCandidatesToCsv(): Promise<string> {
    const candidates = await this.store.candidates.all(this.tid);
    const header = [
      "name",
      "email",
      "status",
      "roleId",
      "createdAt",
      "screeningScore",
      "reviewer",
      "reviewedAt",
    ];
    const rows = [header.join(",")];
    for (const c of candidates) {
      const status = c.status;
      const score = c.screening?.score ?? "";
      const reviewer = c.review
        ? `${c.review.reviewer} (${c.review.decidedAt})`
        : "";
      const row = [
        `"${c.name.replace(/"/g, '""')}"`,
        c.email,
        status,
        c.roleId,
        c.createdAt,
        String(score),
        reviewer,
      ];
      rows.push(row.join(","));
    }
    return rows.join("\n");
  }
}

function clampEnrichmentScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function dedupePii(pii: string[]): string[] {
  return [...new Set(pii.map((flag) => flag.trim()).filter(Boolean))].sort();
}

function normalizeSkills(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const seen = new Set<string>();
  const skills: string[] = [];
  for (const item of input) {
    if (typeof item !== "string") continue;
    const value = item.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    skills.push(value);
    if (skills.length >= 30) break;
  }
  return skills;
}

function normalizeRoleFields(
  input: Partial<CreateRoleInput> & Partial<UpdateRoleInput>,
): Partial<RoleProfile> {
  const patch: Partial<RoleProfile> = {};
  if (input.skills !== undefined) {
    patch.skills = normalizeSkills(input.skills);
  }
  if (input.experienceMinYears !== undefined) {
    patch.experienceMinYears = input.experienceMinYears;
  }
  if (input.experienceMaxYears !== undefined) {
    patch.experienceMaxYears = input.experienceMaxYears;
  }
  if (input.budgetMin !== undefined) {
    patch.budgetMin = input.budgetMin;
  }
  if (input.budgetMax !== undefined) {
    patch.budgetMax = input.budgetMax;
  }
  if (input.budgetCurrency !== undefined) {
    patch.budgetCurrency = normalizeBudgetCurrency(input.budgetCurrency);
  }
  return patch;
}

export const MAX_SCORECARD_ANSWER_SCORE = 5;
export const MIN_SCORECARD_ANSWER_SCORE = 1;
export const MAX_SCORECARD_COMMENT_LENGTH = 2000;

function sanitizeScorecardText(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .trim()
    .slice(0, 200);
}

function validateScorecardAnswers(input: unknown): ScorecardAnswer[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("answers must be a non-empty array");
  }
  return input.map((answer, index) => {
    if (typeof answer !== "object" || answer === null) {
      throw new Error(`answers[${index}] must be an object`);
    }
    const { questionId, score, comment } = answer as ScorecardAnswer;
    if (typeof questionId !== "string" || questionId.trim() === "") {
      throw new Error(
        `answers[${index}].questionId must be a non-empty string`,
      );
    }
    if (!Number.isInteger(score)) {
      throw new Error(`answers[${index}].score must be an integer`);
    }
    if (
      score < MIN_SCORECARD_ANSWER_SCORE ||
      score > MAX_SCORECARD_ANSWER_SCORE
    ) {
      throw new Error(
        `answers[${index}].score must be between ${MIN_SCORECARD_ANSWER_SCORE} and ${MAX_SCORECARD_ANSWER_SCORE}`,
      );
    }
    if (comment !== undefined && typeof comment !== "string") {
      throw new Error(`answers[${index}].comment must be a string`);
    }
    return {
      questionId: questionId.trim(),
      score,
      ...(comment !== undefined
        ? {
            comment: comment
              .replace(/<[^>]*>/g, "")
              .slice(0, MAX_SCORECARD_COMMENT_LENGTH),
          }
        : {}),
    };
  });
}

export const DEFAULT_WORKFLOW_STAGES = [
  "sourcing",
  "screening",
  "interview",
  "offer",
  "onboarding",
] as const;

export const DEFAULT_DATA_RESIDENCY: DataResidency = "GLOBAL";
export const DEFAULT_AI_COMPLIANCE_MODE: AiComplianceMode = "standard";

export const DATA_RESIDENCIES: readonly DataResidency[] = [
  "EU",
  "US",
  "UK",
  "GLOBAL",
];
export const AI_COMPLIANCE_MODES: readonly AiComplianceMode[] = [
  "strict",
  "standard",
  "off",
];
export const USER_ROLES: readonly UserRole[] = [
  "hr_admin",
  "recruiter",
  "executive",
];
export const POLICY_CATEGORIES: readonly PolicyCategory[] = [
  "ai_governance",
  "data_retention",
  "hiring",
  "compliance",
  "custom",
];

export const MAX_WORKFLOW_STAGES = 20;
export const MAX_WORKFLOW_STAGE_LENGTH = 60;
export const MAX_POLICY_TITLE_LENGTH = 200;
export const MAX_POLICY_CONTENT_LENGTH = 50000;
export const MAX_EMAIL_LENGTH = 254;

export function defaultTenantSettings(updatedAt: string): TenantSettings {
  return {
    workflowStages: [...DEFAULT_WORKFLOW_STAGES],
    dataResidency: DEFAULT_DATA_RESIDENCY,
    aiComplianceMode: DEFAULT_AI_COMPLIANCE_MODE,
    updatedAt,
  };
}

function normalizeDataResidency(value: unknown): DataResidency {
  if (typeof value === "string") {
    const upper = value.trim().toUpperCase();
    const match = DATA_RESIDENCIES.find((r) => r === upper);
    if (match) return match;
  }
  throw new Error(
    `dataResidency must be one of ${DATA_RESIDENCIES.join(", ")}`,
  );
}

function normalizeAiComplianceMode(value: unknown): AiComplianceMode {
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    const match = AI_COMPLIANCE_MODES.find((m) => m === lower);
    if (match) return match;
  }
  throw new Error(
    `aiComplianceMode must be one of ${AI_COMPLIANCE_MODES.join(", ")}`,
  );
}

function normalizeUserRole(value: unknown): UserRole {
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    const match = USER_ROLES.find((r) => r === lower);
    if (match) return match;
  }
  throw new Error(`role must be one of ${USER_ROLES.join(", ")}`);
}

function normalizePolicyCategory(value: unknown): PolicyCategory {
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    const match = POLICY_CATEGORIES.find((c) => c === lower);
    if (match) return match;
  }
  throw new Error(`category must be one of ${POLICY_CATEGORIES.join(", ")}`);
}

function normalizeWorkflowStages(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error("workflowStages must be an array of stage names");
  }
  if (value.length === 0) {
    throw new Error("workflowStages must contain at least one stage");
  }
  if (value.length > MAX_WORKFLOW_STAGES) {
    throw new Error(
      `workflowStages must contain at most ${MAX_WORKFLOW_STAGES} stages`,
    );
  }
  return value.map((stage) => {
    if (typeof stage !== "string") {
      throw new Error("workflowStages must be an array of stage names");
    }
    const trimmed = stage.trim();
    if (!trimmed) {
      throw new Error("workflowStages entries must be non-empty strings");
    }
    if (trimmed.length > MAX_WORKFLOW_STAGE_LENGTH) {
      throw new Error(
        `workflowStages entries must be at most ${MAX_WORKFLOW_STAGE_LENGTH} characters`,
      );
    }
    return trimmed;
  });
}

function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("email must be a valid email address");
  }
  return value.trim().toLowerCase().slice(0, MAX_EMAIL_LENGTH);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function requireText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new Error(`${field} must be at most ${maxLength} characters`);
  }
  return trimmed;
}

/**
 * Pure compliance evaluation over tenant state: settings, candidates and
 * policies. Exported so it can be unit-tested without a store.
 */
export function evaluateCompliance(
  settings: TenantSettings,
  candidates: readonly Pick<Candidate, "aiNoticeDisclosedAt" | "dispute">[],
  policies: readonly Pick<Policy, "active">[],
): ComplianceCheck {
  const policiesTotal = policies.length;
  const policiesActive = policies.filter((p) => p.active).length;
  const disclosed = candidates.filter(
    (c) => c.aiNoticeDisclosedAt !== null,
  ).length;
  const aiDisclosureRate =
    candidates.length === 0 ? 0 : disclosed / candidates.length;
  const disputesOpen = candidates.filter(
    (c) => c.dispute !== null && c.dispute.resolvedAt === null,
  ).length;
  const disputesResolved = candidates.filter(
    (c) => c.dispute !== null && c.dispute.resolvedAt !== null,
  ).length;

  const flags: string[] = [];
  const mode = settings.aiComplianceMode;
  if (mode === "strict" && aiDisclosureRate < 1) {
    flags.push(
      `Strict AI compliance mode requires 100% AI notice disclosure (currently ${Math.round(
        aiDisclosureRate * 100,
      )}%)`,
    );
  }
  if (mode === "strict" && policiesActive === 0) {
    flags.push("Strict AI compliance mode requires at least one active policy");
  }
  if (mode === "standard" && policiesActive === 0) {
    flags.push("No active policies configured");
  }
  if (settings.dataResidency !== "GLOBAL") {
    flags.push(
      `Data residency is set to ${settings.dataResidency} — ensure vendor DPAs match this region`,
    );
  }

  return {
    policiesActive,
    policiesTotal,
    complianceMode: mode,
    dataResidency: settings.dataResidency,
    aiDisclosureRate,
    disputesOpen,
    disputesResolved,
    workflowStages: [...settings.workflowStages],
    flags,
  };
}

const BUDGET_CURRENCY_ALLOWLIST = ["USD", "EUR", "GBP", "INR"] as const;
export const DEFAULT_BUDGET_CURRENCY = "USD";
export const MAX_BUDGET_CURRENCY_LENGTH = 3;
export const MAX_ROLE_SKILLS = 30;

export function normalizeBudgetCurrency(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_BUDGET_CURRENCY;
  return value.trim().slice(0, MAX_BUDGET_CURRENCY_LENGTH).toUpperCase();
}

function validateRoleFields(role: RoleProfile): void {
  if (role.budgetCurrency !== undefined) {
    const code = role.budgetCurrency;
    if (
      code === "" ||
      !(BUDGET_CURRENCY_ALLOWLIST as readonly string[]).includes(code)
    ) {
      throw new Error(
        `budgetCurrency must be one of ${BUDGET_CURRENCY_ALLOWLIST.join(", ")}`,
      );
    }
  }
  const minYears = role.experienceMinYears;
  const maxYears = role.experienceMaxYears;
  if (minYears !== undefined && !Number.isInteger(minYears)) {
    throw new Error("experienceMinYears must be an integer");
  }
  if (maxYears !== undefined && !Number.isInteger(maxYears)) {
    throw new Error("experienceMaxYears must be an integer");
  }
  if (minYears !== undefined && (minYears < 0 || minYears > 60)) {
    throw new Error("experienceMinYears must be between 0 and 60");
  }
  if (maxYears !== undefined && (maxYears < 0 || maxYears > 60)) {
    throw new Error("experienceMaxYears must be between 0 and 60");
  }
  if (minYears !== undefined && maxYears !== undefined && minYears > maxYears) {
    throw new Error("experienceMinYears must not exceed experienceMaxYears");
  }
  const minBudget = role.budgetMin;
  const maxBudget = role.budgetMax;
  if (minBudget !== undefined && minBudget < 0) {
    throw new Error("budgetMin must be a non-negative number");
  }
  if (maxBudget !== undefined && maxBudget < 0) {
    throw new Error("budgetMax must be a non-negative number");
  }
  if (
    minBudget !== undefined &&
    maxBudget !== undefined &&
    minBudget > maxBudget
  ) {
    throw new Error("budgetMin must not exceed budgetMax");
  }
}
