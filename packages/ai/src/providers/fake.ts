import type { LlmProvider } from "../provider.js";
import type { CompletionRequest, CompletionResponse } from "../types.js";

export interface FakeProviderOptions {
  name?: string;
  echo?: boolean;
  output?: string;
  errorRate?: number;
}

export function createFakeProvider(
  options: FakeProviderOptions = {},
): LlmProvider {
  const name = options.name ?? "fake";
  return {
    name,
    async complete(request: CompletionRequest, signal?: AbortSignal) {
      if (signal?.aborted) {
        throw new Error(`${name}: request aborted`);
      }
      if (options.errorRate && Math.random() < options.errorRate) {
        throw new Error(`${name}: simulated failure`);
      }
      const prompt = request.messages
        .map((message) => message.content)
        .join("\n");
      const text =
        options.echo !== false
          ? `[${name} echo:${prompt}]`
          : (options.output ?? "ok");
      const response: CompletionResponse = {
        provider: name,
        model: request.model ?? "fake-model",
        text,
        usage: {
          inputTokens: prompt.length,
          outputTokens: text.length,
        },
      };
      return response;
    },
  };
}
