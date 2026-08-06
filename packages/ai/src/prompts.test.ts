import { describe, expect, it } from "vitest";
import { definePrompt, PromptRegistry, renderPrompt } from "./prompts.js";

describe("renderPrompt", () => {
  it("fills placeholders", () => {
    const template = definePrompt({
      key: "screen",
      version: 1,
      template: "Screen {candidate} for {role}",
    });
    expect(renderPrompt(template, { candidate: "Ada", role: "Engineer" })).toBe(
      "Screen Ada for Engineer",
    );
  });

  it("throws on missing variables", () => {
    const template = definePrompt({
      key: "x",
      version: 1,
      template: "Hi {name}",
    });
    expect(() => renderPrompt(template, {})).toThrow(/name/);
  });
});

describe("PromptRegistry", () => {
  it("returns the latest version", () => {
    const registry = new PromptRegistry();
    registry.register(
      definePrompt({ key: "screen", version: 1, template: "v1" }),
    );
    registry.register(
      definePrompt({ key: "screen", version: 2, template: "v2" }),
    );
    expect(registry.latest("screen").version).toBe(2);
    expect(registry.get("screen", 1).template).toBe("v1");
  });

  it("throws for unknown keys", () => {
    const registry = new PromptRegistry();
    expect(() => registry.get("missing")).toThrow(/missing/);
  });

  it("throws for unknown versions", () => {
    const registry = new PromptRegistry();
    registry.register(definePrompt({ key: "a", version: 1, template: "A" }));
    expect(() => registry.get("a", 99)).toThrow(/version 99/);
  });

  it("lists all registered prompts", () => {
    const registry = new PromptRegistry();
    registry.register(definePrompt({ key: "a", version: 1, template: "A" }));
    registry.register(definePrompt({ key: "b", version: 1, template: "B" }));
    expect(registry.list()).toHaveLength(2);
  });
});
