import { describe, expect, it } from "vitest";
import { createGateway, createFakeProvider } from "@dsrvm/ai";
import { createScreeningEngine, SCREENING_PROMPT } from "./screening.js";
import type { Candidate, RoleProfile } from "./types.js";

function fakeGateway(output: string) {
  return createGateway(
    [createFakeProvider({ name: "fake", echo: false, output })],
    {
      activeProvider: "fake",
    },
  );
}

const role: RoleProfile = {
  id: "role-1",
  title: "HR Automation Engineer",
  requirements: ["TypeScript", "AI integration", "Postgres"],
  niceToHave: ["HR tech"],
  createdAt: new Date().toISOString(),
};

const candidate: Candidate = {
  id: "cand-1",
  roleId: "role-1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  resumeText: "10 years TypeScript, built LLM pipelines at fintech.",
  status: "pending_screening",
  screening: null,
  review: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("screening engine", () => {
  it("produces a structured screening result from the gateway", async () => {
    const gateway = fakeGateway(
      JSON.stringify({
        score: 88,
        recommendation: "advance",
        summary: "Strong fit for the role.",
        strengths: ["TypeScript", "AI pipelines"],
        flags: [],
      }),
    );
    const engine = createScreeningEngine(gateway);
    const result = await engine.screen(role, candidate);

    expect(result.score).toBe(88);
    expect(result.recommendation).toBe("advance");
    expect(result.strengths).toContain("TypeScript");
    expect(result.provider).toBe("fake");
    expect(result.screenedAt).toBeTruthy();
  });

  it("clamps scores outside 0..100 and passes through flags", async () => {
    const gateway = fakeGateway(
      JSON.stringify({
        score: 150,
        recommendation: "reject",
        summary: "Does not match.",
        strengths: [],
        flags: ["No Postgres experience"],
      }),
    );
    const engine = createScreeningEngine(gateway);
    const result = await engine.screen(role, candidate);

    expect(result.score).toBe(100);
    expect(result.recommendation).toBe("reject");
    expect(result.flags).toContain("No Postgres experience");
  });

  it("registers the screening prompt as version 1", () => {
    expect(SCREENING_PROMPT.key).toBe("screening");
    expect(SCREENING_PROMPT.version).toBe(1);
  });

  it("throws when the model returns invalid JSON", async () => {
    const gateway = fakeGateway("not json at all");
    const engine = createScreeningEngine(gateway);
    await expect(engine.screen(role, candidate)).rejects.toThrow();
  });
});
