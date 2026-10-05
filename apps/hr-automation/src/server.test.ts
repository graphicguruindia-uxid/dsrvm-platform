import { describe, expect, it } from "vitest";
import { createReviewerApp } from "./app.js";
import { seedDemo } from "./seed.js";

const NOW = () => new Date("2026-08-04T00:00:00.000Z");

async function build() {
  return await createReviewerApp({ now: NOW });
}

async function buildTenant() {
  const app = await build();
  const res = await app.server.inject({
    method: "POST",
    url: "/api/tenants",
    payload: { name: "Acme" },
  });
  const tenantId = res.json().tenant.id as string;
  return {
    app,
    tenantId,
    inject: (opts: {
      method: "GET" | "POST" | "PUT" | "DELETE";
      url: string;
      payload?: unknown;
    }) =>
      app.server.inject({
        ...opts,
        headers: { "x-tenant-id": tenantId },
      } as never),
  };
}

async function createRoleAndCandidate(provider: "demo" = "demo") {
  const app = await build();
  const roleRes = await app.server.inject({
    method: "POST",
    url: "/api/roles",
    payload: { title: "Founding Engineer", requirements: ["TypeScript", "AI"] },
  });
  const roleId = roleRes.json().role.id;
  const candidateRes = await app.server.inject({
    method: "POST",
    url: "/api/candidates",
    payload: {
      roleId,
      name: "Ada Lovelace",
      email: "ada@example.com",
      resumeText: "TypeScript expert with 8 years building AI platforms.",
    },
  });
  return { app, roleId, candidate: candidateRes.json().candidate };
}

