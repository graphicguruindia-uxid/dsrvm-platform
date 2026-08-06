import { describe, expect, it } from "vitest";
import { runEvals } from "./evals.js";
import { createGateway } from "./gateway.js";
import { createFakeProvider } from "./providers/fake.js";

describe("runEvals", () => {
  it("reports passing and failing cases", async () => {
    const gateway = createGateway([
      createFakeProvider({ echo: false, output: "The answer is 42" }),
    ]);
    const summary = await runEvals(gateway, [
      {
        id: "ok",
        request: { messages: [{ role: "user", content: "q" }] },
        asserts: [{ kind: "contains", value: "42" }],
      },
      {
        id: "bad",
        request: { messages: [{ role: "user", content: "q" }] },
        asserts: [{ kind: "contains", value: "nope" }],
      },
    ]);
    expect(summary.total).toBe(2);
    expect(summary.passed).toBe(1);
    expect(summary.failed).toBe(1);
  });

  it("flags cases that throw", async () => {
    const failing = {
      name: "failing",
      complete: async () => {
        throw new Error("provider down");
      },
    };
    const gateway = createGateway([failing]);
    const summary = await runEvals(gateway, [
      { id: "boom", request: { messages: [{ role: "user", content: "q" }] } },
    ]);
    expect(summary.passed).toBe(0);
    expect(summary.results[0]?.passed).toBe(false);
  });

  it("validates json schema asserts", async () => {
    const gateway = createGateway([
      createFakeProvider({ echo: false, output: '{"name":"Ada"}' }),
    ]);
    const summary = await runEvals(gateway, [
      {
        id: "j",
        request: { messages: [{ role: "user", content: "q" }] },
        asserts: [
          {
            kind: "json_schema",
            schema: {
              type: "object",
              required: ["name"],
              properties: { name: { type: "string" } },
            },
          },
        ],
      },
    ]);
    expect(summary.passed).toBe(1);
  });
});
