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

- Status: Superseded in part by ADR-006 (Workers premise for services revoked; Pages + DNS remain)
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

## Revision (ADR-006, accepted 2026-08-07 via board approval 8f511abe)

- The **Workers premise for the three Fastify services is revoked**: Fastify/find-my-way
  compile route matchers with `new Function`, which the Workers runtime permanently bans
  (`EvalError` at startup). The services deploy to a **Node host** (ADR-006, Option 1).
- **Cloudflare stays** for the static marketing site (Pages, already live at
  `dsrvm-site.pages.dev`) and for DNS.
- The monorepo `deploy-staging` job is gated on the `DEPLOY_TARGET` repo variable until a
  Node host is selected and its credentials are provisioned.

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

---

# ADR-006: Cloudflare Workers cannot run Fastify — services deploy to a Node host

- Status: Accepted
- Date: 2026-08-06 (accepted 2026-08-07 via board approval 8f511abe)
- Author: CTO (DSRA-17 release management)

## Context

ADR-004 assumed Fastify apps run under Workers `nodejs_compat`.
Runtime verification against Fastify 5.11.2 + find-my-way 9.7.0 disproves this:

1. `Fastify()` calls `http.createServer` — not implemented by the Workers runtime.
   Fix: a `serverFactory` that returns a fake server (Fastify's `inject` bypasses it).
2. Even then, `find-my-way` compiles route matchers with `new Function` at route
   registration (`lib/node.js:197`, `lib/handler-storage.js:78/171`, `lib/constrainer.js:172`),
   and Fastify's route registration triggers the static-node path for any path longer
   than one character. Cloudflare Workers permanently disallow `eval`/`new Function`
   (security model; no opt-out). Result:
   `EvalError: Code generation from strings disallowed for this context` at startup.
3. Fastify 5 exposes no `routerFactory` option to substitute an eval-free router.

QA independently reproduced the crash (all three apps) under the Workers V8 flag
`--disallow-code-generation-from-strings` (repro script `scripts/qa-worker.mts`).

## Decision

**Adopted Option 1 (Node host) for web, api, and hr-automation.** The three services ship
as Node Fastify servers on a Node host (Render/Fly.io/Railway/VPS — target selection is a
board ask on DSRA-17 since it carries cost implications). Do **not** spend cycles on a
Workers-native rewrite (Option 2) this release; it stays a tracked follow-up if edge hosting
becomes a requirement.

1. **Node host** (Render/Fly.io/Railway/VPS) — apps already run as Node servers; lowest
   effort/risk. Keep Cloudflare Pages for the static marketing site and Cloudflare DNS.
2. **Workers-native rewrite** (Hono/Itty) reusing `@dsrvm/*` service packages — tracked
   follow-up only; not for this release.
3. **Static-assets-only Workers** — wrangler setup kept for assets/edge, not Fastify.

## Consequences

- Committed baseline (Node Fastify servers, `apps/*/src/index.ts`) is green:
  build/lint/typecheck/test all pass.
- Speculative Worker fetch adapters (`worker.ts`, wrangler `main = dist/worker.js`) were
  reverted; the learning is preserved here, in the runbook, and in the tested
  `@dsrvm/worker-server` package (kept as an artifact of the investigation).
- `deploy-staging` is gated on the `DEPLOY_TARGET` repo variable; merges to `main` stay
  green until the board selects a Node host and provisions its deploy credentials.
- Cloudflare remains: Pages hosts the marketing site (live at `dsrvm-site.pages.dev`), DNS
  stays on Cloudflare, and the existing Workers/Pages secrets are retained for future use.

---
