# Enterprise Web Reference Architecture M2: Postgres-backed WebStore

## Scope
Follow-up to DSRA-7 (web reference arch v0, synchronous in-memory `WebStore`) and DSRA-9 (HR M2.2 persistence, `@dsrvm/hr` PgStore pattern). Make the white-label web platform production-ready: the `WebStore` interface is now async (Promise-returning) and ships a Postgres-backed implementation mirroring `@dsrvm/hr`.

## What changed (packages/web, @dsrvm/web v0.2.0)

### Async WebStore interface
- `store.ts`: `WebStore` (and the `TenantStore` it extends) now return `Promise` from every method (save/get/list/resolve/delete/snapshot). `createWebStore()` stays the in-memory default for tests and is now async.
- All service layers converted to async in lockstep:
  - `tenant.ts` — TenantRegistry: create/get/list/resolveFromHost/setHosts
  - `auth.ts` — signup/login/logout/authenticate/getUser (scrypt hashing unchanged)
  - `cms.ts` — tenant-scoped createItem/updateItem/setStatus/getBySlug/list
  - `billing.ts` — recordUsage/usage/planLimits/monthUsageUsd/remainingAiBudgetUsd
  - `console.ts` — AdminService overview/tenantOverview
  - `service.ts` — facade + `bootstrap({name,host})`

### Postgres/Drizzle persistence (new `src/db/`)
- `schema.ts` — Drizzle pg-core schema:
  - `tenants` (id PK, name, hosts jsonb<string[]>, plan, created_at)
  - `users` (id PK, tenant_id, email, password_hash, name, role, created_at; tenant index + unique `(tenant_id, email)`)
  - `sessions` (token PK, user_id, tenant_id, role, expires_at, created_at; tenant + user indexes)
  - `content_items` (id PK, tenant_id, slug, title, body, status, published_at, updated_by, updated_at, created_at; tenant index + unique `(tenant_id, slug)`)
  - `usage_records` (id PK, tenant_id, task, model, input_tokens, output_tokens, est_cost_usd double precision, at; tenant + at indexes)
- `pg-store.ts` — `PgWebStore` implements the async `WebStore` over node-postgres + drizzle. White-label host resolution uses jsonb containment (`hosts @> [host]`); upserts via `onConflictDoUpdate` (tenants/users/content). `createPgWebStore(db)` and `createPostgresWebStore(url)` returning `{ store, close }` handle mirror the `@dsrvm/hr` `createPostgresStore`.
- Exported from `index.ts` (`./db/schema.js`, `./db/pg-store.js`).

## App wiring (apps/web, @dsrvm/web-app)
- `app.ts` — `createWebReferenceApp({ now, databaseUrl })`: `DATABASE_URL` (or `databaseUrl`) opts into the Postgres store, otherwise in-memory. `close()` now also closes the pool.
- `server.ts`, `seed.ts` — every route/handler awaits the async service methods.
- `server.test.ts` — seedReference/overview tests await the async service.

## Verification
- packages/web: 15 tests (11 core async + 4 new pglite persistence) — all green.
  - pglite tests: full web flow (bootstrap → host resolution → owner login → CMS create/publish → billing usage → admin overview) through real Postgres; tenant/email uniqueness + cross-tenant content isolation (draft invisible via getBySlug until published); persistence across store instances (survives reconnect); usage round-trip + host reassignment.
- apps/web: 6 integration tests (fastify.inject) — all green.
- Monorepo turbo: build 10/10, typecheck 14/14, lint 10/10, test 14/14 (40/40).
- Live smoke (:3210): health ok; acme.dsrvm.app resolves to Acme Consulting; owner login role=owner; admin overview 2 tenants/3 users/2 content/1 usage/$0.75; POST usage raises monthUsageUsd to $1.50.

## Notes / lessons
- Converting the store to async touches every service + consumer (tenants/auth/cms/billing/console + app server/seed/tests) — do it in one slice or the sync/async mix deadlocks typechecking.
- Prettier must be run with the glob form (`pnpm --filter <pkg> exec prettier --write "src/**/*.ts"`) or new files can be left flagged.
- Apps import `@dsrvm/web` from `dist/` — build the package before app typecheck/tests after interface changes.

## Follow-ups (outside this issue)
- SSO (SAML/OIDC) adapter behind the auth seam; billing portal/webhooks; Next.js presentation layer after the CEO stack decision (DSRA-4).
