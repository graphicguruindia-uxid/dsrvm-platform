import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { createGateway, createFakeProvider } from "@dsrvm/ai";
import { HrService } from "../service.js";
import { createScreeningEngine } from "../screening.js";
import { createOutboxDispatcher } from "../outbox.js";
import type { Store } from "../store.js";
import { createPgStore, type HrDatabase } from "./pg-store.js";

const AT = "2026-08-04T00:00:00.000Z";

const DDL = `
CREATE TABLE roles (
  id text PRIMARY KEY,
  title text NOT NULL,
  requirements jsonb NOT NULL,
  nice_to_have jsonb NOT NULL,
  created_at text NOT NULL
);
CREATE TABLE candidates (
  id text PRIMARY KEY,
  role_id text NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  resume_text text NOT NULL,
  status text NOT NULL,
  screening jsonb,
  review jsonb,
  ai_notice_disclosed_at text,
  dispute jsonb,
  created_at text NOT NULL,
  updated_at text NOT NULL
);
CREATE TABLE audit_events (
  id text PRIMARY KEY,
  candidate_id text,
  action text NOT NULL,
  detail jsonb NOT NULL,
  at text NOT NULL
);
CREATE TABLE outbox_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  candidate_id text NOT NULL,
  payload jsonb NOT NULL,
  at text NOT NULL,
  dispatched_at text,
  claimed_until text
);
CREATE INDEX outbox_pending_idx ON outbox_events (dispatched_at);
CREATE INDEX outbox_candidate_idx ON outbox_events (candidate_id);
`;

function buildService(store: Store) {
  const gateway = createGateway(
    [
      createFakeProvider({
        name: "fake",
        echo: false,
        output: JSON.stringify({
          score: 80,
          recommendation: "advance",
          summary: "Meets the core requirements.",
          strengths: ["TypeScript", "AI integration"],
          flags: [],
        }),
      }),
    ],
    { activeProvider: "fake" },
  );
  return new HrService({
    store,
    screeningEngine: createScreeningEngine(gateway),
    now: () => new Date(AT),
  });
}

async function createTestDb(): Promise<{
  store: Store;
  db: HrDatabase;
  pg: PGlite;
}> {
  const pg = new PGlite();
  await pg.exec(DDL);
  const db = drizzle(pg) as unknown as HrDatabase;
  return { store: createPgStore(db), db, pg };
}

