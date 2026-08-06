import { appendFileSync } from "node:fs";
import type { Metric, TelemetrySink } from "./types.js";

export const nullSink: TelemetrySink = {
  add() {},
};

export class InMemorySink implements TelemetrySink {
  readonly metrics: Metric[] = [];

  add(metric: Metric): void {
    this.metrics.push(metric);
  }
}

export class JsonlFileSink implements TelemetrySink {
  constructor(private readonly path: string) {}

  add(metric: Metric): void {
    appendFileSync(this.path, JSON.stringify(metric) + "\n", "utf8");
  }
}
