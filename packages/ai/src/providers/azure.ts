import type { LlmProvider } from "../provider.js";
import type { CompletionRequest, CompletionResponse } from "../types.js";

export interface AzureOpenAiProviderOptions {
  apiKey?: string;
  endpoint?: string;
  deployment?: string;
  apiVersion?: string;
  model?: string;
}

export function createAzureOpenAiProvider(
  options: AzureOpenAiProviderOptions = {},
): LlmProvider {
  const apiKey = options.apiKey ?? process.env.AZURE_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "createAzureOpenAiProvider: AZURE_OPENAI_API_KEY is required (set the env var or pass apiKey)",
    );
  }
  const endpoint = (
    options.endpoint ??
    process.env.AZURE_OPENAI_ENDPOINT ??
    ""
  ).replace(/\/+$/, "");
  if (!endpoint) {
    throw new Error(
      "createAzureOpenAiProvider: AZURE_OPENAI_ENDPOINT is required (set the env var or pass endpoint)",
    );
  }
  const deployment =
    options.deployment ?? process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-4o-mini";
  const apiVersion = options.apiVersion ?? "2024-08-01-preview";
  const model = options.model ?? deployment;
  const name = "azure-openai";

  return {
    name,
    async complete(request: CompletionRequest, signal?: AbortSignal) {
      const body: Record<string, unknown> = {
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

      const url =
        `${endpoint}/openai/deployments/${encodeURIComponent(deployment)}` +
        `/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "api-key": apiKey,
        },
        body: JSON.stringify(body),
        signal,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          `azure-openai HTTP ${response.status}: ${detail.slice(0, 300)}`,
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
