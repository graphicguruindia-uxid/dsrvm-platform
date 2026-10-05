import { describe, expect, it } from "vitest";
import { createAnthropicProvider } from "./anthropic.js";
import { createAzureOpenAiProvider } from "./azure.js";
import { createGeminiProvider } from "./gemini.js";
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

  it("azure-openai requires an api key and an endpoint", () => {
    expect(() =>
      createAzureOpenAiProvider({
        apiKey: "",
        endpoint: "https://x.openai.azure.com",
      }),
    ).toThrow(/AZURE_OPENAI_API_KEY/);
    expect(() =>
      createAzureOpenAiProvider({ apiKey: "k", endpoint: "" }),
    ).toThrow(/AZURE_OPENAI_ENDPOINT/);
  });

  it("azure-openai and gemini construct with explicit credentials", () => {
    expect(
      createAzureOpenAiProvider({
        apiKey: "k",
        endpoint: "https://x.openai.azure.com",
      }).name,
    ).toBe("azure-openai");
    expect(createGeminiProvider({ apiKey: "k" }).name).toBe("gemini");
  });

  it("gemini requires an api key", () => {
    expect(() => createGeminiProvider({ apiKey: "" })).toThrow(
      /GEMINI_API_KEY/,
    );
  });
});
