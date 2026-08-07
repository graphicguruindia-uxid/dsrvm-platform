import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { createWorkerServerFactory, fetchHandler } from "./index.js";

describe("fetchHandler", () => {
  it("routes a GET request through the stub server factory", async () => {
    const app = Fastify({
      logger: false,
      serverFactory: createWorkerServerFactory() as never,
    });
    app.get("/health", async () => ({ status: "ok" }));
    await app.ready();

    const res = await fetchHandler(
      app as never,
      new Request("https://x.test/health"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("supports POST bodies", async () => {
    const app = Fastify({
      logger: false,
      serverFactory: createWorkerServerFactory() as never,
    });
    app.post<{ Body: { name: string } }>(
      "/echo",
      async (request) => request.body,
    );
    await app.ready();

    const res = await fetchHandler(
      app as never,
      new Request("https://x.test/echo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "ada" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "ada" });
  });
});
