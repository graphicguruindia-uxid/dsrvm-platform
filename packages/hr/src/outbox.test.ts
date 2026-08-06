import { describe, expect, it } from "vitest";
import type { OutboxEvent } from "./types.js";
import { createOutboxDispatcher } from "./outbox.js";
import { InMemoryOutboxStore } from "./store.js";

const AT = "2026-08-04T00:00:00.000Z";

function event(id: string, dispatchedAt: string | null = null): OutboxEvent {
  return {
    id,
    type: "candidate.approved",
    candidateId: "cand-1",
    payload: { candidateId: "cand-1" },
    at: AT,
    dispatchedAt,
  };
}

describe("outbox dispatcher", () => {
  it("dispatches each pending event exactly once and marks it dispatched", async () => {
    const outbox = new InMemoryOutboxStore();
    await outbox.enqueue(event("e1"));
    await outbox.enqueue(event("e2"));

    const dispatched: string[] = [];
    const dispatcher = createOutboxDispatcher({
      outbox,
      handler: async (e) => {
        dispatched.push(e.id);
      },
      now: () => new Date(AT),
    });

    expect(await dispatcher.poll()).toBe(2);
    expect(dispatched).toEqual(["e1", "e2"]);
    expect(await outbox.pending()).toHaveLength(0);

    expect(await dispatcher.poll()).toBe(0);
    expect(dispatched).toEqual(["e1", "e2"]);
  });

  it("releases the claim and retries when the handler fails", async () => {
    const outbox = new InMemoryOutboxStore();
    await outbox.enqueue(event("e1"));

    const failures: string[] = [];
    const errors: unknown[] = [];
    const dispatcher = createOutboxDispatcher({
      outbox,
      handler: async (e) => {
        if (failures.length === 0) {
          failures.push(e.id);
          throw new Error("downstream down");
        }
      },
      onError: (error) => errors.push(error),
      now: () => new Date(AT),
    });

    expect(await dispatcher.poll()).toBe(0);
    expect(errors).toHaveLength(1);
    expect(await outbox.pending()).toHaveLength(1);

    expect(await dispatcher.poll()).toBe(1);
    expect(await outbox.pending()).toHaveLength(0);
  });

  it("does not double-dispatch a leased event", async () => {
    const outbox = new InMemoryOutboxStore();
    await outbox.enqueue(event("e1"));

    const claims: string[] = [];
    const dispatcher = createOutboxDispatcher({
      outbox,
      handler: async (e) => {
        claims.push(e.id);
        const reClaimed = await outbox.claimForDispatch(
          e.id,
          new Date(new Date(AT).getTime() + 30_000).toISOString(),
        );
        expect(reClaimed).toBe(false);
      },
      now: () => new Date(AT),
    });

    expect(await dispatcher.poll()).toBe(1);
    expect(claims).toEqual(["e1"]);
  });

  it("start/stop runs the loop and honors abort", async () => {
    const outbox = new InMemoryOutboxStore();
    await outbox.enqueue(event("e1"));

    const control = new AbortController();
    const dispatched: string[] = [];
    const dispatcher = createOutboxDispatcher({
      outbox,
      handler: async (e) => {
        dispatched.push(e.id);
      },
      now: () => new Date(AT),
      pollIntervalMs: 10,
      signal: control.signal,
    });

    await dispatcher.start();
    expect(dispatcher.running).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 40));
    control.abort();
    dispatcher.stop();
    expect(dispatched).toEqual(["e1"]);
    expect(dispatcher.running).toBe(false);
  });
});
