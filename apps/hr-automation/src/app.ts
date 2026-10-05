import type { LlmProvider } from "@dsrvm/ai";
import type { CompletionRequest, CompletionResponse } from "@dsrvm/ai";
import {
  createAnthropicProvider,
  createFakeProvider,
  createGateway,
  createOpenAiProvider,
} from "@dsrvm/ai";
import {
  HrService,
  CandidateIngestor,
  createInMemoryStore,
  createOutboxDispatcher,
  createPostgresStore,
  createRetentionCleaner,
  createScreeningEngine,
} from "@dsrvm/hr";
import type { Store } from "@dsrvm/hr";
import type { OutboxDispatcher } from "@dsrvm/hr";
import type { OutboxEvent, RetentionCleaner } from "@dsrvm/hr";
import {
  MetricsRegistry,
  createUsageTracker,
  summarize,
  trackGatewayUsage,
} from "@dsrvm/telemetry";
import type { TelemetryReport } from "@dsrvm/telemetry";
import {
  buildReviewerServer,
  type ReviewerServer,
  type ReviewerTelemetry,
} from "./server.js";

export type ProviderKind = "demo" | "anthropic" | "openai" | "fake";

export const DEFAULT_TELEMETRY_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export interface ReviewerAppOptions {
  provider?: ProviderKind;
  anthropicApiKey?: string;
  openAiApiKey?: string;
  databaseUrl?: string;
  apiToken?: string;
  webhookUrl?: string;
  webhookTimeoutMs?: number;
  signal?: AbortSignal;
  now?: () => Date;
  logger?: (message: string) => void;
  telemetryTtlMs?: number;
}

export interface ReviewerApp extends ReviewerServer {
  store: Store;
  dispatcher: OutboxDispatcher | null;
  retention: RetentionCleaner | null;
  telemetry: () => TelemetryReport;
  close: () => Promise<void>;
}

export async function createReviewerApp(
  options: ReviewerAppOptions = {},
): Promise<ReviewerApp> {
  const now = options.now ?? (() => new Date());
  const ttlMs = options.telemetryTtlMs ?? DEFAULT_TELEMETRY_TTL_MS;
  const registry = new MetricsRegistry({ now, ttlMs });
  const usage = createUsageTracker({ now, ttlMs });
  const gateway = trackGatewayUsage(buildGateway(options), usage, {
    task: "screening",
  });
  const { store, closeStore } = await buildStore(options);
  const hr = new HrService({
    store,
    screeningEngine: createScreeningEngine(gateway),
    now,
  });
  const ingestor = new CandidateIngestor({ service: hr });

  const log = options.logger ?? ((message: string) => console.log(message));
  const webhookUrl = options.webhookUrl ?? process.env.WEBHOOK_URL;
  const deliver = createOutboxTransport({
    webhookUrl,
    timeoutMs: options.webhookTimeoutMs,
    log,
  });
  const dispatcher = options.signal
    ? createOutboxDispatcher({
        outbox: store.outbox,
        handler: deliver,
        pollIntervalMs: 500,
        signal: options.signal,
      })
    : null;
  const retention = options.signal
    ? createRetentionCleaner({
        service: hr,
        pollIntervalMs: 60 * 60 * 1000,
        signal: options.signal,
        logger: log,
      })
    : null;

  const telemetry: ReviewerTelemetry = {
    counter: (name, by, tags) => registry.counter(name, by, tags),
    report: () => summarize(registry, usage, now),
  };
  const { server } = await buildReviewerServer(
    hr,
    {
      telemetry,
      apiToken: options.apiToken,
      dispatcher: dispatcher ?? undefined,
    },
    ingestor,
  );
  return {
    server,
    hr,
    store,
    dispatcher,
    retention,
    telemetry: () => telemetry.report(),
    close: async () => {
      dispatcher?.stop();
      retention?.stop();
      await closeStore();
      await server.close();
    },
  };
}

