import { describe, expect, it } from "vitest";
import { createAnthropicProvider } from "./anthropic.js";
import { createOpenAiProvider } from "./openai.js";

describe("provider credential guards", () => {
  it("anthropic requires an api key", () => {
    expect(() => createAnthropicProvider({ apiKey: "" })).toThrow(
      /ANTHROPIC_API_KEY/,
    );
  });

  it("openai requires an api key", () => {
    expect(() => createOpenAiProvider({ apiKey: "" })).toThrow(
      /OPENAI_API_KEY/,
    );
  });
});
