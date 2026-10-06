import { describe, expect, it } from "vitest";
import { createGateway, createFakeProvider } from "@dsrvm/ai";
import { HrService, tenantContext, evaluateCompliance } from "./service.js";
import type { RetentionSchedule } from "./service.js";
import { createScreeningEngine } from "./screening.js";
import { createInMemoryStore } from "./store.js";
import type { Candidate } from "./types.js";

const SCREENING_JSON = (recommendation: string) =>
  JSON.stringify({
    score: 80,
    recommendation,
    summary: "Meets the core requirements.",
    strengths: ["TypeScript", "AI integration"],
    flags: [],
  });

function buildService() {
  const gateway = createGateway(
    [
      createFakeProvider({
        name: "fake",
        echo: false,
        output: SCREENING_JSON("advance"),
      }),
    ],
    {
      activeProvider: "fake",
    },
  );
  const store = createInMemoryStore();
  const service = new HrService({
    store,
    screeningEngine: createScreeningEngine(gateway),
    now: () => new Date("2026-08-04T00:00:00.000Z"),
  });
  return { service, store };
}

describe("HrService pipeline", () => {
  it("runs intake -> screening -> review(approve) with audit and outbox", async () => {
    const { service, store } = buildService();

    const role = await service.createRole({
      title: "Founding Engineer",
      requirements: ["TypeScript", "AI integration"],
    });

    const candidate = await service.createCandidate({
      roleId: role.id,
      name: "Ada Lovelace",
      email: "ada@example.com",
      resumeText: "TypeScript and LLM pipelines for 8 years.",
    });
    expect(candidate.status).toBe("pending_review");
    expect(candidate.screening?.recommendation).toBe("advance");

    const acknowledged = await service.pendingOutbox();
    expect(acknowledged).toHaveLength(1);
    expect(acknowledged[0]?.type).toBe("candidate.acknowledged");

    const { candidate: approved } = await service.reviewCandidate(
      candidate.id,
      {
        approved: true,
        reviewer: "hr-manager",
        note: "Looks great",
      },
    );
    expect(approved.status).toBe("approved");

    const outbox = await service.pendingOutbox();
    expect(outbox).toHaveLength(2);
    expect(outbox.map((event) => event.type)).toEqual([
      "candidate.acknowledged",
      "candidate.approved",
    ]);
    expect(
      (outbox[1]?.payload as { notice?: { version?: string } }).notice?.version,
    ).toBe("v1");

    const audit = await service.auditLog();
    const actions = audit.map((event) => event.action);
    expect(actions).toContain("candidate.created");
    expect(actions).toContain("candidate.ai_notice");
    expect(actions).toContain("candidate.screened");
    expect(actions).toContain("candidate.reviewed");

    let dispatched = 0;
    const types: string[] = [];
    const count = await service.dispatchOutbox(async (event) => {
      dispatched += 1;
      types.push(event.type);
    });
    expect(count).toBe(2);
    expect(dispatched).toBe(2);
    expect(types).toContain("candidate.approved");
    expect(await service.pendingOutbox()).toHaveLength(0);
  });

  it("rejects via review and emits candidate.rejected", async () => {
    const { service } = buildService();
    const role = await service.createRole({
      title: "Engineer",
      requirements: ["Go"],
    });
    const candidate = await service.createCandidate({
      roleId: role.id,
      name: "Bob",
      email: "bob@example.com",
      resumeText: "No Go experience.",
    });
    const { candidate: rejected } = await service.reviewCandidate(
      candidate.id,
      {
        approved: false,
        reviewer: "hr-manager",
      },
    );
    expect(rejected.status).toBe("rejected");

    const outbox = await service.pendingOutbox();
    expect(outbox.map((event) => event.type)).toContain("candidate.rejected");
  });

  it("discloses the AI notice at application confirmation (no bypass)", async () => {
    const { service } = buildService();
    const role = await service.createRole({
      title: "Engineer",
      requirements: ["TS"],
    });
    const candidate = await service.createCandidate({
      roleId: role.id,
      name: "Carol",
      email: "carol@example.com",
      resumeText: "TS.",
    });

    const outbox = await service.pendingOutbox();
    const ack = outbox.find((event) => event.type === "candidate.acknowledged");
    const ackPayload = ack?.payload as {
      name?: string;
      notice?: { version?: string; title?: string; text?: string };
    };
    expect(ack).toBeDefined();
    expect(ack?.candidateId).toBe(candidate.id);
    expect(ackPayload.name).toBe("Carol");
    expect(ackPayload.notice).toMatchObject({
      version: "v1",
      title: "AI-assisted application processing",
    });
    expect(ackPayload.notice?.text).toContain("A human reviewer always makes");

    const audit = await service.auditLog();
    const notice = audit.find(
      (event) =>
        event.action === "candidate.ai_notice" &&
        event.candidateId === candidate.id,
    );
    expect(notice).toBeDefined();
    expect(notice?.detail).toMatchObject({
      version: "v1",
      disclosedAt: "pending_screening",
    });
  });

  it("guards invalid transitions and missing candidates", async () => {
    const { service } = buildService();
    const role = await service.createRole({
      title: "Engineer",
      requirements: ["TS"],
    });
    const candidate = await service.createCandidate({
      roleId: role.id,
      name: "Carol",
      email: "carol@example.com",
      resumeText: "TS.",
      autoScreen: false,
    });

    await expect(
      service.reviewCandidate(candidate.id, { approved: true, reviewer: "hr" }),
    ).rejects.toThrow("cannot be reviewed");
    await expect(service.screenCandidate("missing-id")).rejects.toThrow(
      "not found",
    );
  });

  it("R6: blocks review when the AI transparency notice was not disclosed", async () => {
    const { service, store } = buildService();
    const role = await service.createRole({
      title: "Engineer",
      requirements: ["TS"],
    });
    const undisclosed: Candidate = {
      id: "undisclosed-1",
      roleId: role.id,
      name: "No Notice",
      email: "no-notice@example.com",
      resumeText: "TS.",
      status: "pending_review",
      screening: null,
      review: null,
      aiNoticeDisclosedAt: null,
      dispute: null,
      enrichment: null,
      createdAt: new Date("2026-08-04T00:00:00.000Z").toISOString(),
      updatedAt: new Date("2026-08-04T00:00:00.000Z").toISOString(),
    };
    await store.candidates.create(undisclosed);

    await expect(
      service.reviewCandidate(undisclosed.id, {
        approved: true,
        reviewer: "hr",
      }),
    ).rejects.toThrow("has not been disclosed the AI transparency notice");
  });

  it("attaches a CareerForge-style enrichment to a candidate before screening", async () => {
    const { service } = buildService();
    const role = await service.createRole({
      title: "Engineer",
      requirements: ["TS"],
    });
    const candidate = await service.createCandidate({
      roleId: role.id,
      name: "Eve",
      email: "eve@example.com",
      resumeText: "TS and AI pipelines.",
      autoScreen: false,
    });

    const enriched = await service.enrichCandidate(candidate.id, {
      score: 87,
      pii: ["email", "phone"],
      source: "careerforge",
    });
    expect(enriched.enrichment).toEqual({
      score: 87,
      pii: ["email", "phone"],
      source: "careerforge",
    });

    const audit = await service.auditLog();
    const enrichedEvent = audit.find(
      (event) =>
        event.action === "candidate.enriched" &&
        event.candidateId === candidate.id,
    );
    expect(enrichedEvent?.detail).toMatchObject({
      score: 87,
      pii: ["email", "phone"],
      source: "careerforge",
    });
  });

  it("clamps enrichment score and dedupes pii flags", async () => {
    const { service } = buildService();
    const role = await service.createRole({
      title: "Engineer",
      requirements: ["TS"],
    });
    const candidate = await service.createCandidate({
      roleId: role.id,
      name: "Frank",
      email: "frank@example.com",
      resumeText: "TS.",
      autoScreen: false,
    });

    const enriched = await service.enrichCandidate(candidate.id, {
      score: 150,
      pii: ["phone", "phone", "", "email"],
    });
    expect(enriched.enrichment?.score).toBe(100);
    expect(enriched.enrichment?.pii).toEqual(["email", "phone"]);
    expect(enriched.enrichment?.source).toBeUndefined();
  });

  it("refuses enrichment after screening has begun", async () => {
    const { service } = buildService();
    const role = await service.createRole({
      title: "Engineer",
      requirements: ["TS"],
    });
    const candidate = await service.createCandidate({
      roleId: role.id,
      name: "Grace",
      email: "grace@example.com",
      resumeText: "TS.",
    });

    await expect(
      service.enrichCandidate(candidate.id, { score: 50 }),
    ).rejects.toThrow("cannot be enriched from status");
  });

  it("keeps a full audit trail with candidate ids and details", async () => {
    const { service, store } = buildService();
    const role = await service.createRole({
      title: "Engineer",
      requirements: ["TS"],
    });
    const candidate = await service.createCandidate({
      roleId: role.id,
      name: "Dave",
      email: "dave@example.com",
      resumeText: "TS.",
    });

    const events = await service.auditLog();
    expect(events).toHaveLength(4);
    expect(
      events.every(
        (event) =>
          event.candidateId === candidate.id || event.candidateId === null,
      ),
    ).toBe(true);
    expect(events.map((event) => event.action)).toEqual([
      "role.created",
      "candidate.created",
      "candidate.ai_notice",
      "candidate.screened",
    ]);
    expect(await store.audit.list()).toHaveLength(4);
  });

  it("retentionCleanup enforces the G6 schedule", async () => {
    const { service, store } = buildService();
    const role = await service.createRole({
      title: "Engineer",
      requirements: ["TS"],
    });

    const old = await service.createCandidate({
      roleId: role.id,
      name: "Old",
      email: "old@example.com",
      resumeText: "TS.",
    });
    await service.reviewCandidate(old.id, {
      approved: true,
      reviewer: "hr-manager",
    });

    const oldCandidate = (await store.candidates.get(old.id))!;
    await store.candidates.update({
      ...oldCandidate,
      review: {
        ...oldCandidate.review!,
        decidedAt: "2025-08-01T00:00:00.000Z",
      },
    });

    const recent = await service.createCandidate({
      roleId: role.id,
      name: "Recent",
      email: "recent@example.com",
      resumeText: "TS.",
    });

    const oldTimestamp = "2025-08-01T00:00:00.000Z";
    await store.outbox.enqueue({
      id: "old-outbox",
      type: "candidate.acknowledged",
      candidateId: old.id,
      payload: { candidateId: old.id },
      at: oldTimestamp,
      dispatchedAt: null,
    });
    await store.audit.append({
      id: "old-audit",
      candidateId: old.id,
      action: "candidate.reviewed",
      detail: { approved: true },
      at: oldTimestamp,
    });

    const tinySchedule: RetentionSchedule = {
      candidatesMs: 100 * 24 * 60 * 60 * 1000,
      auditMs: 100 * 24 * 60 * 60 * 1000,
      outboxMs: 1 * 24 * 60 * 60 * 1000,
    };
    const counts = await service.retentionCleanup(tinySchedule);

    expect(counts.candidatesDeleted).toBe(1);
    expect(await service.getCandidate(old.id)).toBeNull();
    expect(await service.getCandidate(recent.id)).not.toBeNull();
    expect(counts.outboxExpired).toBe(1);
    expect(counts.auditAnonymized).toBe(1);

    const audit = await service.auditLog();
    const anonymized = audit.find((event) => event.id === "old-audit");
    expect(anonymized?.candidateId).toBeNull();
    expect(anonymized?.detail).toEqual({ anonymized: true });
  });

  it("retentionCleanup honours dispute hold (override the G6 schedule)", async () => {
    const { service, store } = buildService();
    const role = await service.createRole({
      title: "Engineer",
      requirements: ["TS"],
    });

    const disputed = await service.createCandidate({
      roleId: role.id,
      name: "Disputed",
      email: "disputed@example.com",
      resumeText: "TS.",
    });
    await service.reviewCandidate(disputed.id, {
      approved: true,
      reviewer: "hr-manager",
    });

    const disputedCandidate = (await store.candidates.get(disputed.id))!;
    await store.candidates.update({
      ...disputedCandidate,
      review: {
        ...disputedCandidate.review!,
        decidedAt: "2025-08-01T00:00:00.000Z",
      },
    });
    await store.audit.append({
      id: "disputed-audit",
      candidateId: disputed.id,
      action: "candidate.reviewed",
      detail: { approved: true },
      at: "2025-08-01T00:00:00.000Z",
    });
    await service.raiseDispute(disputed.id, { note: "tribunal claim" });

    const tinySchedule: RetentionSchedule = {
      candidatesMs: 100 * 24 * 60 * 60 * 1000,
      auditMs: 100 * 24 * 60 * 60 * 1000,
      outboxMs: 1 * 24 * 60 * 60 * 1000,
    };
    const counts = await service.retentionCleanup(tinySchedule);

    expect(counts.candidatesDeleted).toBe(0);
    expect(counts.candidatesHeld).toBe(1);
    expect(await service.getCandidate(disputed.id)).not.toBeNull();

    const audit = await service.auditLog();
    const held = audit.find((event) => event.id === "disputed-audit");
    expect(held?.candidateId).toBe(disputed.id);
    expect(held?.detail).toEqual({ approved: true });

    await service.resolveDispute(disputed.id);
    const afterResolve = await service.retentionCleanup(tinySchedule);
    const resolvedHeld = (await store.candidates.get(disputed.id))!;
    expect(resolvedHeld.dispute?.resolvedAt).not.toBeNull();
    expect(afterResolve.candidatesHeld).toBeGreaterThan(0);
  });
});

