import type { LlmGateway, LlmProvider } from "@dsrvm/ai";
import type {
  CompletionOptions,
  CompletionRequest,
  CompletionResponse,
} from "@dsrvm/ai";
import type { TelemetrySink } from "./types.js";

export interface ModelPrice {
  inputPerM: number;
  outputPerM: number;
}

export type PricingTable = Record<string, ModelPrice>;

export const DEFAULT_PRICING: PricingTable = {
  "claude-sonnet-4-5": { inputPerM: 3, outputPerM: 15 },
  "claude-sonnet": { inputPerM: 3, outputPerM: 15 },
  "claude-3-5-sonnet": { inputPerM: 3, outputPerM: 15 },
  "claude-haiku": { inputPerM: 0.8, outputPerM: 4 },
  "gpt-4o": { inputPerM: 2.5, outputPerM: 10 },
  "gpt-4o-mini": { inputPerM: 0.15, outputPerM: 0.6 },
};

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  pricing: PricingTable = DEFAULT_PRICING,
): number {
  const price = resolvePrice(model, pricing);
  return (
    (inputTokens / 1_000_000) * price.inputPerM +
    (outputTokens / 1_000_000) * price.outputPerM
  );
}

function resolvePrice(model: string, pricing: PricingTable): ModelPrice {
  if (pricing[model]) return pricing[model];
  const keys = Object.keys(pricing).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (model.startsWith(key)) return pricing[key]!;
  }
  return { inputPerM: 0, outputPerM: 0 };
}

export interface UsageRecord {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estCostUsd: number;
  tags?: Record<string, string>;
  at: string;
}

export interface ModelUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  estCostUsd: number;
}

export interface TagUsage {
  calls: number;
  estCostUsd: number;
}

export interface UsageSnapshot {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  estCostUsd: number;
  byModel: Record<string, ModelUsage>;
  byTag: Record<string, Record<string, TagUsage>>;
}

export interface UsageTrackerOptions {
  pricing?: PricingTable;
  sink?: TelemetrySink | null;
  now?: () => Date;
}

export interface UsageTracker {
  record(
    usage: {
      provider: string;
      model: string;
      inputTokens?: number;
      outputTokens?: number;
    },
    tags?: Record<string, string>,
  ): void;
  records(): UsageRecord[];
  snapshot(): UsageSnapshot;
}

export function createUsageTracker(
  options: UsageTrackerOptions = {},
): UsageTracker {
  const pricing = options.pricing ?? DEFAULT_PRICING;
  const sink = options.sink ?? null;
  const now = options.now ?? (() => new Date());
  const records: UsageRecord[] = [];

  return {
    record(usage, tags) {
      const inputTokens = usage.inputTokens ?? 0;
      const outputTokens = usage.outputTokens ?? 0;
      const record: UsageRecord = {
        provider: usage.provider,
        model: usage.model,
        inputTokens,
        outputTokens,
        estCostUsd: estimateCostUsd(
          usage.model,
          inputTokens,
          outputTokens,
          pricing,
        ),
        tags,
        at: now().toISOString(),
      };
      records.push(record);
      if (sink) {
        sink.add({
          kind: "histogram",
          key: "usage.cost_usd",
          value: record.estCostUsd,
          tags,
          at: record.at,
        });
      }
    },
    records() {
      return [...records];
    },
    snapshot() {
      return aggregate(records);
    },
  };
}

export function trackProviderUsage(
  provider: LlmProvider,
  tracker: UsageTracker,
  tags?: Record<string, string>,
): LlmProvider {
  return {
    name: provider.name,
    async complete(
      request: CompletionRequest,
      signal?: AbortSignal,
    ): Promise<CompletionResponse> {
      const response = await provider.complete(request, signal);
      tracker.record(
        {
          provider: response.provider,
          model: response.model,
          inputTokens: response.usage?.inputTokens,
          outputTokens: response.usage?.outputTokens,
        },
        tags,
      );
      return response;
    },
  };
}

export function trackGatewayUsage(
  gateway: LlmGateway,
  tracker: UsageTracker,
  tags?: Record<string, string>,
): LlmGateway {
  return {
    get providers() {
      return gateway.providers;
    },
    get activeProvider() {
      return gateway.activeProvider;
    },
    async complete(
      request: CompletionRequest,
      options?: CompletionOptions,
    ): Promise<CompletionResponse> {
      const response = await gateway.complete(request, options);
      tracker.record(
        {
          provider: response.provider,
          model: response.model,
          inputTokens: response.usage?.inputTokens,
          outputTokens: response.usage?.outputTokens,
        },
        tags,
      );
      return response;
    },
    setActiveProvider(name: string): void {
      gateway.setActiveProvider(name);
    },
  };
}

function aggregate(records: UsageRecord[]): UsageSnapshot {
  const byModel: Record<string, ModelUsage> = {};
  const byTag: Record<string, Record<string, TagUsage>> = {};
  let calls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let estCostUsd = 0;

  for (const record of records) {
    calls += 1;
    inputTokens += record.inputTokens;
    outputTokens += record.outputTokens;
    estCostUsd += record.estCostUsd;

    const model = (byModel[record.model] ??= {
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      estCostUsd: 0,
    });
    model.calls += 1;
    model.inputTokens += record.inputTokens;
    model.outputTokens += record.outputTokens;
    model.estCostUsd += record.estCostUsd;

    if (record.tags) {
      for (const [key, value] of Object.entries(record.tags)) {
        const perTag = (byTag[key] ??= {});
        const tag = (perTag[value] ??= { calls: 0, estCostUsd: 0 });
        tag.calls += 1;
        tag.estCostUsd += record.estCostUsd;
      }
    }
  }

  return { calls, inputTokens, outputTokens, estCostUsd, byModel, byTag };
}
