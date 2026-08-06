import { describe, expect, it } from "vitest";
import { createDbClient } from "./index.js";

describe("createDbClient", () => {
  it("reports connected when a url is configured", async () => {
    const client = createDbClient({ url: "postgres://localhost:5432/dsrvm" });
    await expect(client.healthCheck()).resolves.toEqual({ connected: true });
  });

  it("reports disconnected when no url is configured", async () => {
    const client = createDbClient({ url: "" });
    await expect(client.healthCheck()).resolves.toEqual({ connected: false });
  });
});
