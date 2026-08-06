import { describe, expect, it } from "vitest";
import { createGateway, createFakeProvider } from "@dsrvm/ai";
import { HrService } from "./service.js";
import { createScreeningEngine } from "./screening.js";
import { createInMemoryStore } from "./store.js";

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
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.type).toBe("candidate.approved");

    const audit = await service.auditLog();
    const actions = audit.map((event) => event.action);
    expect(actions).toContain("candidate.created");
    expect(actions).toContain("candidate.screened");
    expect(actions).toContain("candidate.reviewed");

    let dispatched = 0;
    const count = await service.dispatchOutbox(async (event) => {
      dispatched += 1;
      expect(event.type).toBe("candidate.approved");
    });
    expect(count).toBe(1);
    expect(dispatched).toBe(1);
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
    expect(outbox[0]?.type).toBe("candidate.rejected");
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
    expect(events).toHaveLength(3);
    expect(
      events.every(
        (event) =>
          event.candidateId === candidate.id || event.candidateId === null,
      ),
    ).toBe(true);
    expect(events.map((event) => event.action)).toEqual([
      "role.created",
      "candidate.created",
      "candidate.screened",
    ]);
    expect(await store.audit.list()).toHaveLength(3);
  });
});