describe("Scorecards", () => {
  it("creates and retrieves scorecards", async () => {
    const { service } = buildService();
    const role = await service.createRole({
      title: "Frontend Dev",
      requirements: ["React"],
    });
    const candidate = await service.createCandidate({
      roleId: role.id,
      name: "Alice",
      email: "alice@test.com",
      resumeText: "React dev",
    });

    const scorecard = await service.createScorecard(
      candidate.id,
      "reviewer-1",
      "Jane",
      [
        { questionId: "q1", score: 85, comment: "Strong skills" },
        { questionId: "q2", score: 70 },
      ],
    );

    expect(scorecard.id).toBeTruthy();
    expect(scorecard.candidateId).toBe(candidate.id);
    expect(scorecard.overallScore).toBe(77.5);

    const retrieved = await service.getScorecard(scorecard.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.overallScore).toBe(77.5);

    const byCandidate = await service.getScorecardsByCandidate(candidate.id);
    expect(byCandidate.length).toBe(1);

    const overall = await service.getOverallScore(candidate.id);
    expect(overall).toBe(77.5);
  });

  it("returns null for candidate with no scorecards", async () => {
    const { service } = buildService();
    expect(await service.getOverallScore("nonexistent")).toBeNull();
    expect(await service.getScorecardsByCandidate("nonexistent")).toEqual([]);
  });
});

