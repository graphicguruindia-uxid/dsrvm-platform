import type { OutboxEvent } from "./types.js";
import type { ClaimableOutboxStore } from "./store.js";

export interface OutboxDispatcherOptions {
  outbox: ClaimableOutboxStore;
  handler: (event: OutboxEvent) => Promise<void>;
  pollIntervalMs?: number;
  leaseMs?: number;
  now?: () => Date;
  onError?: (error: unknown, event: OutboxEvent) => void;
  signal?: AbortSignal;
}

export interface OutboxDispatcher {
  poll(): Promise<number>;
  start(): Promise<void>;
  stop(): void;
  readonly running: boolean;
}

export function createOutboxDispatcher(
  options: OutboxDispatcherOptions,
): OutboxDispatcher {
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  const leaseMs = options.leaseMs ?? 30_000;
  const now = options.now ?? (() => new Date());
  const { outbox, handler, onError, signal } = options;

  let timer: NodeJS.Timeout | null = null;
  let polling = false;
  let running = false;

  async function pollOnce(): Promise<number> {
    const pending = await outbox.pending();
    let handled = 0;
    for (const event of pending) {
      const leaseUntil = new Date(now().getTime() + leaseMs).toISOString();
      const claimed = await outbox.claimForDispatch(event.id, leaseUntil);
      if (!claimed) continue;
      try {
        await handler(event);
        await outbox.markDispatched(event.id);
        handled += 1;
      } catch (error) {
        await outbox.releaseClaim(event.id);
        onError?.(error, event);
      }
    }
    return handled;
  }

  async function loop(): Promise<void> {
    if (polling) return;
    polling = true;
    try {
      await pollOnce();
    } finally {
      polling = false;
    }
    if (running && !signal?.aborted) {
      timer = setTimeout(() => {
        void loop();
      }, pollIntervalMs);
    }
  }

  return {
    async poll() {
      return pollOnce();
    },
    async start() {
      running = true;
      await loop();
    },
    stop() {
      running = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    get running() {
      return running;
    },
  };
}
