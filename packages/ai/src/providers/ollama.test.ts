import { afterEach, describe, expect, it, vi } from "vitest";
import { createOllamaProvider } from "./ollama.js";

function fetchStub(response: Response) {
  return vi.fn(
    async (_input: string, _init?: RequestInit): Promise<Response> => response,
  );
}

describe("createOllamaProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to the OpenAI-compatible chat completions endpoint", async () => {
    const fetchMock = fetchStub(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "hello from llama3.2" } }],
          usage: { prompt_tokens: 12, completion_tokens: 4 },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createOllamaProvider({
      baseUrl: "http://localhost:11434/v1",
    });
    const response = await provider.complete({
      messages: [{ role: "user", content: "hi" }],
    });

    expect(response.provider).toBe("ollama");
    expect(response.model).toBe("llama3.2");
    expect(response.text).toBe("hello from llama3.2");
    expect(response.usage).toEqual({ inputTokens: 12, outputTokens: 4 });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    expect(init!.method).toBe("POST");
    expect(JSON.parse(init!.body as string)).toEqual({
      model: "llama3.2",
      temperature: 0.7,
      max_tokens: 1024,
      messages: [{ role: "user", content: "hi" }],
    });
  });

  it("defaults base url and model when not configured", async () => {
    const fetchMock = fetchStub(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
        {
          status: 200,
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createOllamaProvider({});
    await provider.complete({ messages: [{ role: "user", content: "hi" }] });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    expect(JSON.parse(init!.body as string).model).toBe("llama3.2");
  });

  it("throws a descriptive error on non-2xx responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_input: string, _init?: RequestInit): Promise<Response> =>
          new Response("model not found", { status: 404 }),
      ),
    );
    const provider = createOllamaProvider({});
    await expect(
      provider.complete({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow(/ollama HTTP 404/);
  });

  it("honours per-request model and structured json format", async () => {
    const fetchMock = fetchStub(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "{}" } }] }),
        {
          status: 200,
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createOllamaProvider({});
    await provider.complete({
      messages: [{ role: "user", content: "hi" }],
      model: "qwen2.5",
      responseFormat: "json",
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init!.body as string);
    expect(body.model).toBe("qwen2.5");
    expect(body.response_format).toEqual({ type: "json_object" });
  });
});
