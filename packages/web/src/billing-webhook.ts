import { createHmac, timingSafeEqual } from "node:crypto";
import type { BillingHook } from "./billing.js";
import type { WebStore } from "./store.js";
import type { PlanName } from "./types.js";

const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;
const SEEN_TTL_MS = 24 * 60 * 60 * 1000;
const FLAG_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const SUPPORTED_WEBHOOK_EVENTS = [
  "customer.subscription.updated",
  "invoice.payment_failed",
] as const;

export type BillingWebhookEventType = (typeof SUPPORTED_WEBHOOK_EVENTS)[number];

export interface BillingEvent {
  id: string;
  type: string;
  createdAt: string;
  data: Record<string, unknown>;
}

export interface BillingFlag {
  tenantId: string;
  reason: string;
  eventId: string;
  createdAt: string;
}

export interface BillingWebhookResult {
  handled: boolean;
  replayed: boolean;
}

export interface BillingWebhookService {
  sign(body: string, at?: number): string;
  verify(signature: string, body: string, at?: number): boolean;
  handleEvent(event: BillingEvent): Promise<BillingWebhookResult>;
  flags(tenantId: string): Promise<BillingFlag[]>;
  supportedEvents(): string[];
}

export function createBillingWebhookService(deps: {
  secret: string;
  store: WebStore;
  billing: BillingHook;
  now?: () => Date;
}): BillingWebhookService {
  const now = deps.now ?? (() => new Date());
  const seen = new Map<string, number>();
  const flagsByTenant = new Map<string, BillingFlag[]>();

  function pruneSeen(at: number) {
    for (const [id, createdAt] of seen) {
      if (at - createdAt > SEEN_TTL_MS) seen.delete(id);
    }
  }

  function sign(body: string, at?: number): string {
    const timestamp = Math.floor((at ?? now().getTime()) / 1000);
    const digest = createHmac("sha256", deps.secret)
      .update(`${timestamp}.${body}`)
      .digest("hex");
    return `t=${timestamp},v1=${digest}`;
  }

  function verify(signature: string, body: string, at?: number): boolean {
    const parsed = parseSignature(signature);
    if (parsed.timestamp === undefined || parsed.v1 === undefined) return false;
    if (
      Math.abs((at ?? now().getTime()) - parsed.timestamp * 1000) >
      SIGNATURE_TOLERANCE_MS
    ) {
      return false;
    }
    const expected = createHmac("sha256", deps.secret)
      .update(`${parsed.timestamp}.${body}`)
      .digest("hex");
    return safeEqualHex(parsed.v1, expected);
  }

  async function handleEvent(
    event: BillingEvent,
  ): Promise<BillingWebhookResult> {
    const at = now().getTime();
    pruneSeen(at);
    if (seen.has(event.id)) {
      return { handled: false, replayed: true };
    }

    const handlers: Record<string, (event: BillingEvent) => Promise<void>> = {
      "customer.subscription.updated": async (ev) => {
        const tenantId = stringValue(ev.data.tenantId);
        const plan = stringValue(ev.data.plan);
        if (!tenantId || !plan) {
          throw new Error(
            `webhook event "${ev.id}" requires data.tenantId and data.plan`,
          );
        }
        await deps.billing.setPlan({ tenantId, plan: plan as PlanName });
      },
      "invoice.payment_failed": async (ev) => {
        const tenantId = stringValue(ev.data.tenantId);
        if (!tenantId) {
          throw new Error(`webhook event "${ev.id}" requires data.tenantId`);
        }
        const tenant = await deps.store.getTenant(tenantId);
        if (!tenant) {
          throw new Error(`tenant "${tenantId}" not found`);
        }
        const flag: BillingFlag = {
          tenantId,
          reason: ev.type,
          eventId: ev.id,
          createdAt: ev.createdAt ?? now().toISOString(),
        };
        const existing = flagsByTenant.get(tenantId) ?? [];
        flagsByTenant.set(tenantId, [...existing, flag]);
      },
    };

    const handler = handlers[event.type];
    if (!handler) {
      return { handled: false, replayed: false };
    }
    await handler(event);
    seen.set(event.id, at);
    return { handled: true, replayed: false };
  }

  function flags(tenantId: string): Promise<BillingFlag[]> {
    const at = now().getTime();
    const current = (flagsByTenant.get(tenantId) ?? []).filter(
      (flag) => at - Date.parse(flag.createdAt) <= FLAG_TTL_MS,
    );
    flagsByTenant.set(tenantId, current);
    return Promise.resolve(current);
  }

  return {
    sign,
    verify,
    handleEvent,
    flags,
    supportedEvents() {
      return [...SUPPORTED_WEBHOOK_EVENTS];
    },
  };
}

function parseSignature(signature: string): {
  timestamp?: number;
  v1?: string;
} {
  const result: { timestamp?: number; v1?: string } = {};
  for (const part of signature.split(",")) {
    const [key, value] = part.trim().split("=", 2);
    if (key === "t" && value !== undefined && value.length > 0) {
      result.timestamp = Number(value);
    }
    if (key === "v1" && value !== undefined) {
      result.v1 = value;
    }
  }
  return result;
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
