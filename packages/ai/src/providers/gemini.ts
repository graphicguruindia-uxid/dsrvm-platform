import type { LlmProvider } from "../provider.js";
import type {
  ChatMessage,
  CompletionRequest,
  CompletionResponse,
} from "../types.js";

export interface GeminiProviderOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export function createGeminiProvider(
  options: GeminiProviderOptions = {},
): LlmProvider {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "createGeminiProvider: GEMINI_API_KEY is required (set the env var or pass apiKey)",
    );
  }
  const model = options.model ?? "gemini-2.0-flash";
  const baseUrl =
    options.baseUrl ?? "https://generativelanguage.googleapis.com";
  const name = "gemini";

  return {
    name,
    async complete(request: CompletionRequest, signal?: AbortSignal) {
      const { systemInstruction, contents } = toGeminiContents(
        request.messages,
      );
      const wantJson =
        request.responseFormat === "json" ||
        request.responseFormat === "json_schema";
      const body: Record<string, unknown> = {
        contents,
        generationConfig: {
          temperature: request.temperature ?? 0.7,
          maxOutputTokens: request.maxTokens ?? 1024,
          ...(wantJson ? { responseMimeType: "application/json" } : {}),
        },
        ...(systemInstruction ? { systemInstruction } : {}),
      };

      const url =
        `${baseUrl}/v1beta/models/${encodeURIComponent(request.model ?? model)}` +
        `:generateContent?key=${encodeURIComponent(apiKey)}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          `gemini HTTP ${response.status}: ${detail.slice(0, 300)}`,
        );
      }

      const data = (await response.json()) as {
        candidates?: {
          content?: { parts?: { text?: string }[] };
        }[];
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
        };
      };
      const text = (data.candidates?.[0]?.content?.parts ?? [])
        .map((part) => part.text ?? "")
        .join("");

      return {
        provider: name,
        model: request.model ?? model,
        text,
        usage: {
          inputTokens: data.usageMetadata?.promptTokenCount,
          outputTokens: data.usageMetadata?.candidatesTokenCount,
        },
        raw: data,
      };
    },
  };
}

function toGeminiContents(messages: ChatMessage[]): {
  systemInstruction?: { parts: { text: string }[] };
  contents: { role: "user" | "model"; parts: { text: string }[] }[];
} {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
      parts: [{ text: m.content }],
    }));
  if (contents.length === 0) {
    contents.push({ role: "user", parts: [{ text: system || "(no input)" }] });
    return { contents };
  }
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents,
  };
}
