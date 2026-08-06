# HR Automation Reviewer App v0.2.0 (@dsrvm/hr-automation)

**Issue:** DSRA-10 | **Milestone:** M2.4 of tech-roadmap | **Status:** Done | **Date:** 2026-08-04

## Purpose
Make the HR automation product demoable end-to-end: human-in-the-loop review is now a real, runnable app with an HTTP API and a reviewer dashboard, wired to the @dsrvm/hr pipeline (DSRA-6) and its Postgres/Drizzle persistence + outbox dispatcher (DSRA-9).

## What shipped (apps/hr-automation)
- `src/server.ts` — Fastify API factory `buildReviewerServer(hr)`:
  - `GET /health`, `GET /` (dashboard HTML)
  - `GET/POST /api/roles`
  - `GET /api/candidates?status=`, `POST /api/candidates` (intake + AI screen in one call), `GET /api/candidates/:id`
  - `POST /api/candidates/:id/review` (approve/reject + reviewer + note) — 400/404/409 validation & state-machine guards
  - `GET /api/audit` (immutable audit trail)
- `src/dashboard.ts` — dependency-free reviewer dashboard: candidate intake form, review queue with score/recommendation/summary/strengths/flags, approve/reject, live audit table.
- `src/app.ts` — wiring `createReviewerApp()`: provider-agnostic screening through @dsrvm/ai; a deterministic `demo` provider (keyword-hash scoring, no API key, no network) by default; `PROVIDER=demo|fake|anthropic|openai` toggles real LLMs; `DATABASE_URL` swaps in the Postgres store; `signal` starts the lease-based outbox dispatcher (logs dispatched actions).
- `src/seed.ts` — `seedDemo(hr)`: creates a Founding Engineer role + 4 historical-engineer candidates screened into the queue.
- `src/index.ts` — entry: `PORT` (default 3001), `SEED_DEMO=1`, graceful shutdown.

## Validation
- 8 new API tests (`src/server.test.ts`, fastify.inject): health, dashboard HTML, role creation, intake→screening→queue, approve (status + outbox `candidate.approved` + audit), reject (`candidate.rejected`), payload/transition guards, and seedDemo populating a 4-candidate queue.
- Live smoke test: `node dist/index.js` with `SEED_DEMO=1` on port 3101 returned health OK, dashboard HTML, and a populated queue (Ada 59 needs_review / Alan 97 advance / Grace 44 reject / Margaret 86 advance).
- Monorepo (turbo): build 8/8, test 10/10 (57 tests: ai 26, hr 17, hr-automation 8, others 6), typecheck 10/10, lint 8/8 — all green.

## Demo
```bash
cd apps/hr-automation
pnpm dev            # or: node dist/index.js
# http://localhost:3001  (PROVIDER=demo, in-memory store)
PROVIDER=anthropic ANTHROPIC_API_KEY=... DATABASE_URL=... SEED_DEMO=1 pnpm dev   # real providers + Postgres
```

## Follow-ups
- M2.3 ingest adapters (ATS import, email-to-candidate, resume file upload/parsing).
- Real auth + reviewer identity (RBAC) before external pilot; M3.1 multi-tenancy (per-client isolation).
- Wire token/cost capture from @dsrvm/ai usage into telemetry when DSRA-8 starts.
- drizzle-kit migrations + live deploy once hosting/infra decided (DSRA-4 open decisions).
