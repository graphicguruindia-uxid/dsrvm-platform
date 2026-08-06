# M3.2 — Billing Portal + Webhook Events Seam (DSRA-14)

Built on `@dsrvm/web` v0.3.0 (packages/web) + `@dsrvm/web-app` v0.3.0 (apps/web).

## Plan catalog & billing portal

`packages/web/src/billing.ts` — `createBillingService(store, now)` now exposes, in addition to the existing metering hooks:

- `PLAN_CATALOG: Record<PlanName, PlanInfo>` — starter ($0), growth ($299/mo), enterprise ($1499/mo), each carrying `priceUsd` plus the existing `PlanLimit` (`seats`, `publishedItems`, `monthlyAiBudgetUsd`). `PLAN_LIMITS` is derived from the catalog, so limits and pricing stay in one place.
- `plans(): Array<PlanInfo & { plan: PlanName }>` — the public pricing list (name + price + limits).
- `setPlan({ tenantId, plan })` — validates the plan name and persists it via `store.getTenant` + `saveTenant` (works for both the in-memory `createWebStore` and `PgWebStore` upsert). Returns the updated tenant.
- `usageReport(tenantId)` — current-month rollup: `totalUsd`, `totalRecords`, `byTask[{task,count,estCostUsd}]`, `byModel[{model,count,estCostUsd}]`.
- `statement(tenantId)` — `{ plan, planFeeUsd, usageCostUsd, totalUsd, remainingAiBudgetUsd, period, generatedAt }`.

New types in `packages/web/src/types.ts`: `PlanInfo extends PlanLimit`, `UsageReport`, `Statement`.

## Webhook events seam

`packages/web/src/billing-webhook.ts` — new zero-dependency module (node:crypto only), mirroring the `sso.ts` seam pattern:

- `sign(body)` / `verify(signature, body)` — Stripe-style `t=<unix-ts>,v1=<hex-hmac-sha256>` over `"<ts>.<body>"`, timing-safe comparison, ±5-minute tolerance.
- `handleEvent(event)` — idempotent by `event.id` (TTL 24h seen-set, pruned lazily; an event is only marked seen **after** its handler succeeds, so provider retries can recover from transient failures). Dispatch map:
  - `customer.subscription.updated` → `billing.setPlan({ tenantId, plan })`
  - `invoice.payment_failed` → records a tenant flag (`flags(tenantId)`, TTL 30d) and rejects unknown tenants
  - any other type → `{ handled: false }` (acknowledged, no-op)
- `supportedEvents()` — lists the two handled types.

`service.ts` wires it when `billingWebhookSecret` is supplied: `WebReferenceService.billingWebhook: BillingWebhookService | null` (null when unconfigured).

## HTTP routes (apps/web)

- `GET /api/billing/plans` — public catalog.
- `GET /api/billing/portal` — requires `billingView` (owner/admin); returns tenant + statement + usage report + webhook flags.
- `PATCH /api/billing/plan` — requires `billingManage` (owner); body `{ plan }`, applies to the session tenant.
- `POST /api/billing/webhooks` — no user auth; requires `x-billing-signature` header verified against the raw body, then parses the event and dispatches. Uses a Fastify-scoped `contentTypeParser` (`parseAs: "string"`) so the exact request bytes are HMAC-verified before parsing. Returns 401 on missing/tampered/stale signatures and `{ received, handled, replayed }` on success.

## Verification

- `packages/web`: 43 tests pass (18 in web.test.ts, 21 in sso.test.ts, 4 pglite) — new coverage for the catalog/setPlan/report/statement math, signature round-trip + tamper/expiry, event dispatch, flag recording, unknown-event no-op, and idempotent replay.
- `apps/web`: 11 HTTP tests pass — portal/plan RBAC (owner ok, viewer 403), public plans, and the webhook endpoint (missing header 401, forged 401, valid 200 + plan applied, replay 200 `replayed: true`, stale timestamp 401).
- Turborepo: 40/40 tasks green (lint, typecheck, test, build).
- Live smoke on 127.0.0.1:3210: bootstrap → owner login → plans [starter 0, growth 299, enterprise 1499] → portal (growth) → PATCH plan enterprise → record usage ($0.75) → signed `customer.subscription.updated` flips plan back to growth → signed `invoice.payment_failed` records flag → forged signature 401 → final portal shows plan growth, fee 299, usage 0.75, flags [invoice.payment_failed].

## Notes / seams

- Payment-failure flags are in-memory with a 30d TTL (same style as the SSO state store); persisting them to the tenant ledger is a follow-up (the Postgres schema already round-trips the tenant row, so `setPlan` is durable).
- The webhook event source (Stripe/Paddle/Chargebee) is abstracted away; only the signed event contract is consumed.
