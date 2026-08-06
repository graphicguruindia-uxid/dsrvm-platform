import { describe, expect, it } from "vitest";
import { createGateway } from "./gateway.js";
import { createFakeProvider } from "./providers/fake.js";
import { generateStructured, tryParseJson } from "./structured.js";
import type { JsonSchema } from "./types.js";

const schema: JsonSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    years: { type: "number" },
    active: { type: "boolean" },
  },
  required: ["name", "years"],
};

describe("generateStructured", () => {
  it("parses and validates the provider output", async () => {
    const gateway = createGateway([
      createFakeProvider({
        echo: false,
        output: '{"name":"Ada","years":37,"active":true}',
      }),
    ]);
    const { data, raw } = await generateStructured(
      gateway,
      [{ role: "user", content: "extract" }],
      schema,
    );
    expect(data).toEqual({ name: "Ada", years: 37, active: true });
    expect(typeof raw).toBe("string");
  });

  it("recovers from a first bad response", async () => {
    let calls = 0;
    const flaky = {
      name: "flaky",
      complete: async () => {
        calls += 1;
        return {
          provider: "flaky",
          model: "m",
          text: calls === 1 ? "not json at all" : '{"name":"Bob","years":5}',
        };
      },
    };
    const gateway = createGateway([flaky]);
    const { data } = await generateStructured(
      gateway,
      [{ role: "user", content: "extract" }],
      schema,
      { maxRetries: 2 },
    );
    expect(data).toEqual({ name: "Bob", years: 5 });
    expect(calls).toBe(2);
  });

  it("rejects when the output never matches the schema", async () => {
    const gateway = createGateway([
      createFakeProvider({ echo: false, output: "nope" }),
    ]);
    await expect(
      generateStructured(
        gateway,
        [{ role: "user", content: "extract" }],
        schema,
        {
          maxRetries: 0,
        },
      ),
    ).rejects.toThrow(/schema/);
  });
});

describe("tryParseJson", () => {
  it("parses plain json", () => {
    expect(tryParseJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses fenced json", () => {
    expect(tryParseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("returns null for garbage", () => {
    expect(tryParseJson("hello")).toBeNull();
  });
});
