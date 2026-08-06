import type { LlmProvider } from "../provider.js";
import type { CompletionRequest, CompletionResponse } from "../types.js";

export interface OpenAiProviderOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export function createOpenAiProvider(
  options: OpenAiProviderOptions = {},
): LlmProvider {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "createOpenAiProvider: OPENAI_API_KEY is required (set the env var or pass apiKey)",
    );
  }
  const model = options.model ?? "gpt-4o-mini";
  const baseUrl = options.baseUrl ?? "https://api.openai.com";
  const name = "openai";

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

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          `openai HTTP ${response.status}: ${detail.slice(0, 300)}`,
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
