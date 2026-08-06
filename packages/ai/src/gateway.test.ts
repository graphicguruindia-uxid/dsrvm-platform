import { describe, expect, it } from "vitest";
import { createGateway } from "./gateway.js";
import type { LlmProvider } from "./provider.js";
import { createFakeProvider } from "./providers/fake.js";

describe("createGateway", () => {
  it("throws when no providers are configured", () => {
    expect(() => createGateway([])).toThrow(/provider/);
  });

  it("throws when activeProvider is unknown", () => {
    expect(() =>
      createGateway([createFakeProvider()], { activeProvider: "nope" }),
    ).toThrow(/unknown activeProvider/);
  });

  it("routes to the active provider", async () => {
    const gateway = createGateway([
      createFakeProvider({ name: "a" }),
      createFakeProvider({ name: "b" }),
    ]);
    const response = await gateway.complete({
      messages: [{ role: "user", content: "hi" }],
    });
    expect(response.provider).toBe("a");
    expect(response.text).toContain("[a echo:");
  });

  it("respects preferProvider", async () => {
    const gateway = createGateway([
      createFakeProvider({ name: "a" }),
      createFakeProvider({ name: "b" }),
    ]);
    const response = await gateway.complete(
      { messages: [{ role: "user", content: "hi" }] },
      { preferProvider: "b" },
    );
    expect(response.provider).toBe("b");
  });

  it("retries then succeeds", async () => {
    let calls = 0;
    const flaky: LlmProvider = {
      name: "flaky",
      complete: async () => {
        calls += 1;
        if (calls < 3) throw new Error("boom");
        return { provider: "flaky", model: "m", text: "ok" };
      },
    };
    const gateway = createGateway([flaky], { activeProvider: "flaky" });
    const response = await gateway.complete({
      messages: [{ role: "user", content: "x" }],
    });
    expect(response.text).toBe("ok");
    expect(calls).toBe(3);
  });

  it("fails after exhausting retries", async () => {
    const always: LlmProvider = {
      name: "always",
      complete: async () => {
        throw new Error("down");
      },
    };
    const gateway = createGateway([always], { activeProvider: "always" });
    await expect(
      gateway.complete(
        { messages: [{ role: "user", content: "x" }] },
        { maxRetries: 1, retryDelayMs: 1 },
      ),
    ).rejects.toThrow(/down/);
  });

  it("setActiveProvider switches the active provider", async () => {
    const gateway = createGateway([
      createFakeProvider({ name: "a" }),
      createFakeProvider({ name: "b" }),
    ]);
    gateway.setActiveProvider("b");
    expect(gateway.activeProvider).toBe("b");
  });
});
