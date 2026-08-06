import { describe, expect, it } from "vitest";
import { createFakeProvider, createGateway } from "@dsrvm/ai";
import {
  DEFAULT_PRICING,
  createUsageTracker,
  estimateCostUsd,
  trackGatewayUsage,
  trackProviderUsage,
} from "./index.js";

const NOW = () => new Date("2026-08-04T00:00:00.000Z");

describe("estimateCostUsd", () => {
  it("prices by exact model match", () => {
    expect(estimateCostUsd("gpt-4o-mini", 1_000_000, 1_000_000)).toBeCloseTo(
      0.75,
    );
  });

  it("prices by longest prefix match", () => {
    expect(
      estimateCostUsd("claude-sonnet-4-5-20250101", 1_000_000, 1_000_000),
    ).toBeCloseTo(18);
  });

  it("returns zero for unknown models", () => {
    expect(estimateCostUsd("demo-v1", 1_000_000, 1_000_000)).toBe(0);
  });

  it("supports a custom pricing table", () => {
    const pricing = { "my-model": { inputPerM: 1, outputPerM: 2 } };
    expect(estimateCostUsd("my-model", 500_000, 250_000, pricing)).toBeCloseTo(
      1,
    );
  });
});

describe("createUsageTracker", () => {
  it("records and aggregates usage by model and tags", () => {
    const tracker = createUsageTracker({ now: NOW });
    tracker.record(
      {
        provider: "openai",
        model: "gpt-4o-mini",
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      },
      { client: "acme", task: "screening" },
    );
    tracker.record(
      {
        provider: "openai",
        model: "gpt-4o-mini",
        inputTokens: 500_000,
        outputTokens: 500_000,
      },
      { client: "beta", task: "screening" },
    );

    const snapshot = tracker.snapshot();
    expect(snapshot.calls).toBe(2);
    expect(snapshot.inputTokens).toBe(1_500_000);
    expect(snapshot.outputTokens).toBe(1_500_000);
    expect(snapshot.estCostUsd).toBeCloseTo(1.125);
    expect(snapshot.byModel["gpt-4o-mini"]!.calls).toBe(2);
    expect(snapshot.byTag.client!.acme!.estCostUsd).toBeCloseTo(0.75);
    expect(snapshot.byTag.client!.beta!.estCostUsd).toBeCloseTo(0.375);
  });

  it("emits cost histograms to the sink", () => {
    let seen = 0;
    const tracker = createUsageTracker({
      now: NOW,
      sink: { add: () => (seen += 1) },
    });
    tracker.record({
      provider: "demo",
      model: "demo-v1",
      inputTokens: 100,
      outputTokens: 50,
    });
    expect(seen).toBe(1);
  });

  it("exposes raw records in order", () => {
    const tracker = createUsageTracker({ now: NOW });
    tracker.record({ provider: "a", model: "m", inputTokens: 1 });
    tracker.record({ provider: "b", model: "n", inputTokens: 2 });
    expect(tracker.records()).toHaveLength(2);
    expect(tracker.records()[1]?.provider).toBe("b");
  });
});

describe("trackProviderUsage", () => {
  it("wraps a provider and records each completion", async () => {
    const inner = createFakeProvider({
      name: "openai",
      echo: false,
      output: "hi",
    });
    const tracker = createUsageTracker({ now: NOW });
    const wrapped = trackProviderUsage(inner, tracker, { task: "screening" });

    const response = await wrapped.complete({
      messages: [{ role: "user", content: "hello" }],
    });
    expect(response.text).toBe("hi");

    const records = tracker.records();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      provider: "openai",
      model: "fake-model",
      tags: { task: "screening" },
    });
    expect(records[0]!.inputTokens).toBe("hello".length);
    expect(records[0]!.outputTokens).toBe("hi".length);
  });
});

describe("trackGatewayUsage", () => {
  it("wraps a gateway, recording usage while preserving its interface", async () => {
    const gateway = createGateway(
      [createFakeProvider({ name: "openai", echo: false, output: "hi" })],
      { activeProvider: "openai" },
    );
    const tracker = createUsageTracker({ now: NOW });
    const wrapped = trackGatewayUsage(gateway, tracker, { task: "screening" });

    const response = await wrapped.complete({
      messages: [{ role: "user", content: "hello" }],
    });
    expect(response.text).toBe("hi");

    expect(wrapped.activeProvider).toBe("openai");
    expect(wrapped.providers).toHaveLength(1);

    wrapped.setActiveProvider("openai");

    const records = tracker.records();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      provider: "openai",
      model: "fake-model",
      tags: { task: "screening" },
    });
    expect(records[0]!.inputTokens).toBe("hello".length);
    expect(records[0]!.outputTokens).toBe("hi".length);
  });
});
