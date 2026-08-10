import { describe, expect, it } from "vitest";
import { createReviewerApp } from "./app.js";
import { seedDemo } from "./seed.js";

const NOW = () => new Date("2026-08-04T00:00:00.000Z");

function build() {
  return createReviewerApp({ now: NOW });
}

async function createRoleAndCandidate(provider: "demo" = "demo") {
  const app = build();
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
    const app = build();
    const res = await app.server.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    await app.close();
  });

  it("serves the reviewer dashboard at /", async () => {
    const app = build();
    const res = await app.server.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain("Reviewer");
    expect(res.body).toContain("pending_review");
    await app.close();
  });

  it("creates a role", async () => {
    const app = build();
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
    const app = build();

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
    const app = build();
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
    const app = build();
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
    const app = build();
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
    const app = build();
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
    const app = build();
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
    const app = build();
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
});
