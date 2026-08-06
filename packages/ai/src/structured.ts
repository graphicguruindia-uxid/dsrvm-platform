import type { LlmGateway } from "./gateway.js";
import type { ChatMessage, JsonSchema } from "./types.js";

export interface StructuredOptions {
  maxRetries?: number;
}

export interface StructuredResult<T> {
  data: T;
  raw: string;
}

const JSON_INSTRUCTION: ChatMessage = {
  role: "system",
  content:
    "You are a JSON-only assistant. Respond with a single valid JSON object that satisfies the provided schema. No prose, no markdown fences.",
};

export async function generateStructured<T>(
  gateway: LlmGateway,
  messages: ChatMessage[],
  schema: JsonSchema,
  options: StructuredOptions = {},
): Promise<StructuredResult<T>> {
  const maxRetries = options.maxRetries ?? 1;
  let working = [JSON_INSTRUCTION, ...messages];
  let lastError: unknown = new Error("structured output did not match schema");

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await gateway.complete({
      messages: working,
      responseFormat: "json",
      jsonSchema: schema as unknown as Record<string, unknown>,
      temperature: 0,
    });

    const parsed = tryParseJson(response.text);
    if (parsed !== null && validateJson(parsed, schema)) {
      return { data: parsed as T, raw: response.text };
    }

    lastError = new Error(
      `generateStructured: response did not match schema (attempt ${attempt + 1})`,
    );
    working = [
      ...working,
      { role: "assistant", content: response.text },
      {
        role: "user",
        content: `Your previous response did not satisfy this schema: ${JSON.stringify(schema)}. Respond with a single valid JSON object matching the schema.`,
      },
    ];
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function tryParseJson(text: string): unknown | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1]! : trimmed).trim();
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1)) as unknown;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function validateJson(value: unknown, schema: JsonSchema): boolean {
  if (schema.type === "object" || schema.properties || schema.required) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return false;
    }
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in record)) return false;
    }
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (key in record && !validateJson(record[key], child)) return false;
    }
    return true;
  }

  if (schema.type === "array") {
    if (!Array.isArray(value)) return false;
    if (schema.items) {
      return value.every((item) => validateJson(item, schema.items!));
    }
    return true;
  }

  switch (schema.type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    case undefined:
      return true;
    default:
      return false;
  }
}
