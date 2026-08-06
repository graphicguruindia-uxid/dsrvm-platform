import type { LlmProvider } from "./provider.js";
import type {
  CompletionOptions,
  CompletionRequest,
  CompletionResponse,
} from "./types.js";

export interface LlmGateway {
  readonly providers: readonly LlmProvider[];
  readonly activeProvider: string;
  complete(
    request: CompletionRequest,
    options?: CompletionOptions,
  ): Promise<CompletionResponse>;
  setActiveProvider(name: string): void;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 250;

export function createGateway(
  providers: readonly LlmProvider[],
  options: { activeProvider?: string } = {},
): LlmGateway {
  if (providers.length === 0) {
    throw new Error("createGateway: at least one LLM provider is required");
  }

  let activeProvider = options.activeProvider ?? providers[0]!.name;
  if (!providers.some((provider) => provider.name === activeProvider)) {
    throw new Error(
      `createGateway: unknown activeProvider "${activeProvider}"`,
    );
  }

  const findProvider = (name: string): LlmProvider => {
    const provider = providers.find((candidate) => candidate.name === name);
    if (!provider) {
      throw new Error(`createGateway: unknown provider "${name}"`);
    }
    return provider;
  };

  const callWithTimeout = (
    provider: LlmProvider,
    request: CompletionRequest,
    timeoutMs: number,
  ): Promise<CompletionResponse> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return provider.complete(request, controller.signal).finally(() => {
      clearTimeout(timer);
    });
  };

  const complete = async (
    request: CompletionRequest,
    options: CompletionOptions = {},
  ): Promise<CompletionResponse> => {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    const provider = findProvider(options.preferProvider ?? activeProvider);

    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await callWithTimeout(provider, request, timeoutMs);
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          await sleep(retryDelayMs * 2 ** attempt);
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  };

  return {
    providers,
    get activeProvider() {
      return activeProvider;
    },
    complete,
    setActiveProvider(name) {
      findProvider(name);
      activeProvider = name;
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
