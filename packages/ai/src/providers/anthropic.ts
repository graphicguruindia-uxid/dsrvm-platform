import type { LlmProvider } from "../provider.js";
import type { CompletionRequest, CompletionResponse } from "../types.js";

export interface AnthropicProviderOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

const JSON_SYSTEM =
  "You are a JSON-only assistant. Respond with a single valid JSON object that satisfies the requested schema. No prose, no markdown fences.";

export function createAnthropicProvider(
  options: AnthropicProviderOptions = {},
): LlmProvider {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "createAnthropicProvider: ANTHROPIC_API_KEY is required (set the env var or pass apiKey)",
    );
  }
  const model = options.model ?? "claude-sonnet-4-5";
  const baseUrl = options.baseUrl ?? "https://api.anthropic.com";
  const name = "anthropic";

  return {
    name,
    async complete(request: CompletionRequest, signal?: AbortSignal) {
      const wantJson =
        request.responseFormat === "json" ||
        request.responseFormat === "json_schema";
      const body: Record<string, unknown> = {
        model: request.model ?? model,
        max_tokens: request.maxTokens ?? 1024,
        temperature: request.temperature ?? 0.7,
        messages: request.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      };
      if (wantJson) {
        body.system = JSON_SYSTEM;
      }

      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          `anthropic HTTP ${response.status}: ${detail.slice(0, 300)}`,
        );
      }

      const data = (await response.json()) as {
        content?: { type?: string; text?: string }[];
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const text = (data.content ?? [])
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("");

      return {
        provider: name,
        model: request.model ?? model,
        text,
        usage: {
          inputTokens: data.usage?.input_tokens,
          outputTokens: data.usage?.output_tokens,
        },
        raw: data,
      };
    },
  };
}
