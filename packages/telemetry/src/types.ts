export type MetricKind = "counter" | "gauge" | "histogram";

export interface Metric {
  kind: MetricKind;
  key: string;
  value: number;
  tags?: Record<string, string>;
  at: string;
}

export interface TelemetrySink {
  add(metric: Metric): void;
}

export interface HistogramSummary {
  count: number;
  sum: number;
  min: number | null;
  max: number | null;
  avg: number | null;
}

export interface RegistrySnapshot {
  counters: Record<string, number>;
  gauges: Record<string, number>;
  histograms: Record<string, HistogramSummary>;
}
