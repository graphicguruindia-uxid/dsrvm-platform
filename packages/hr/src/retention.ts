import type {
  HrService,
  RetentionCleanupCounts,
  RetentionSchedule,
} from "./service.js";

export interface RetentionCleanerOptions {
  service: HrService;
  schedule?: RetentionSchedule;
  pollIntervalMs?: number;
  now?: () => Date;
  signal?: AbortSignal;
  onError?: (error: unknown) => void;
  logger?: (message: string) => void;
}

export interface RetentionCleaner {
  run(): Promise<RetentionCleanupCounts>;
  start(): Promise<void>;
  stop(): void;
  readonly running: boolean;
}

export function createRetentionCleaner(
  options: RetentionCleanerOptions,
): RetentionCleaner {
  const pollIntervalMs = options.pollIntervalMs ?? 60 * 60 * 1000;
  const now = options.now ?? (() => new Date());
  const { service, schedule, signal, onError, logger } = options;

  let timer: NodeJS.Timeout | null = null;
  let cleaning = false;
  let running = false;

  async function runOnce(): Promise<RetentionCleanupCounts> {
    return service.retentionCleanup(schedule);
  }

  async function loop(): Promise<void> {
    if (cleaning) return;
    cleaning = true;
    try {
      const counts = await runOnce();
      logger?.(
        `retention cleanup: ${counts.candidatesDeleted} candidates, ` +
          `${counts.auditAnonymized} audit events, ${counts.outboxExpired} outbox events`,
      );
    } catch (error) {
      onError?.(error);
    } finally {
      cleaning = false;
    }
    if (running && !signal?.aborted) {
      timer = setTimeout(() => {
        void loop();
      }, pollIntervalMs);
    }
  }

  return {
    async run() {
      return runOnce();
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
