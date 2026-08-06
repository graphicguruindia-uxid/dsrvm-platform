import type {
  HistogramSummary,
  MetricKind,
  RegistrySnapshot,
  TelemetrySink,
} from "./types.js";

interface HistogramState {
  sum: number;
  count: number;
  min: number | null;
  max: number | null;
}

export interface MetricsRegistryOptions {
  sink?: TelemetrySink | null;
  now?: () => Date;
}

export class MetricsRegistry {
  private readonly sink: TelemetrySink | null;
  private readonly now: () => Date;
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();
  private readonly histograms = new Map<string, HistogramState>();

  constructor(options: MetricsRegistryOptions = {}) {
    this.sink = options.sink ?? null;
    this.now = options.now ?? (() => new Date());
  }

  counter(name: string, by = 1, tags?: Record<string, string>): void {
    const key = metricKey(name, tags);
    this.counters.set(key, (this.counters.get(key) ?? 0) + by);
    this.emit("counter", name, this.counters.get(key) ?? 0, tags);
  }

  gauge(name: string, value: number, tags?: Record<string, string>): void {
    this.gauges.set(metricKey(name, tags), value);
    this.emit("gauge", name, value, tags);
  }

  histogram(name: string, value: number, tags?: Record<string, string>): void {
    const key = metricKey(name, tags);
    const state = this.histograms.get(key) ?? {
      sum: 0,
      count: 0,
      min: null,
      max: null,
    };
    state.sum += value;
    state.count += 1;
    state.min = state.min === null ? value : Math.min(state.min, value);
    state.max = state.max === null ? value : Math.max(state.max, value);
    this.histograms.set(key, state);
    this.emit("histogram", name, value, tags);
  }

  snapshot(): RegistrySnapshot {
    return {
      counters: mapToRecord(this.counters),
      gauges: mapToRecord(this.gauges),
      histograms: mapToHistograms(this.histograms),
    };
  }

  private emit(
    kind: MetricKind,
    name: string,
    value: number,
    tags?: Record<string, string>,
  ): void {
    this.sink?.add({
      kind,
      key: name,
      value,
      tags,
      at: this.now().toISOString(),
    });
  }
}

function metricKey(name: string, tags?: Record<string, string>): string {
  if (!tags) return name;
  const parts = Object.entries(tags)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`);
  return `${name}{${parts.join(",")}}`;
}

function mapToRecord(map: Map<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of map) {
    out[key] = value;
  }
  return out;
}

function mapToHistograms(
  map: Map<string, HistogramState>,
): Record<string, HistogramSummary> {
  const out: Record<string, HistogramSummary> = {};
  for (const [key, state] of map) {
    out[key] = {
      count: state.count,
      sum: state.sum,
      min: state.min,
      max: state.max,
      avg: state.count > 0 ? state.sum / state.count : null,
    };
  }
  return out;
}
