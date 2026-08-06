import type { MetricsRegistry } from "./registry.js";
import type { UsageTracker, UsageSnapshot } from "./usage.js";

export interface TelemetryReport {
  generatedAt: string;
  pipeline: Record<string, number>;
  usage: UsageSnapshot;
}

export function summarize(
  registry: MetricsRegistry,
  usage: UsageTracker,
  now: () => Date = () => new Date(),
): TelemetryReport {
  return {
    generatedAt: now().toISOString(),
    pipeline: registry.snapshot().counters,
    usage: usage.snapshot(),
  };
}
