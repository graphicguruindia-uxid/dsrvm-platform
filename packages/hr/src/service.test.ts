import { describe, expect, it } from "vitest";
import { createGateway, createFakeProvider } from "@dsrvm/ai";
import { HrService } from "./service.js";
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
    expect(candidate.status).toBe("pending_screening");

    const acknowledged = await service.pendingOutbox();
    expect(acknowledged).toHaveLength(1);
    expect(acknowledged[0]?.type).toBe("candidate.acknowledged");

    const screened = await service.screenCandidate(candidate.id);
    expect(screened.status).toBe("pending_review");
    expect(screened.screening?.recommendation).toBe("advance");

    const approved = await service.reviewCandidate(candidate.id, {
      approved: true,
      reviewer: "hr-manager",
      note: "Looks great",
    });
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
    await service.screenCandidate(candidate.id);
    const rejected = await service.reviewCandidate(candidate.id, {
      approved: false,
      reviewer: "hr-manager",
    });
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
    await service.screenCandidate(candidate.id);

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
    await service.screenCandidate(old.id);
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
});