describe("Capacity Metrics", () => {
  it("returns metrics for roles and candidates", async () => {
    const { service } = buildService();
    const role = await service.createRole({
      title: "Backend Dev",
      requirements: ["Node.js"],
    });
    await service.createCandidate({
      roleId: role.id,
      name: "Bob",
      email: "bob@test.com",
      resumeText: "Node.js dev",
    });
    await service.createCandidate({
      roleId: role.id,
      name: "Carol",
      email: "carol@test.com",
      resumeText: "Node.js dev",
    });

    const metrics = await service.getCapacityMetrics();
    expect(metrics.roles.length).toBe(1);
    expect(metrics.roles[0]?.title).toBe("Backend Dev");
    expect(metrics.roles[0]?.candidatesInPipeline).toBe(2);
    expect(metrics.overall.totalCandidates).toBe(2);
    expect(metrics.overall.pendingReview).toBe(2);
  });
});

describe("CSV Import/Export", () => {
  it("imports candidates from CSV", async () => {
    const { service } = buildService();
    const role = await service.createRole({
      title: "Designer",
      requirements: ["Figma"],
    });
    const csv = `name,email,roleId\nDave,dave@test.com,${role.id}\nEve,eve@test.com,${role.id}`;
    const result = await service.importCandidatesFromCsv(csv);
    expect(result.imported).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it("exports candidates to CSV", async () => {
    const { service } = buildService();
    const role = await service.createRole({
      title: "PM",
      requirements: ["Agile"],
    });
    await service.createCandidate({
      roleId: role.id,
      name: "Frank",
      email: "frank@test.com",
      resumeText: "PM",
    });
    const csv = await service.exportCandidatesToCsv();
    expect(csv).toContain("name,email,status");
    expect(csv).toContain("frank@test.com");
  });
});

describe("Role profile fields", () => {
  it("createRole trims, dedupes (case-insensitive) and caps skills", async () => {
    const { service } = buildService();
    const role = await service.createRole({
      title: "Founding Engineer",
      requirements: ["TypeScript"],
      skills: ["TypeScript", " typescript ", "AI", "", "   ", "Node.js", "ai"],
    });
    expect(role.skills).toEqual(["TypeScript", "AI", "Node.js"]);
    expect(role.budgetCurrency).toBe("USD");
    expect(role.updatedAt).toBeTruthy();
  });

  it("createRole caps skills at 30 items", async () => {
    const { service } = buildService();
    const skills = Array.from({ length: 40 }, (_, i) => `skill-${i}`);
    const role = await service.createRole({
      title: "Broad",
      requirements: ["TypeScript"],
      skills,
    });
    expect(role.skills).toHaveLength(30);
  });

  it("createRole validates experience and budget ranges", async () => {
    const { service } = buildService();
    await expect(
      service.createRole({
        title: "Founding Engineer",
        requirements: ["TypeScript"],
        experienceMinYears: 8,
        experienceMaxYears: 2,
      }),
    ).rejects.toThrow(/experienceMinYears/);

    await expect(
      service.createRole({
        title: "Founding Engineer",
        requirements: ["TypeScript"],
        budgetMin: 100,
        budgetMax: 50,
      }),
    ).rejects.toThrow(/budgetMin/);

    await expect(
      service.createRole({
        title: "Founding Engineer",
        requirements: ["TypeScript"],
        budgetMin: -5,
      }),
    ).rejects.toThrow(/budgetMin/);
  });

  it("updateRole merges fields, sets updatedAt and appends role.updated audit", async () => {
    const { service, store } = buildService();
    const role = await service.createRole({
      title: "Founding Engineer",
      requirements: ["TypeScript", "AI"],
    });

    const updated = await service.updateRole(role.id, {
      title: "Staff Engineer",
      skills: ["TypeScript", "Kubernetes"],
      experienceMinYears: 5,
      experienceMaxYears: 12,
      budgetMin: 90000,
      budgetMax: 140000,
      budgetCurrency: "eur",
    });

    expect(updated.id).toBe(role.id);
    expect(updated.title).toBe("Staff Engineer");
    expect(updated.requirements).toEqual(["TypeScript", "AI"]);
    expect(updated.skills).toEqual(["TypeScript", "Kubernetes"]);
    expect(updated.experienceMinYears).toBe(5);
    expect(updated.experienceMaxYears).toBe(12);
    expect(updated.budgetMin).toBe(90000);
    expect(updated.budgetMax).toBe(140000);
    expect(updated.budgetCurrency).toBe("EUR");
    expect(updated.createdAt).toBe(role.createdAt);
    expect(updated.updatedAt).toBeTruthy();

    const events = await store.audit.list();
    const updatedEvent = events.find((e) => e.action === "role.updated");
    expect(updatedEvent).toBeDefined();
    expect(updatedEvent?.detail).toMatchObject({
      roleId: role.id,
      title: "Staff Engineer",
    });
    const detail = updatedEvent?.detail as { changed: string[] };
    expect(detail.changed).toContain("title");
    expect(detail.changed).toContain("skills");

    const partial = await service.updateRole(role.id, {
      budgetCurrency: "GBP",
    });
    expect(partial.title).toBe("Staff Engineer");
    expect(partial.skills).toEqual(["TypeScript", "Kubernetes"]);
    expect(partial.budgetCurrency).toBe("GBP");
  });

  it("updateRole throws not-found for unknown ids", async () => {
    const { service } = buildService();
    await expect(
      service.updateRole("does-not-exist", { title: "Nope" }),
    ).rejects.toThrow(/not found/);
  });

  it("updateRole rejects invalid values", async () => {
    const { service } = buildService();
    const role = await service.createRole({
      title: "Founding Engineer",
      requirements: ["TypeScript"],
      experienceMinYears: 1,
      experienceMaxYears: 10,
    });
    await expect(
      service.updateRole(role.id, { experienceMinYears: 12 }),
    ).rejects.toThrow(/experienceMinYears/);
    await expect(
      service.updateRole(role.id, { budgetMin: 200, budgetMax: 100 }),
    ).rejects.toThrow(/budgetMin/);
  });

  it("updateScorecard merges, recomputes overallScore and appends audit", async () => {
    const { service, store } = buildService();
    const role = await service.createRole({
      title: "Frontend Dev",
      requirements: ["React"],
    });
    const candidate = await service.createCandidate({
      roleId: role.id,
      name: "Alice",
      email: "alice@test.com",
      resumeText: "React dev",
    });
    const scorecard = await service.createScorecard(
      candidate.id,
      "reviewer-1",
      "Jane",
      [
        { questionId: "q1", score: 4 },
        { questionId: "q2", score: 2 },
      ],
    );

    const updated = await service.updateScorecard(scorecard.id, {
      reviewerName: "John",
      answers: [
        { questionId: "q1", score: 5, comment: "Strong skills" },
        { questionId: "q2", score: 3 },
        { questionId: "q3", score: 4 },
      ],
    });
    expect(updated.reviewerName).toBe("John");
    expect(updated.overallScore).toBe(4);
    expect(updated.answers).toHaveLength(3);
    expect(updated.updatedAt).toBeTruthy();

    const events = await store.audit.list();
    const submitted = events.find((e) => e.action === "scorecard.updated");
    expect(submitted?.detail).toMatchObject({
      scorecardId: scorecard.id,
      candidateId: candidate.id,
      overallScore: 4,
    });

    await expect(
      service.updateScorecard("missing", { reviewerName: "Jane" }),
    ).rejects.toThrow(/not found/);
    await expect(
      service.updateScorecard(scorecard.id, {
        answers: [{ questionId: "q1", score: 9 }],
      }),
    ).rejects.toThrow(/score/);
  });
});

async function buildTenantService() {
  const built = buildService();
  const tenant = await built.service.createTenant({ name: "Acme" });
  return {
    ...built,
    tenant,
    run: <T>(fn: () => Promise<T>) => tenantContext.run(tenant.id, fn),
  };
}

describe("Tenant settings", () => {
  it("createTenant applies default settings", async () => {
    const { service } = buildService();
    const tenant = await service.createTenant({ name: "Acme" });
    expect(tenant.settings).toBeDefined();
    expect(tenant.settings?.workflowStages).toEqual([
      "sourcing",
      "screening",
      "interview",
      "offer",
      "onboarding",
    ]);
    expect(tenant.settings?.dataResidency).toBe("GLOBAL");
    expect(tenant.settings?.aiComplianceMode).toBe("standard");
  });

  it("updateTenantSettings validates input and rejects unknown tenants", async () => {
    const { service } = buildService();
    const tenant = await service.createTenant({ name: "Acme" });

    await expect(
      service.updateTenantSettings(tenant.id, { workflowStages: [] }),
    ).rejects.toThrow(/workflowStages/);
    await expect(
      service.updateTenantSettings(tenant.id, { workflowStages: ["  "] }),
    ).rejects.toThrow(/workflowStages/);
    await expect(
      service.updateTenantSettings(tenant.id, {
        dataResidency: "MARS" as never,
      }),
    ).rejects.toThrow(/dataResidency/);
    await expect(
      service.updateTenantSettings(tenant.id, {
        aiComplianceMode: "loose" as never,
      }),
    ).rejects.toThrow(/aiComplianceMode/);
    await expect(
      service.updateTenantSettings("missing", {
        dataResidency: "EU",
      }),
    ).rejects.toThrow(/not found/);
  });

  it("updateTenantSettings merges changes, bumps updatedAt and audits", async () => {
    const { service, store } = buildService();
    const tenant = await service.createTenant({ name: "Acme" });
    const updated = await service.updateTenantSettings(tenant.id, {
      dataResidency: "EU",
      workflowStages: ["sourcing", "offer"],
      aiComplianceMode: "strict",
    });
    expect(updated.settings?.dataResidency).toBe("EU");
    expect(updated.settings?.aiComplianceMode).toBe("strict");
    expect(updated.settings?.workflowStages).toEqual(["sourcing", "offer"]);

    const events = await store.audit.list();
    const event = events.find((e) => e.action === "tenant.settings_updated");
    expect(event).toBeDefined();
    const detail = event?.detail as { tenantId: string; changed: string[] };
    expect(detail.tenantId).toBe(tenant.id);
    expect(detail.changed).toContain("dataResidency");
    expect(detail.changed).toContain("workflowStages");
  });
});

describe("User access (RBAC)", () => {
  it("createUserAccess validates email/role and rejects duplicates", async () => {
    const { service, run } = await buildTenantService();

    const user = await run(() =>
      service.createUserAccess({
        email: "  Ada@Example.COM ",
        role: "hr_admin",
      }),
    );
    expect(user.email).toBe("ada@example.com");
    expect(user.role).toBe("hr_admin");

    await expect(
      run(() =>
        service.createUserAccess({
          email: "ada@example.com",
          role: "recruiter",
        }),
      ),
    ).rejects.toThrow(/already has access/);
    await expect(
      run(() =>
        service.createUserAccess({ email: "not-an-email", role: "recruiter" }),
      ),
    ).rejects.toThrow(/valid email/);
    await expect(
      run(() =>
        service.createUserAccess({
          email: "bob@example.com",
          role: "superuser" as never,
        }),
      ),
    ).rejects.toThrow(/role must be one of/);
  });

  it("updateUserAccess changes the role, deleteUserAccess removes it, getUserRole reads the first row", async () => {
    const { service, run } = await buildTenantService();
    const user = await run(() =>
      service.createUserAccess({ email: "ada@example.com", role: "recruiter" }),
    );

    await expect(
      run(() => service.updateUserAccess("missing", { role: "hr_admin" })),
    ).rejects.toThrow(/not found/);

    const updated = await run(() =>
      service.updateUserAccess(user.id, { role: "hr_admin" }),
    );
    expect(updated.role).toBe("hr_admin");

    expect(await run(() => service.getUserRole())).toBe("hr_admin");

    const users = await run(() => service.listUserAccess());
    expect(users).toHaveLength(1);

    await expect(
      run(() => service.deleteUserAccess("missing")),
    ).rejects.toThrow(/not found/);

    await run(() => service.deleteUserAccess(user.id));
    expect(await run(() => service.listUserAccess())).toHaveLength(0);
    expect(await run(() => service.getUserRole())).toBeNull();
  });
});

describe("Policies", () => {
  it("createPolicy validates input, version starts at 1, updatePolicy bumps version on content change", async () => {
    const { service, run, store } = await buildTenantService();

    await expect(
      run(() =>
        service.createPolicy({ title: "  ", category: "hiring", content: "x" }),
      ),
    ).rejects.toThrow(/title is required/);
    await expect(
      run(() =>
        service.createPolicy({
          title: "Title",
          category: "nope" as never,
          content: "x",
        }),
      ),
    ).rejects.toThrow(/category must be one of/);
    await expect(
      run(() =>
        service.createPolicy({
          title: "Title",
          category: "hiring",
          content: "",
        }),
      ),
    ).rejects.toThrow(/content is required/);

    const policy = await run(() =>
      service.createPolicy({
        title: "AI disclosure policy",
        category: "ai_governance",
        content: "We disclose AI use.",
      }),
    );
    expect(policy.version).toBe(1);
    expect(policy.active).toBe(true);

    const bumped = await run(() =>
      service.updatePolicy(policy.id, {
        content: "We disclose AI use to all candidates.",
      }),
    );
    expect(bumped.version).toBe(2);
    expect(bumped.content).toBe("We disclose AI use to all candidates.");

    const same = await run(() =>
      service.updatePolicy(policy.id, {
        content: "We disclose AI use to all candidates.",
      }),
    );
    expect(same.version).toBe(2);

    const renamed = await run(() =>
      service.updatePolicy(policy.id, { title: "AI notice policy" }),
    );
    expect(renamed.version).toBe(2);
    expect(renamed.title).toBe("AI notice policy");

    const events = await store.audit.list();
    expect(events.map((e) => e.action)).toContain("policy.created");
    expect(events.map((e) => e.action)).toContain("policy.updated");
  });

  it("inactive policies are not counted as active; deletePolicy 404s for unknown ids", async () => {
    const { service, run } = await buildTenantService();
    const policy = await run(() =>
      service.createPolicy({
        title: "AI disclosure policy",
        category: "ai_governance",
        content: "We disclose AI use.",
      }),
    );
    await run(() => service.updatePolicy(policy.id, { active: false }));

    const check = await run(() => service.complianceCheck());
    expect(check.policiesActive).toBe(0);
    expect(check.policiesTotal).toBe(1);
    expect(check.flags).toContain("No active policies configured");

    await expect(run(() => service.deletePolicy("missing"))).rejects.toThrow(
      /not found/,
    );
    await run(() => service.deletePolicy(policy.id));
    expect(await run(() => service.listPolicies())).toHaveLength(0);
  });
});

describe("Compliance check", () => {
  it("flags strict mode with zero active policies", async () => {
    const { service, tenant, run } = await buildTenantService();
    await run(() =>
      service.updateTenantSettings(tenant.id, { aiComplianceMode: "strict" }),
    );
    const check = await run(() => service.complianceCheck());
    expect(check.complianceMode).toBe("strict");
    expect(check.policiesActive).toBe(0);
    expect(check.flags).toContain(
      "Strict AI compliance mode requires at least one active policy",
    );
  });

  it("flags strict mode when the AI disclosure rate is below 100%", async () => {
    const { service, store, tenant, run } = await buildTenantService();
    await run(() =>
      service.updateTenantSettings(tenant.id, { aiComplianceMode: "strict" }),
    );
    const role = await run(() =>
      service.createRole({
        title: "Founding Engineer",
        requirements: ["TypeScript"],
      }),
    );
    await run(() =>
      service.createCandidate({
        roleId: role.id,
        name: "Ada Lovelace",
        email: "ada@example.com",
        resumeText: "TypeScript.",
      }),
    );
    // Clear the notice that createCandidate sets so the rate drops below 1.0.
    const candidates = await run(() => service.listCandidates());
    for (const candidate of candidates) {
      await store.candidates.update({
        ...candidate,
        aiNoticeDisclosedAt: null,
      });
    }
    const check = await run(() => service.complianceCheck());
    expect(check.aiDisclosureRate).toBeLessThan(1);
    expect(check.flags).toContain(
      "Strict AI compliance mode requires 100% AI notice disclosure (currently 0%)",
    );
  });

  it("flags non-GLOBAL data residency", async () => {
    const { service, tenant, run } = await buildTenantService();
    await run(() =>
      service.updateTenantSettings(tenant.id, { dataResidency: "EU" }),
    );
    const check = await run(() => service.complianceCheck());
    expect(check.dataResidency).toBe("EU");
    expect(check.flags).toContain(
      "Data residency is set to EU — ensure vendor DPAs match this region",
    );
  });

  it("happy path: active policy + full disclosure + standard mode yields no flags", async () => {
    const { service, run } = await buildTenantService();
    const role = await run(() =>
      service.createRole({
        title: "Founding Engineer",
        requirements: ["TypeScript"],
      }),
    );
    await run(() =>
      service.createCandidate({
        roleId: role.id,
        name: "Ada Lovelace",
        email: "ada@example.com",
        resumeText: "TypeScript.",
      }),
    );
    await run(() =>
      service.createPolicy({
        title: "AI disclosure policy",
        category: "ai_governance",
        content: "We disclose AI use.",
      }),
    );

    const check = await run(() => service.complianceCheck());
    expect(check.policiesActive).toBe(1);
    expect(check.policiesTotal).toBe(1);
    expect(check.complianceMode).toBe("standard");
    expect(check.dataResidency).toBe("GLOBAL");
    expect(check.aiDisclosureRate).toBe(1);
    expect(check.disputesOpen).toBe(0);
    expect(check.disputesResolved).toBe(0);
    expect(check.workflowStages).toEqual([
      "sourcing",
      "screening",
      "interview",
      "offer",
      "onboarding",
    ]);
    expect(check.flags).toEqual([]);
  });

  it("evaluateCompliance is a pure function of (settings, candidates, policies)", () => {
    const check = evaluateCompliance(
      {
        workflowStages: ["sourcing"],
        dataResidency: "GLOBAL",
        aiComplianceMode: "standard",
        updatedAt: "2026-08-04T00:00:00.000Z",
      },
      [],
      [],
    );
    expect(check.policiesActive).toBe(0);
    expect(check.aiDisclosureRate).toBe(0);
    expect(check.flags).toEqual(["No active policies configured"]);
  });
});

describe("rankRole", () => {
  it("ranks screened candidates and excludes the rest", async () => {
    const { service } = buildService();
    const role = await service.createRole({
      title: "Engineer",
      requirements: ["TypeScript"],
    });
    const mk = (name: string) =>
      service.createCandidate({
        roleId: role.id,
        name,
        email: `${name}@x.io`,
        resumeText: "TypeScript expert",
        autoScreen: false,
      });
    const a = await mk("a");
    const b = await mk("b");
    const c = await mk("c");
    await service.screenCandidate(a.id);
    await service.screenCandidate(b.id);
    // c stays pending_screening → excluded
    const rank = await service.rankRole(role.id);
    expect(rank.roleTitle).toBe("Engineer");
    expect(rank.ranked.map((r) => r.candidateId).sort()).toEqual(
      [a.id, b.id].sort(),
    );
    expect(rank.excluded.map((e) => e.candidateId)).toEqual([c.id]);
    expect(rank.ranked[0]!.blendedScore).toBeGreaterThanOrEqual(
      rank.ranked[1]!.blendedScore,
    );
  });

  it("throws not found for unknown roles", async () => {
    const { service } = buildService();
    await expect(service.rankRole("missing")).rejects.toThrow(
      'role "missing" not found',
    );
  });
});
