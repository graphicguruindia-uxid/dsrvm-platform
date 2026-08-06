# ADR-001: Monorepo, pnpm + Turborepo

- Status: Accepted
- Date: 2026-08-04
- Author: CTO (0a60ddf9)

## Context

Three product lines (AI consulting, HR automation, enterprise web) share auth, billing,
admin console, and integrations. We need a repo structure that maximises reuse while
keeping per-app deployability.

## Decision

Adopt a pnpm-workspaces monorepo with Turborepo for task orchestration. Shared code lives
in `packages/*`; deployable units in `apps/*`.

## Consequences

- Single lockfile, one install, shared tooling config.
- Turborepo caches lint/type/test/build for fast CI.
- Requires discipline on package boundaries to avoid tight coupling.

---

# ADR-002: TypeScript everywhere (Node + React)

- Status: Accepted
- Date: 2026-08-04

One language across web, services, and AI glue reduces context-switching and allows
shared types between client and server. Node 22+ LTS, strict TypeScript.

---

# ADR-003: PostgreSQL as primary datastore (+ pgvector)

- Status: Accepted
- Date: 2026-08-04

Reliability, JSONB for flexible tenant schemas, and native vector support for RAG keep
our data and AI embeddings in one place in early stage. Revisit with a dedicated vector
store only if scale demands.

---

# ADR-004: Cloudflare for hosting (Pages + Workers)

- Status: Accepted
- Date: 2026-08-06
- Author: Board decision on DSRA-4 (supersedes earlier Vercel/Fly.io direction)

## Context

The board resolved hosting at infra decision time: "Cloudflare (Pages for the marketing/web
frontend, Workers for services)". The earlier scaffold referenced Vercel for web and
Fly.io/container for services.

## Decision

- **Web frontend (marketing + client apps):** Cloudflare Pages.
- **Services (web, api, hr-automation):** Cloudflare Workers (`nodejs_compat`, deployed via
  `wrangler deploy`).
- Deployment from CI uses `cloudflare/wrangler-action` with `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID` GitHub secrets; staging deploys automatically on merge to `main`.

## Consequences

- Edge-distributed services with generous free tier; no container orchestrator to operate.
- Fastify apps run under Workers `nodejs_compat`; Node-only dependencies must be reviewed.
- Worker CPU/request limits constrain long-running or heavy jobs (BullMQ workers likely stay
  containerised or use Workers Queues instead - revisit in DSRA-7).
- Cloudflare Pages hosts the static marketing site from the separate `dsrvmltd` repo
  (`dsrvm-web` in this monorepo is a Fastify service and deploys as a Worker, not Pages).

---

# ADR-005: Managed Postgres (Neon) as deployed datastore

- Status: Accepted
- Date: 2026-08-06
- Author: CTO

## Context

ADR-003 commits to PostgreSQL + pgvector. For deployed (staging/production) environments we
must choose a host. Options considered: self-managed Postgres on a container, Cloudflare D1,
and managed Postgres (Neon/Supabase).

## Decision

Use **managed Postgres (Neon)** for staging and production. Keeps ADR-003's Postgres +
pgvector stack intact (D1 has no vector support), avoids operating our own Postgres, and
provides branching (preview envs) and serverless pooling. Connection string injected via CI
secrets / vault as `DATABASE_URL`.

## Consequences

- No migration of existing `packages/db` Postgres/Drizzle stores (D1 would have required a
  store-interface rewrite).
- Regional latency consideration: keep Workers and Neon region co-located.
- Cold-start on Neon's serverless pool can add latency; acceptable for staging, revisit for
  production scale.
