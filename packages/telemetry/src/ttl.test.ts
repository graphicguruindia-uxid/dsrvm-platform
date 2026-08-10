import { describe, expect, it } from "vitest";
import { MetricsRegistry } from "./registry.js";
import { createUsageTracker } from "./usage.js";

function clock(initialMs: number) {
  let value = initialMs;
  return {
    now: () => new Date(value),
    advance: (ms: number) => {
      value += ms;
    },
  };
}

const BASE = Date.parse("2026-08-04T00:00:00.000Z");
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

describe("telemetry TTL rotation/expiry", () => {
  it("MetricsRegistry expires counters/gauges/histograms after ttlMs", () => {
    const c = clock(BASE);
    const registry = new MetricsRegistry({ now: c.now, ttlMs: 1000 });

    registry.counter("calls", 2);
    registry.gauge("cpu", 0.5);
    registry.histogram("latency", 10);

    expect(registry.snapshot().counters.calls).toBe(2);
    expect(registry.snapshot().gauges["cpu"]!).toBe(0.5);
    expect(registry.snapshot().histograms.latency!.count).toBe(1);

    c.advance(1001);
    const after = registry.snapshot();
    expect(after.counters.calls).toBeUndefined();
    expect(after.gauges.cpu).toBeUndefined();
    expect(after.histograms.latency).toBeUndefined();

    registry.counter("calls", 3);
    expect(registry.snapshot().counters.calls).toBe(3);
  });

  it("MetricsRegistry keeps partially fresh tagged keys after expiry", () => {
    const c = clock(BASE);
    const registry = new MetricsRegistry({ now: c.now, ttlMs: 1000 });

    registry.counter("calls", 1, { outcome: "approved" });
    c.advance(500);
    registry.counter("calls", 1, { outcome: "rejected" });
    c.advance(600);
    const snap = registry.snapshot().counters;
    expect(snap["calls{outcome=approved}"]).toBeUndefined();
    expect(snap["calls{outcome=rejected}"]).toBe(1);
  });

  it("MetricsRegistry without ttlMs keeps entries forever", () => {
    const c = clock(BASE);
    const registry = new MetricsRegistry({ now: c.now });
    registry.counter("calls", 1);
    c.advance(10 * YEAR_MS);
    expect(registry.snapshot().counters.calls).toBe(1);
  });

  it("UsageTracker expires records after ttlMs and rotates fresh ones", () => {
    const c = clock(BASE);
    const tracker = createUsageTracker({ now: c.now, ttlMs: 1000 });

    tracker.record({
      provider: "demo",
      model: "demo-v1",
      inputTokens: 100,
      outputTokens: 10,
    });
    expect(tracker.records()).toHaveLength(1);
    expect(tracker.snapshot().calls).toBe(1);

    c.advance(1001);
    expect(tracker.records()).toHaveLength(0);
    expect(tracker.snapshot().calls).toBe(0);

    tracker.record({
      provider: "demo",
      model: "demo-v1",
      inputTokens: 200,
      outputTokens: 20,
    });
    expect(tracker.records()).toHaveLength(1);
    expect(tracker.snapshot().calls).toBe(1);
    expect(tracker.snapshot().inputTokens).toBe(200);
  });

  it("UsageTracker without ttlMs keeps all records", () => {
    const c = clock(BASE);
    const tracker = createUsageTracker({ now: c.now });
    tracker.record({ provider: "demo", model: "demo-v1" });
    c.advance(10 * YEAR_MS);
    expect(tracker.records()).toHaveLength(1);
  });
});
