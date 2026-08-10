# Telemetry retention (TTL) - configurable rotation/expiry

Version: v1 | Date: 2026-08-10 | Owner: CTO 2 / CEO governance triage (DSRA-17)
Linked: ROPA G6 retention schedule (90-day telemetry), DPIA (DSRA-26), DSRA-17

## Purpose

Telemetry and AI-usage metrics have no PII by design, but ROPA v1.1 (G6) sets a
**90-day retention** window for aggregated usage metrics. This package makes that
window configurable and enforces expiry (rotation) so stale metrics drop out of
reports automatically.

## Behaviour

### `MetricsRegistry` and `createUsageTracker` now accept `ttlMs`

- `MetricsRegistryOptions.ttlMs` (default `0` = no expiry, previous behaviour).
- `UsageTrackerOptions.ttlMs` (default `0` = keep all records).

When `ttlMs > 0`:

- **Expiry** - any metric/usage record whose last write (registry) or event time
  (usage tracker) is older than `ttlMs` is dropped from the next `snapshot()`,
  `records()`, or metric mutation. Expired data never appears in reports.
- **Rotation** - after expiry, the next write for the same key starts fresh:
  a counter restarts at the new increment (it is not carried forward), a gauge
  is re-registered, and a histogram accumulator is rebuilt.
- Tagged series expire independently: `calls{outcome=approved}` and
  `calls{outcome=rejected}` each have their own last-write timestamp.

### Wiring in `apps/hr-automation`

- Default TTL = **90 days** (`DEFAULT_TELEMETRY_TTL_MS`) in `createReviewerApp`,
  matching the ROPA telemetry row. Override per deployment with
  `TELEMETRY_TTL_MS` (env, ms) or `telemetryTtlMs` (app option).
- `GET /api/telemetry` reports only non-expired metrics.

## Configuration reference

| Env var | Type | Default | Meaning |
|---|---|---|---|
| `TELEMETRY_TTL_MS` | number (ms) | 90 days | Expire telemetry/metrics older than this |

## Tests

- `packages/telemetry/src/ttl.test.ts` - expiry, rotation (fresh counter after
  expiry), independent tagged-series expiry, no-TTL keep-forever for both
  registry and usage tracker.

## Notes

- This covers the *in-memory* aggregation window per ROPA. A durable sink
  (e.g. `JsonlFileSink`) retains files per its own file lifecycle; the 90-day
  schedule for persisted telemetry is governed by the storage/backup policy.
- The outbox/candidate/audit side of G6 is implemented in `@dsrvm/hr`
  `retentionCleanup()` + `POST /api/retention/cleanup` (see DPIA Section 6.5).
