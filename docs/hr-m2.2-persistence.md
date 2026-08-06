# HR Automation M2.2: Postgres + Drizzle persistence and outbox dispatch

**Issue:** DSRA-9 | **Milestone:** M2.2 of HR product line (follow-up to DSRA-6/M2.1) | **Status:** Done | **Date:** 2026-08-04

## Purpose
Make the DSRA-6 MVP persistent and production-ready: replace the in-memory stores with a real Postgres backend behind the existing `Store` interface, and add a lease-based outbox dispatcher for exactly-once, retry-safe dispatch of downstream actions.

## Design
- The four `Store` interfaces (`candidates`, `roles`, `audit`, `outbox`) are unchanged, so the `HrService` pipeline is untouched. A new Postgres implementation plugs in behind them.
- Drizzle ORM (pg-core) schema in `src/db/schema.ts` mirrors the domain model. Timestamps are stored as UTC ISO-8601 text for lossless round-trips; structured data (`requirements`, `niceToHave`, `screening`, `review`, `detail`, `payload`) uses jsonb.
- Outbox rows carry a `dispatchedAt` marker plus a `claimedUntil` lease. `claimForDispatch` is an atomic conditional `UPDATE ... WHERE dispatched_at IS NULL AND (claimed_until IS NULL OR claimed_until < <new lease>)`, so only one worker can win a dispatch lease. Failures release the lease for retry; success marks dispatched.
- The dispatcher (`src/outbox.ts`) polls pending events, claims each with a lease, invokes the handler, then marks dispatched (or releases the lease + reports the error). Supports custom poll interval, lease duration, clock, error callback, and `AbortSignal` stop.

## Package: packages/hr (bumped to v0.2.0)
- `src/db/schema.ts` — Drizzle pg-core tables: `roles`, `candidates`, `audit_events`, `outbox_events` (jsonb-typed), with `outbox_pending_idx` and `outbox_candidate_idx` indexes.
- `src/db/pg-store.ts` — `PgRoleStore`, `PgCandidateStore`, `PgAuditStore`, `PgOutboxStore` implementing the existing store interfaces; `createPgStore(db)` and `createPostgresStore(url)` (pg Pool + drizzle wiring, returns `{ store, close }`).
- `src/outbox.ts` — `createOutboxDispatcher({ outbox, handler, pollIntervalMs, leaseMs, now, onError, signal })` with `poll()`/`start()`/`stop()`.
- `src/store.ts` — `OutboxStore` extended with `ClaimableOutboxStore` (`claimForDispatch`, `releaseClaim`); the in-memory store implements it too, so the dispatcher works against both backends.
- Persistence swaps by construction: `HrService({ store: createPostgresStore(url).store, ... })` or `createInMemoryStore()` — no service changes.

## Validation
- Tests: `src/outbox.test.ts` (4) + `src/db/pg-store.test.ts` (5) = **9 new tests**, all passing against a real in-process Postgres (`@electric-sql/pglite`) for the persistence layer. Coverage: full pipeline round-trip incl. jsonb arrays/nested objects, data visible across store instances (reconnect), exactly-once lease claiming, lease expiry re-claim, release-and-retry on handler failure, dispatch idempotency, missing-candidate guard.
- hr package: 17/17 tests (8 original + 9 new). Monorepo turbo green: build/test/typecheck 9/9, lint 8/8.
- Production path uses `pg` + node-postgres against the same Drizzle schema; the migration DDL can be generated with `drizzle-kit generate` when a live Postgres is provisioned.

## Follow-ups
- Wire the Postgres store into an app (apps/hr-automation API) and generate/manage real Drizzle migrations via `drizzle-kit` once hosting + DB are chosen (blocked on DSRA-4 infra decisions).
- M2.4 reviewer UI (apps/hr-automation) on top of the persisted pipeline.
- M2.3 ingest adapters (ATS import, email-to-candidate).
- Multi-tenancy (per-client data isolation) still deferred to M3.1.
