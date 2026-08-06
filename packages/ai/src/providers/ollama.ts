import type { LlmProvider } from "../provider.js";
import type { CompletionRequest, CompletionResponse } from "../types.js";

export interface OllamaProviderOptions {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}

const DEFAULT_BASE_URL = "http://localhost:11434/v1";
const DEFAULT_MODEL = "llama3.2";

export function createOllamaProvider(
  options: OllamaProviderOptions = {},
): LlmProvider {
  const baseUrl = (
    options.baseUrl ??
    process.env.OLLAMA_BASE_URL ??
    DEFAULT_BASE_URL
  ).replace(/\/$/, "");
  const model = options.model ?? process.env.OLLAMA_MODEL ?? DEFAULT_MODEL;
  const name = "ollama";

  return {
    name,
    async complete(request: CompletionRequest, signal?: AbortSignal) {
      const body: Record<string, unknown> = {
        model: request.model ?? model,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 1024,
        messages: request.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      };
      if (request.responseFormat === "json") {
        body.response_format = { type: "json_object" };
      } else if (request.responseFormat === "json_schema") {
        body.response_format = {
          type: "json_schema",
          json_schema: {
            name: "structured_output",
            strict: true,
            schema: request.jsonSchema,
          },
        };
      }

      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      const apiKey = options.apiKey ?? process.env.OLLAMA_API_KEY;
      if (apiKey) headers.authorization = `Bearer ${apiKey}`;

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          `ollama HTTP ${response.status}: ${detail.slice(0, 300)}`,
        );
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = data.choices?.[0]?.message?.content ?? "";

      return {
        provider: name,
        model: request.model ?? model,
        text,
        usage: {
          inputTokens: data.usage?.prompt_tokens,
          outputTokens: data.usage?.completion_tokens,
        },
        raw: data,
      };
    },
  };
}