function buildGateway(
  options: ReviewerAppOptions,
): ReturnType<typeof createGateway> {
  const kind = options.provider ?? "demo";
  const providers: LlmProvider[] = [];
  if (kind === "demo") {
    providers.push(createDemoProvider());
  } else if (kind === "fake") {
    providers.push(createFakeProvider({ name: "fake", echo: false }));
  } else if (kind === "anthropic") {
    const apiKey = options.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("PROVIDER=anthropic requires ANTHROPIC_API_KEY");
    }
    providers.push(createAnthropicProvider({ apiKey }));
  } else if (kind === "openai") {
    const apiKey = options.openAiApiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("PROVIDER=openai requires OPENAI_API_KEY");
    }
    providers.push(createOpenAiProvider({ apiKey }));
  }
  return createGateway(providers, { activeProvider: providers[0]!.name });
}

async function buildStore(options: ReviewerAppOptions): Promise<{
  store: Store;
  closeStore: () => Promise<void>;
}> {
  if (options.databaseUrl) {
    const { runMigrations } = await import("@dsrvm/hr");
    const ran = await runMigrations(options.databaseUrl);
    if (ran.length) {
      console.log(`hr-db: applied migrations: ${ran.join(", ")}`);
    }
    const handle = createPostgresStore(options.databaseUrl);
    return { store: handle.store, closeStore: handle.close };
  }
  return { store: createInMemoryStore(), closeStore: async () => {} };
}

export const DEFAULT_WEBHOOK_TIMEOUT_MS = 10_000;

export function createOutboxTransport(options: {
  webhookUrl?: string | undefined;
  timeoutMs?: number | undefined;
  log: (message: string) => void;
}): (event: OutboxEvent) => Promise<void> {
  const { webhookUrl, log } = options;
  const timeoutMs = options.timeoutMs ?? DEFAULT_WEBHOOK_TIMEOUT_MS;

  return async (event: OutboxEvent): Promise<void> => {
    const dispatchedAt = new Date().toISOString();
    if (!webhookUrl) {
      const payload = event.payload as {
        email?: string;
        name?: string;
        notice?: { version?: string };
      };
      const notice = payload.notice?.version
        ? ` (ai-notice ${payload.notice.version})`
        : "";
      log(
        `outbox[${event.type}] dispatched for ${payload.name ?? "?"} <${payload.email ?? "?"}>${notice}`,
      );
      return;
    }

    const body = JSON.stringify({
      type: event.type,
      candidateId: event.candidateId,
      payload: event.payload,
      dispatchedAt,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: controller.signal,
      });
      if (!response.ok) {
        log(
          `outbox[${event.type}] webhook FAILED for ${event.candidateId}: ${response.status} ${response.statusText}`,
        );
        return;
      }
      log(
        `outbox[${event.type}] webhook delivered to ${webhookUrl} for ${event.candidateId} (${response.status})`,
      );
    } catch (error) {
      const reason = controller.signal.aborted
        ? `timeout after ${timeoutMs}ms`
        : String(error);
      log(
        `outbox[${event.type}] webhook FAILED for ${event.candidateId}: ${reason}`,
      );
    } finally {
      clearTimeout(timer);
    }
  };
}

function createDemoProvider(): LlmProvider {
  return {
    name: "demo",
    async complete(request: CompletionRequest): Promise<CompletionResponse> {
      const prompt = request.messages.map((m) => m.content).join("\n");
      let seed = 0;
      for (const ch of prompt) {
        seed = (seed * 31 + ch.charCodeAt(0)) % 100_003;
      }
      const score = 40 + (seed % 61);
      const recommendation =
        score >= 75 ? "advance" : score >= 55 ? "needs_review" : "reject";
      const text = JSON.stringify({
        score,
        recommendation,
        summary: `Demo screening: ${score}/100 against role requirements (deterministic keyword-hash).`,
        strengths: ["Requirement keywords matched", "Relevant experience"],
        flags: score >= 75 ? [] : ["Below target score"],
      });
      return {
        provider: "demo",
        model: "demo-v1",
        text,
        usage: {
          inputTokens: prompt.length,
          outputTokens: text.length,
        },
      };
    },
  };
}
