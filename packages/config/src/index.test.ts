import { describe, expect, it } from "vitest";
import { packageName, tsconfigBaseFile } from "./index.js";

describe("config", () => {
  it("exposes the shared base tsconfig", () => {
    expect(packageName).toBe("@dsrvm/config");
    expect(tsconfigBaseFile).toBe("tsconfig.base.json");
  });
});
