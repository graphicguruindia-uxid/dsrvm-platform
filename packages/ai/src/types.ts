export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export type ResponseFormat = "text" | "json" | "json_schema";

export interface CompletionRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: ResponseFormat;
  jsonSchema?: Record<string, unknown>;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
}

export type JsonType =
  "object" | "array" | "string" | "number" | "boolean" | "null";

export interface JsonSchema {
  type?: JsonType;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
}

export interface CompletionResponse {
  provider: string;
  model: string;
  text: string;
  usage?: Usage;
  raw?: unknown;
}

export interface CompletionOptions {
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  preferProvider?: string;
}
