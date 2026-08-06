import { describe, expect, it } from "vitest";
import { createFakeProvider } from "./fake.js";

describe("createFakeProvider", () => {
  it("echoes the prompt by default", async () => {
    const provider = createFakeProvider({ name: "fake" });
    const response = await provider.complete({
      messages: [{ role: "user", content: "hi" }],
    });
    expect(response.provider).toBe("fake");
    expect(response.text).toContain("[fake echo:");
  });

  it("returns a fixed output when configured", async () => {
    const provider = createFakeProvider({
      name: "fake",
      echo: false,
      output: '{"ok":true}',
    });
    const response = await provider.complete({
      messages: [{ role: "user", content: "hi" }],
    });
    expect(response.text).toBe('{"ok":true}');
  });
});
