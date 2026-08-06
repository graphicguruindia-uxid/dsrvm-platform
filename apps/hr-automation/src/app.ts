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
  createScreeningEngine,
} from "@dsrvm/hr";
import type { Store } from "@dsrvm/hr";
import type { OutboxDispatcher } from "@dsrvm/hr";
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

export interface ReviewerAppOptions {
  provider?: ProviderKind;
  anthropicApiKey?: string;
  openAiApiKey?: string;
  databaseUrl?: string;
  signal?: AbortSignal;
  now?: () => Date;
  logger?: (message: string) => void;
}

export interface ReviewerApp extends ReviewerServer {
  store: Store;
  dispatcher: OutboxDispatcher | null;
  telemetry: () => TelemetryReport;
  close: () => Promise<void>;
}

export function createReviewerApp(
  options: ReviewerAppOptions = {},
): ReviewerApp {
  const now = options.now ?? (() => new Date());
  const registry = new MetricsRegistry({ now });
  const usage = createUsageTracker({ now });
  const gateway = trackGatewayUsage(buildGateway(options), usage, {
    task: "screening",
  });
  const { store, closeStore } = buildStore(options);
  const hr = new HrService({
    store,
    screeningEngine: createScreeningEngine(gateway),
    now,
  });
  const ingestor = new CandidateIngestor({ service: hr });

  const log = options.logger ?? ((message: string) => console.log(message));
  const dispatcher = options.signal
    ? createOutboxDispatcher({
        outbox: store.outbox,
        handler: async (event) => {
          const payload = event.payload as { email?: string; name?: string };
          log(
            `outbox[${event.type}] dispatched for ${payload.name ?? "?"} <${payload.email ?? "?"}>`,
          );
        },
        pollIntervalMs: 500,
        signal: options.signal,
      })
    : null;

  const telemetry: ReviewerTelemetry = {
    counter: (name, by, tags) => registry.counter(name, by, tags),
    report: () => summarize(registry, usage, now),
  };
  const { server } = buildReviewerServer(hr, { telemetry }, ingestor);
  return {
    server,
    hr,
    store,
    dispatcher,
    telemetry: () => telemetry.report(),
    close: async () => {
      dispatcher?.stop();
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

function buildStore(options: ReviewerAppOptions): {
  store: Store;
  closeStore: () => Promise<void>;
} {
  if (options.databaseUrl) {
    const handle = createPostgresStore(options.databaseUrl);
    return { store: handle.store, closeStore: handle.close };
  }
  return { store: createInMemoryStore(), closeStore: async () => {} };
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
