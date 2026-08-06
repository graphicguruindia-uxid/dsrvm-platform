import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  InMemorySink,
  JsonlFileSink,
  MetricsRegistry,
  nullSink,
} from "./index.js";

const NOW = () => new Date("2026-08-04T00:00:00.000Z");

describe("MetricsRegistry", () => {
  it("accumulates counters, including per-tag variants", () => {
    const registry = new MetricsRegistry({ now: NOW });
    registry.counter("pipeline.candidate.created");
    registry.counter("pipeline.candidate.created");
    registry.counter("pipeline.candidate.created", 1, { client: "acme" });

    const { counters } = registry.snapshot();
    expect(counters["pipeline.candidate.created"]).toBe(2);
    expect(counters["pipeline.candidate.created{client=acme}"]).toBe(1);
  });

  it("keeps the latest gauge value", () => {
    const registry = new MetricsRegistry({ now: NOW });
    registry.gauge("queue.pending_review", 3);
    registry.gauge("queue.pending_review", 5);
    expect(registry.snapshot().gauges["queue.pending_review"]).toBe(5);
  });

  it("computes histogram summaries", () => {
    const registry = new MetricsRegistry({ now: NOW });
    for (const value of [2, 4, 6]) {
      registry.histogram("ai.cost_usd", value);
    }
    const hist = registry.snapshot().histograms["ai.cost_usd"];
    expect(hist).toEqual({ count: 3, sum: 12, min: 2, max: 6, avg: 4 });
  });

  it("streams every update to the sink", () => {
    const sink = new InMemorySink();
    const registry = new MetricsRegistry({ sink, now: NOW });
    registry.counter("a");
    registry.gauge("b", 1);
    registry.histogram("c", 2);
    expect(sink.metrics).toHaveLength(3);
    expect(sink.metrics[0]).toMatchObject({
      kind: "counter",
      key: "a",
      value: 1,
    });
    expect(sink.metrics[0]!.at).toBe(NOW().toISOString());
  });

  it("serializes tags deterministically", () => {
    const registry = new MetricsRegistry({ now: NOW });
    registry.counter("pipeline.candidate.created", 1, {
      client: "acme",
      stage: "prod",
    });
    registry.counter("pipeline.candidate.created", 1, {
      stage: "prod",
      client: "acme",
    });
    expect(Object.keys(registry.snapshot().counters)).toHaveLength(1);
  });
});

describe("nullSink", () => {
  it("accepts metrics without doing anything", () => {
    expect(() =>
      nullSink.add({ kind: "counter", key: "a", value: 1, at: "t" }),
    ).not.toThrow();
  });
});

describe("JsonlFileSink", () => {
  it("appends one JSON line per metric", () => {
    const file = `${process.cwd()}/tmp-telemetry-sink-test.jsonl`;
    const sink = new JsonlFileSink(file);
    sink.add({
      kind: "counter",
      key: "pipeline.candidate.created",
      value: 1,
      at: "t1",
    });
    sink.add({
      kind: "histogram",
      key: "usage.cost_usd",
      value: 0.01,
      at: "t2",
    });

    const lines = readLines(file);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toEqual({
      kind: "counter",
      key: "pipeline.candidate.created",
      value: 1,
      at: "t1",
    });
    removeFile(file);
  });
});

function readLines(path: string): string[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.length > 0);
}

function removeFile(path: string): void {
  if (existsSync(path)) unlinkSync(path);
}