describe("reviewer server", () => {
  it("exposes a health endpoint", async () => {
    const app = await build();
    const res = await app.server.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    await app.close();
  });

  it("serves the reviewer dashboard at /", async () => {
    const app = await build();
    const res = await app.server.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain("Reviewer");
    expect(res.body).toContain("pending_review");
    await app.close();
  });

  it("creates a role", async () => {
    const app = await build();
    const res = await app.server.inject({
      method: "POST",
      url: "/api/roles",
      payload: { title: "Founding Engineer", requirements: ["TypeScript"] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().role.title).toBe("Founding Engineer");
    await app.close();
  });

  it("intake + AI screening lands a candidate in the review queue", async () => {
    const { app, candidate } = await createRoleAndCandidate();
    expect(candidate.status).toBe("pending_review");
    expect(candidate.screening).not.toBeNull();
    expect(candidate.screening.score).toBeGreaterThanOrEqual(0);
    expect(candidate.screening.score).toBeLessThanOrEqual(100);
    expect(candidate.screening.recommendation).toMatch(
      /advance|needs_review|reject/,
    );

    const queue = await app.server.inject({
      method: "GET",
      url: "/api/candidates?status=pending_review",
    });
    expect(queue.json().candidates).toHaveLength(1);
    await app.close();
  });

  it("approve moves the candidate to approved, emits outbox + audit events", async () => {
    const { app, candidate } = await createRoleAndCandidate();
    const res = await app.server.inject({
      method: "POST",
      url: `/api/candidates/${candidate.id}/review`,
      payload: {
        approved: true,
        reviewer: "reviewer@dsrvm",
        note: "Looks strong",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().candidate.status).toBe("approved");
    expect(res.json().candidate.review.approved).toBe(true);
    expect(res.json().candidate.review.note).toBe("Looks strong");

    const pending = await app.hr.pendingOutbox();
    expect(pending.map((event) => event.type)).toContain("candidate.approved");
    expect(pending.map((event) => event.type)).toContain(
      "candidate.acknowledged",
    );

    const events = await app.hr.auditLog();
    expect(events.map((e) => e.action)).toContain("candidate.reviewed");
    await app.close();
  });

  it("reject moves the candidate to rejected and emits candidate.rejected", async () => {
    const { app, candidate } = await createRoleAndCandidate();
    const res = await app.server.inject({
      method: "POST",
      url: `/api/candidates/${candidate.id}/review`,
      payload: { approved: false, reviewer: "reviewer@dsrvm" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().candidate.status).toBe("rejected");

    const pending = await app.hr.pendingOutbox();
    expect(pending.map((event) => event.type)).toContain("candidate.rejected");
    await app.close();
  });

  it("validates payloads and guards transitions", async () => {
    const app = await build();

    const missingRole = await app.server.inject({
      method: "POST",
      url: "/api/candidates",
      payload: { name: "No Role", email: "x@example.com", resumeText: "..." },
    });
    expect(missingRole.statusCode).toBe(400);

    const unknownRole = await app.server.inject({
      method: "POST",
      url: "/api/candidates",
      payload: {
        roleId: "missing",
        name: "No Role",
        email: "x@example.com",
        resumeText: "...",
      },
    });
    expect(unknownRole.statusCode).toBe(404);

    const reviewMissing = await app.server.inject({
      method: "POST",
      url: "/api/candidates/missing/review",
      payload: { reviewer: "x" },
    });
    expect(reviewMissing.statusCode).toBe(400);

    const reviewUnknown = await app.server.inject({
      method: "POST",
      url: "/api/candidates/missing/review",
      payload: { approved: true, reviewer: "x" },
    });
    expect(reviewUnknown.statusCode).toBe(409);

    const missingCandidate = await app.server.inject({
      method: "GET",
      url: "/api/candidates/missing",
    });
    expect(missingCandidate.statusCode).toBe(404);
    await app.close();
  });

  it("R6: blocks review with 400 when the AI transparency notice was not disclosed", async () => {
    const app = await build();
    const roleRes = await app.server.inject({
      method: "POST",
      url: "/api/roles",
      payload: { title: "Engineer", requirements: ["TypeScript"] },
    });
    const roleId = roleRes.json().role.id;

    await app.store.candidates.create({
      id: "undisclosed-1",
      roleId,
      name: "No Notice",
      email: "no-notice@example.com",
      resumeText: "TS.",
      status: "pending_review",
      screening: {
        score: 80,
        recommendation: "advance",
        summary: "ok",
        strengths: ["TS"],
        flags: [],
        provider: "fake",
        model: "fake-v1",
        screenedAt: NOW().toISOString(),
      },
      review: null,
      aiNoticeDisclosedAt: null,
      dispute: null,
      enrichment: null,
      createdAt: NOW().toISOString(),
      updatedAt: NOW().toISOString(),
    });

    const res = await app.server.inject({
      method: "POST",
      url: "/api/candidates/undisclosed-1/review",
      payload: { approved: true, reviewer: "reviewer@dsrvm" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain(
      "has not been disclosed the AI transparency notice",
    );
    await app.close();
  });

  it("seedDemo populates a full review queue via the pipeline", async () => {
    const app = await build();
    const seeded = await seedDemo(app.hr);
    expect(seeded.candidateIds).toHaveLength(4);

    const queue = await app.server.inject({
      method: "GET",
      url: "/api/candidates?status=pending_review",
    });
    expect(queue.json().candidates).toHaveLength(4);

    const audit = await app.hr.auditLog();
    expect(audit.filter((e) => e.action === "candidate.screened")).toHaveLength(
      4,
    );
    await app.close();
  });

  it("imports candidates from csv and email via the ingest endpoint", async () => {
    const app = await build();
    const roleRes = await app.server.inject({
      method: "POST",
      url: "/api/roles",
      payload: { title: "Engineer", requirements: ["TypeScript"] },
    });
    const roleId = roleRes.json().role.id;

    const csv = [
      "name,email,resume",
      "Ada,ada@example.com,TypeScript expert",
      "Grace,grace@example.com,Cobol veteran",
      "Ada,ada@example.com,duplicate",
    ].join("\n");

    const csvRes = await app.server.inject({
      method: "POST",
      url: "/api/candidates/import",
      payload: { csv, defaultRoleId: roleId },
    });
    expect(csvRes.statusCode).toBe(201);
    expect(csvRes.json().result.imported).toBe(2);
    expect(csvRes.json().result.skipped).toBe(1);

    const email = [
      "From: Alan Turing <alan@example.com>",
      "Subject: Application: Engineer",
      "",
      "Cryptography and TypeScript for 10 years.",
    ].join("\n");
    const emailRes = await app.server.inject({
      method: "POST",
      url: "/api/candidates/import",
      payload: { email, defaultRoleId: roleId },
    });
    expect(emailRes.statusCode).toBe(201);
    expect(emailRes.json().result.imported).toBe(1);

    const candidates = await app.hr.listCandidates();
    expect(candidates).toHaveLength(3);
    expect(candidates.map((c) => c.email)).toContain("alan@example.com");
    await app.close();
  });

  it("exposes the DSRA-27 transparency notice at application confirmation", async () => {
    const { app, candidate } = await createRoleAndCandidate();
    const createRes = await app.server.inject({
      method: "POST",
      url: "/api/candidates",
      payload: {
        roleId: candidate.roleId,
        name: "Grace Hopper",
        email: "grace@example.com",
        resumeText: "Cobol and TypeScript.",
      },
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json();
    expect(created.notice).toBeDefined();
    expect(created.notice.version).toBe("v1");
    expect(created.notice.text).toContain("A human reviewer always makes");

    const outbox = await app.hr.pendingOutbox();
    const ack = outbox.find((event) => event.type === "candidate.acknowledged");
    expect(ack).toBeDefined();
    expect(
      (ack?.payload as { notice?: { version?: string } }).notice?.version,
    ).toBe("v1");

    const audit = await app.hr.auditLog();
    expect(
      audit.some(
        (event) =>
          event.action === "candidate.ai_notice" &&
          event.candidateId === created.candidate.id,
      ),
    ).toBe(true);
    await app.close();
  });

  it("keeps the transparency notice on every status email (no bypass)", async () => {
    const { app, candidate } = await createRoleAndCandidate();
    const res = await app.server.inject({
      method: "POST",
      url: `/api/candidates/${candidate.id}/review`,
      payload: { approved: true, reviewer: "reviewer@dsrvm" },
    });
    expect(res.statusCode).toBe(200);

    const outbox = await app.hr.pendingOutbox();
    for (const event of outbox) {
      expect(
        (event.payload as { notice?: { version?: string } }).notice?.version,
      ).toBe("v1");
    }
    await app.close();
  });

  it("covers imported candidates with the notice too (no bypass via ingest)", async () => {
    const app = await build();
    const roleRes = await app.server.inject({
      method: "POST",
      url: "/api/roles",
      payload: { title: "Engineer", requirements: ["TypeScript"] },
    });
    const roleId = roleRes.json().role.id;

    const csvRes = await app.server.inject({
      method: "POST",
      url: "/api/candidates/import",
      payload: {
        csv: "name,email,resume\nImport One,import1@example.com,TypeScript\nImport Two,import2@example.com,Python",
        defaultRoleId: roleId,
      },
    });
    expect(csvRes.statusCode).toBe(201);
    expect(csvRes.json().result.imported).toBe(2);

    const outbox = await app.hr.pendingOutbox();
    const acks = outbox.filter(
      (event) => event.type === "candidate.acknowledged",
    );
    expect(acks).toHaveLength(2);
    for (const ack of acks) {
      expect(
        (ack.payload as { notice?: { version?: string } }).notice?.version,
      ).toBe("v1");
    }

    const audit = await app.hr.auditLog();
    expect(
      audit.filter((event) => event.action === "candidate.ai_notice"),
    ).toHaveLength(2);
    await app.close();
  });

  it("exposes the G6 retention cleanup endpoint", async () => {
    const app = await build();
    const res = await app.server.inject({
      method: "POST",
      url: "/api/retention/cleanup",
    });
    expect(res.statusCode).toBe(200);
    const counts = res.json().counts;
    expect(counts).toMatchObject({
      candidatesDeleted: 0,
      auditAnonymized: 0,
      outboxExpired: 0,
    });
    await app.close();
  });

  it("rejects an import request with neither csv nor email", async () => {
    const app = await build();
    const res = await app.server.inject({
      method: "POST",
      url: "/api/candidates/import",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("exposes pipeline + AI usage telemetry for pricing feedback", async () => {
    const { app, candidate } = await createRoleAndCandidate();

    const reviewRes = await app.server.inject({
      method: "POST",
      url: `/api/candidates/${candidate.id}/review`,
      payload: { approved: true, reviewer: "reviewer@dsrvm" },
    });
    expect(reviewRes.statusCode).toBe(200);

    const res = await app.server.inject({
      method: "GET",
      url: "/api/telemetry",
    });
    expect(res.statusCode).toBe(200);
    const report = res.json();

    expect(report.pipeline["pipeline.candidate.created"]).toBe(1);
    const screenedTotal = Object.entries(report.pipeline)
      .filter(([key]) => key.startsWith("pipeline.candidate.screened"))
      .reduce((sum, [, value]) => sum + (value as number), 0);
    expect(screenedTotal).toBe(1);
    expect(
      report.pipeline["pipeline.candidate.reviewed{outcome=approved}"],
    ).toBe(1);

    expect(report.usage.calls).toBe(1);
    expect(report.usage.inputTokens).toBeGreaterThan(0);
    expect(report.usage.byModel["demo-v1"]?.calls).toBe(1);
    expect(report.usage.byTag.task?.screening?.calls).toBe(1);
    expect(report.generatedAt).toBe(NOW().toISOString());
    await app.close();
  });

  it("POST /api/roles accepts skills as a comma-separated string and echoes budget/experience", async () => {
    const app = await build();
    const res = await app.server.inject({
      method: "POST",
      url: "/api/roles",
      payload: {
        title: "Founding Engineer",
        requirements: ["TypeScript"],
        skills: "TypeScript, AI, Node.js,typescript",
        experienceMinYears: 2,
        experienceMaxYears: 8,
        budgetMin: 80000,
        budgetMax: 120000,
        budgetCurrency: "USD",
      },
    });
    expect(res.statusCode).toBe(201);
    const { role } = res.json();
    expect(role.skills).toEqual(["TypeScript", "AI", "Node.js"]);
    expect(role.experienceMinYears).toBe(2);
    expect(role.experienceMaxYears).toBe(8);
    expect(role.budgetMin).toBe(80000);
    expect(role.budgetMax).toBe(120000);
    expect(role.budgetCurrency).toBe("USD");
    expect(role.updatedAt).toBeTruthy();
    await app.close();
  });

  it("POST /api/roles rejects invalid experience and budget ranges", async () => {
    const app = await build();
    const yearsRes = await app.server.inject({
      method: "POST",
      url: "/api/roles",
      payload: {
        title: "Founding Engineer",
        requirements: ["TypeScript"],
        experienceMinYears: 8,
        experienceMaxYears: 2,
      },
    });
    expect(yearsRes.statusCode).toBe(400);
    expect(yearsRes.json().error).toContain("experienceMinYears");

    const budgetRes = await app.server.inject({
      method: "POST",
      url: "/api/roles",
      payload: {
        title: "Founding Engineer",
        requirements: ["TypeScript"],
        budgetMin: 120000,
        budgetMax: 80000,
      },
    });
    expect(budgetRes.statusCode).toBe(400);
    expect(budgetRes.json().error).toContain("budgetMin");
    await app.close();
  });

  it("PUT /api/roles/:id updates role fields and 404s for unknown ids", async () => {
    const { app, roleId } = await createRoleAndCandidate();
    const res = await app.server.inject({
      method: "PUT",
      url: `/api/roles/${roleId}`,
      payload: {
        title: "Staff Engineer",
        skills: "TypeScript, Kubernetes",
        experienceMinYears: 5,
        experienceMaxYears: 12,
        budgetCurrency: "EUR",
      },
    });
    expect(res.statusCode).toBe(200);
    const { role } = res.json();
    expect(role.id).toBe(roleId);
    expect(role.title).toBe("Staff Engineer");
    expect(role.skills).toEqual(["TypeScript", "Kubernetes"]);
    expect(role.experienceMinYears).toBe(5);
    expect(role.experienceMaxYears).toBe(12);
    expect(role.budgetCurrency).toBe("EUR");

    const unknown = await app.server.inject({
      method: "PUT",
      url: "/api/roles/does-not-exist",
      payload: { title: "Nope" },
    });
    expect(unknown.statusCode).toBe(404);
    await app.close();
  });

  it("PATCH /api/scorecards/:id recomputes overallScore and 404s for unknown ids", async () => {
    const { app, candidate } = await createRoleAndCandidate();
    const submit = await app.server.inject({
      method: "POST",
      url: "/api/scorecards",
      payload: {
        candidateId: candidate.id,
        reviewerName: "Jane",
        answers: [
          { questionId: "q1", score: 4 },
          { questionId: "q2", score: 2 },
        ],
      },
    });
    expect(submit.statusCode).toBe(201);
    const scorecardId = submit.json().scorecard.id;

    const patch = await app.server.inject({
      method: "PATCH",
      url: `/api/scorecards/${scorecardId}`,
      payload: {
        reviewerName: "John",
        answers: [
          { questionId: "q1", score: 5, comment: "excellent" },
          { questionId: "q2", score: 3 },
          { questionId: "q3", score: 4 },
        ],
      },
    });
    expect(patch.statusCode).toBe(200);
    const { scorecard } = patch.json();
    expect(scorecard.reviewerName).toBe("John");
    expect(scorecard.overallScore).toBe(4);
    expect(scorecard.answers).toHaveLength(3);

    const unknown = await app.server.inject({
      method: "PATCH",
      url: "/api/scorecards/does-not-exist",
      payload: { reviewerName: "Jane" },
    });
    expect(unknown.statusCode).toBe(404);

    const invalid = await app.server.inject({
      method: "PATCH",
      url: `/api/scorecards/${scorecardId}`,
      payload: {
        answers: [{ questionId: "q1", score: 9 }],
      },
    });
    expect(invalid.statusCode).toBe(400);
    await app.close();
  });

  it("records candidate.screened, candidate.reviewed, and scorecard.submitted in the audit log", async () => {
    const { app, candidate } = await createRoleAndCandidate();
    const events = await app.hr.auditLog();
    expect(events.map((e) => e.action)).toContain("candidate.screened");
    const screened = events.find((e) => e.action === "candidate.screened");
    const screenedDetail = screened?.detail as Record<string, unknown>;
    expect(typeof screenedDetail.score).toBe("number");
    expect(["advance", "reject", "needs_review"]).toContain(
      screenedDetail.recommendation,
    );
    expect(screenedDetail.provider).toBeTruthy();
    expect(screenedDetail.model).toBeTruthy();
    expect(screenedDetail.roleId).toBeTruthy();

    const reviewRes = await app.server.inject({
      method: "POST",
      url: `/api/candidates/${candidate.id}/review`,
      payload: { approved: true, reviewer: "reviewer@dsrvm" },
    });
    expect(reviewRes.statusCode).toBe(200);

    const submit = await app.server.inject({
      method: "POST",
      url: "/api/scorecards",
      payload: {
        candidateId: candidate.id,
        reviewerName: "Jane",
        answers: [{ questionId: "q1", score: 4 }],
      },
    });
    expect(submit.statusCode).toBe(201);

    const after = await app.hr.auditLog();
    const actions = after.map((e) => e.action);
    expect(actions).toContain("candidate.reviewed");
    const reviewed = after.find((e) => e.action === "candidate.reviewed");
    expect(reviewed?.detail).toMatchObject({
      approved: true,
      reviewer: "reviewer@dsrvm",
      previousStatus: "pending_review",
      newStatus: "approved",
    });
    expect(actions).toContain("scorecard.submitted");
    const submitted = after.find((e) => e.action === "scorecard.submitted");
    expect(submitted?.detail).toMatchObject({
      candidateId: candidate.id,
      overallScore: 4,
    });
    await app.close();
  });
});

describe("tenant settings, user access, policies, compliance", () => {
  it("PUT /api/tenants/:id/settings returns the full tenant, rejects bad residency and unknown tenants", async () => {
    const { app, tenantId, inject } = await buildTenant();

    const put = await inject({
      method: "PUT",
      url: `/api/tenants/${tenantId}/settings`,
      payload: {
        workflowStages: ["sourcing", "interview"],
        dataResidency: "EU",
        aiComplianceMode: "strict",
      },
    });
    expect(put.statusCode).toBe(200);
    const { tenant } = put.json();
    expect(tenant.id).toBe(tenantId);
    expect(tenant.settings.workflowStages).toEqual(["sourcing", "interview"]);
    expect(tenant.settings.dataResidency).toBe("EU");
    expect(tenant.settings.aiComplianceMode).toBe("strict");

    const bad = await inject({
      method: "PUT",
      url: `/api/tenants/${tenantId}/settings`,
      payload: { dataResidency: "MARS" },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toContain("dataResidency");

    const unknown = await app.server.inject({
      method: "PUT",
      url: "/api/tenants/does-not-exist/settings",
      payload: { dataResidency: "EU" },
      headers: { "x-tenant-id": tenantId },
    });
    expect(unknown.statusCode).toBe(404);

    const get = await inject({
      method: "GET",
      url: `/api/tenants/${tenantId}/settings`,
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().settings.dataResidency).toBe("EU");

    await app.close();
  });

  it("user access lifecycle: create, list, update role, delete, /api/me/access", async () => {
    const { app, inject } = await buildTenant();

    const created = await inject({
      method: "POST",
      url: "/api/user-access",
      payload: { email: "ada@example.com", role: "recruiter" },
    });
    expect(created.statusCode).toBe(201);
    const userId = created.json().user.id as string;
    expect(created.json().user.role).toBe("recruiter");

    const dup = await inject({
      method: "POST",
      url: "/api/user-access",
      payload: { email: "ada@example.com", role: "executive" },
    });
    expect(dup.statusCode).toBe(400);
    expect(dup.json().error).toContain("already has access");

    const list = await inject({ method: "GET", url: "/api/user-access" });
    expect(list.json().users).toHaveLength(1);

    const roleRes = await inject({
      method: "GET",
      url: "/api/me/access",
    });
    expect(roleRes.statusCode).toBe(200);
    expect(roleRes.json().role).toBe("recruiter");

    const updated = await inject({
      method: "PUT",
      url: `/api/user-access/${userId}`,
      payload: { role: "hr_admin" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().user.role).toBe("hr_admin");

    const afterRole = await inject({ method: "GET", url: "/api/me/access" });
    expect(afterRole.json().role).toBe("hr_admin");

    const deleted = await inject({
      method: "DELETE",
      url: `/api/user-access/${userId}`,
    });
    expect(deleted.statusCode).toBe(204);
    expect(deleted.body).toBe("");

    const empty = await inject({ method: "GET", url: "/api/user-access" });
    expect(empty.json().users).toHaveLength(0);

    const nullRole = await inject({ method: "GET", url: "/api/me/access" });
    expect(nullRole.json().role).toBeNull();

    await app.close();
  });

  it("policy lifecycle: create, bump version on content change, delete", async () => {
    const { app, inject } = await buildTenant();

    const created = await inject({
      method: "POST",
      url: "/api/policies",
      payload: {
        title: "AI disclosure policy",
        category: "ai_governance",
        content: "We disclose AI use.",
      },
    });
    expect(created.statusCode).toBe(201);
    const policyId = created.json().policy.id as string;
    expect(created.json().policy.version).toBe(1);
    expect(created.json().policy.active).toBe(true);

    const bumped = await inject({
      method: "PUT",
      url: `/api/policies/${policyId}`,
      payload: { content: "We disclose AI use to all candidates." },
    });
    expect(bumped.statusCode).toBe(200);
    expect(bumped.json().policy.version).toBe(2);

    const deleted = await inject({
      method: "DELETE",
      url: `/api/policies/${policyId}`,
    });
    expect(deleted.statusCode).toBe(204);
    expect(deleted.body).toBe("");

    const list = await inject({ method: "GET", url: "/api/policies" });
    expect(list.json().policies).toHaveLength(0);

    await app.close();
  });

  it("GET /api/compliance/dashboard returns the compliance summary", async () => {
    const { app, inject } = await buildTenant();

    const res = await inject({
      method: "GET",
      url: "/api/compliance/dashboard",
    });
    expect(res.statusCode).toBe(200);
    const { compliance } = res.json();
    expect(compliance).toEqual({
      policiesActive: 0,
      policiesTotal: 0,
      complianceMode: "standard",
      dataResidency: "GLOBAL",
      aiDisclosureRate: 0,
      disputesOpen: 0,
      disputesResolved: 0,
      workflowStages: [
        "sourcing",
        "screening",
        "interview",
        "offer",
        "onboarding",
      ],
      flags: ["No active policies configured"],
    });

    await inject({
      method: "POST",
      url: "/api/policies",
      payload: {
        title: "AI disclosure policy",
        category: "ai_governance",
        content: "We disclose AI use.",
      },
    });

    const withPolicy = await inject({
      method: "GET",
      url: "/api/compliance/dashboard",
    });
    expect(withPolicy.json().compliance.policiesActive).toBe(1);
    expect(withPolicy.json().compliance.flags).toEqual([]);

    await app.close();
  });
});
