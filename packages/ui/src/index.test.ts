import { describe, expect, it } from "vitest";
import { cn } from "./index.js";

describe("cn", () => {
  it("joins truthy parts and skips falsy ones", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
    expect(cn()).toBe("");
  });
});