describe("PgStore persistence (pglite)", () => {
  const instances: PGlite[] = [];
  let pg: PGlite;
  let store: Store;

  beforeEach(async () => {
    ({ store, pg } = await createTestDb());
    instances.push(pg);
  });

  afterAll(async () => {
    for (const instance of instances) {
      await instance.close();
    }
  });

  it("runs the full pipeline and round-trips jsonb through real Postgres", async () => {
    const service = buildService(store);

    const role = await service.createRole({
      title: "Founding Engineer",
      requirements: ["TypeScript", "AI integration"],
      niceToHave: ["Postgres"],
    });
    expect(role.requirements).toEqual(["TypeScript", "AI integration"]);

    const candidate = await service.createCandidate({
      roleId: role.id,
      name: "Ada Lovelace",
      email: "ada@example.com",
      resumeText: "TypeScript and LLM pipelines for 8 years.",
    });

    const screened = await service.screenCandidate(candidate.id);
    expect(screened.status).toBe("pending_review");
    expect(screened.aiNoticeDisclosedAt).toBe(AT);
    expect(screened.screening?.recommendation).toBe("advance");
    expect(screened.screening?.strengths).toEqual([
      "TypeScript",
      "AI integration",
    ]);

    const approved = await service.reviewCandidate(candidate.id, {
      approved: true,
      reviewer: "hr-manager",
      note: "Looks great",
    });
    expect(approved.status).toBe("approved");

    const audit = await service.auditLog();
    expect(audit.map((event) => event.action)).toEqual([
      "role.created",
      "candidate.created",
      "candidate.ai_notice",
      "candidate.screened",
      "candidate.reviewed",
    ]);

    const pending = await service.pendingOutbox();
    expect(pending.map((event) => event.type)).toEqual([
      "candidate.acknowledged",
      "candidate.approved",
    ]);
    const approvedEvent = pending.find(
      (event) => event.type === "candidate.approved",
    )!;
    expect(approvedEvent.payload).toMatchObject({
      candidateId: candidate.id,
      name: "Ada Lovelace",
      email: "ada@example.com",
      roleId: role.id,
      approved: true,
    });
    expect(
      (approvedEvent.payload as { notice?: { version?: string } }).notice
        ?.version,
    ).toBe("v1");
  });

  it("persists across store instances (survives reconnect)", async () => {
    const service = buildService(store);
    const role = await service.createRole({
      title: "Founding Engineer",
      requirements: ["TypeScript"],
    });
    const candidate = await service.createCandidate({
      roleId: role.id,
      name: "Eve",
      email: "eve@example.com",
      resumeText: "TypeScript.",
    });
    await service.screenCandidate(candidate.id);

    const secondStore = createPgStore(drizzle(pg) as unknown as HrDatabase);
    const roles = await secondStore.roles.list();
    expect(roles.some((r) => r.title === "Founding Engineer")).toBe(true);

    const candidates = await secondStore.candidates.list();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.screening?.recommendation).toBe("advance");
  });

  it("emits candidate.rejected through the outbox and dispatches exactly once", async () => {
    const service = buildService(store);
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

    const dispatched: string[] = [];
    const dispatcher = createOutboxDispatcher({
      outbox: store.outbox,
      handler: async (event) => {
        dispatched.push(event.type);
      },
      now: () => new Date(AT),
    });

    expect(await dispatcher.poll()).toBe(2);
    expect(dispatched).toEqual([
      "candidate.acknowledged",
      "candidate.rejected",
    ]);
    expect(await store.outbox.pending()).toHaveLength(0);
    expect(await dispatcher.poll()).toBe(0);
  });

  it("guards outbox claims with leases and marks dispatched rows unclaimable", async () => {
    const future = new Date(new Date(AT).getTime() + 30_000).toISOString();
    const past = new Date(new Date(AT).getTime() - 1_000).toISOString();

    const service = buildService(store);
    const role = await service.createRole({
      title: "SRE",
      requirements: ["k8s"],
    });
    const candidate = await service.createCandidate({
      roleId: role.id,
      name: "Carol",
      email: "carol@example.com",
      resumeText: "k8s for 5 years.",
    });
    await service.screenCandidate(candidate.id);
    await service.reviewCandidate(candidate.id, {
      approved: true,
      reviewer: "hr-manager",
    });

    const pending = await store.outbox.pending();
    expect(pending).toHaveLength(2);
    const approvedEvent = pending.find(
      (event) => event.type === "candidate.approved",
    )!;

    expect(await store.outbox.claimForDispatch(approvedEvent.id, future)).toBe(
      true,
    );
    expect(await store.outbox.claimForDispatch(approvedEvent.id, future)).toBe(
      false,
    );
    await store.outbox.markDispatched(approvedEvent.id);
    expect(await store.outbox.claimForDispatch(approvedEvent.id, future)).toBe(
      false,
    );
    expect(await store.outbox.pending()).toHaveLength(1);

    await store.outbox.enqueue({
      id: "lease-expired",
      type: "candidate.approved",
      candidateId: candidate.id,
      payload: { candidateId: candidate.id },
      at: AT,
      dispatchedAt: null,
    });
    expect(await store.outbox.claimForDispatch("lease-expired", past)).toBe(
      true,
    );
    expect(await store.outbox.claimForDispatch("lease-expired", future)).toBe(
      true,
    );
    await store.outbox.releaseClaim("lease-expired");
    expect(await store.outbox.claimForDispatch("lease-expired", future)).toBe(
      true,
    );
  });

  it("enforces retention operations in Postgres (expire/anonymize/remove)", async () => {
    const service = buildService(store);
    const role = await service.createRole({
      title: "Engineer",
      requirements: ["TS"],
    });
    const candidate = await service.createCandidate({
      roleId: role.id,
      name: "Old",
      email: "old@example.com",
      resumeText: "TS.",
    });
    const oldTimestamp = "2025-08-01T00:00:00.000Z";
    const cutoff = "2026-01-01T00:00:00.000Z";
    await store.outbox.enqueue({
      id: "old-ev",
      type: "candidate.acknowledged",
      candidateId: candidate.id,
      payload: { candidateId: candidate.id },
      at: oldTimestamp,
      dispatchedAt: null,
    });
    await store.audit.append({
      id: "old-au",
      candidateId: candidate.id,
      action: "candidate.reviewed",
      detail: { approved: true },
      at: oldTimestamp,
    });

    expect(await store.outbox.expireBefore(cutoff)).toBe(1);
    expect(
      (await store.outbox.pending()).some((event) => event.id === "old-ev"),
    ).toBe(false);

    expect(await store.audit.anonymizeBefore(cutoff)).toBe(1);
    const audit = await store.audit.list();
    const anonymized = audit.find((event) => event.id === "old-au");
    expect(anonymized?.candidateId).toBeNull();
    expect(anonymized?.detail).toEqual({ anonymized: true });

    await store.candidates.remove(candidate.id);
    expect(await store.candidates.get(candidate.id)).toBeNull();
  });

  it("keeps audit rows for held candidates during anonymizeBefore", async () => {
    const heldId = "held-candidate";
    const oldTimestamp = "2025-08-01T00:00:00.000Z";
    const cutoff = "2026-01-01T00:00:00.000Z";
    await store.audit.append({
      id: "held-au",
      candidateId: heldId,
      action: "candidate.reviewed",
      detail: { approved: true },
      at: oldTimestamp,
    });
    await store.audit.append({
      id: "expired-au",
      candidateId: "other-candidate",
      action: "candidate.reviewed",
      detail: { approved: false },
      at: oldTimestamp,
    });

    expect(await store.audit.anonymizeBefore(cutoff, [heldId])).toBe(1);
    const audit = await store.audit.list();
    const held = audit.find((event) => event.id === "held-au");
    expect(held?.candidateId).toBe(heldId);
    expect(held?.detail).toEqual({ approved: true });
    const expired = audit.find((event) => event.id === "expired-au");
    expect(expired?.candidateId).toBeNull();
    expect(expired?.detail).toEqual({ anonymized: true });
  });

  it("throws on updating a missing candidate", async () => {
    await expect(
      store.candidates.update({
        id: "missing",
        roleId: "r",
        name: "x",
        email: "x@x.io",
        resumeText: "",
        status: "pending_screening",
        screening: null,
        review: null,
        aiNoticeDisclosedAt: null,
        dispute: null,
        createdAt: AT,
        updatedAt: AT,
      }),
    ).rejects.toThrow('candidate "missing" not found');
  });
});
