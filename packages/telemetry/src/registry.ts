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
  ttlMs?: number;
}

export class MetricsRegistry {
  private readonly sink: TelemetrySink | null;
  private readonly now: () => Date;
  private readonly ttlMs: number;
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();
  private readonly histograms = new Map<string, HistogramState>();
  private readonly lastWrite = new Map<string, number>();

  constructor(options: MetricsRegistryOptions = {}) {
    this.sink = options.sink ?? null;
    this.now = options.now ?? (() => new Date());
    this.ttlMs = options.ttlMs ?? 0;
  }

  counter(name: string, by = 1, tags?: Record<string, string>): void {
    const key = metricKey(name, tags);
    this.evictExpired();
    this.counters.set(key, (this.counters.get(key) ?? 0) + by);
    this.lastWrite.set(key, this.now().getTime());
    this.emit("counter", name, this.counters.get(key) ?? 0, tags);
  }

  gauge(name: string, value: number, tags?: Record<string, string>): void {
    const key = metricKey(name, tags);
    this.evictExpired();
    this.gauges.set(key, value);
    this.lastWrite.set(key, this.now().getTime());
    this.emit("gauge", name, value, tags);
  }

  histogram(name: string, value: number, tags?: Record<string, string>): void {
    const key = metricKey(name, tags);
    this.evictExpired();
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
    this.lastWrite.set(key, this.now().getTime());
    this.emit("histogram", name, value, tags);
  }

  snapshot(): RegistrySnapshot {
    this.evictExpired();
    return {
      counters: mapToRecord(this.counters),
      gauges: mapToRecord(this.gauges),
      histograms: mapToHistograms(this.histograms),
    };
  }

  private evictExpired(): void {
    if (this.ttlMs <= 0) return;
    const cutoff = this.now().getTime() - this.ttlMs;
    for (const [key, lastWrite] of this.lastWrite) {
      if (lastWrite < cutoff) {
        this.lastWrite.delete(key);
        this.counters.delete(key);
        this.gauges.delete(key);
        this.histograms.delete(key);
      }
    }
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
