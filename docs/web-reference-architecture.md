# Enterprise Web Reference Architecture v0

## Scope (M2.3)
White-labelable web baseline: multi-tenant, auth/SSO (session-based now, SSO-ready), RBAC, CMS, billing/usage hooks, admin console skeleton.

## Decision: framework-agnostic core + reference server
- `packages/web` (@dsrvm/web v0.1.0): pure domain core with zero framework dependencies, in-memory store. Same pattern as packages/hr + apps/hr-automation. Keeps the baseline testable and framework-agnostic.
- `apps/web` (@dsrvm/web-app v0.2.0): Fastify reference server + dependency-free admin console HTML that exercises every core capability over HTTP. Next.js presentation layer is deferred until the CEO stack decision (DSRA-4 infra), so the core can be consumed by whichever framework wins.

## Core modules (packages/web)
- `types.ts` — Tenant, User, Session, ContentItem, UsageRecord, PlanLimit, PlanName (starter/growth/enterprise), UserRole (owner/admin/editor/viewer), ContentStatus (draft/published/archived), WebAppSnapshot.
- `tenant.ts` — TenantRegistry: create/get/list/resolveFromHost/setHosts, host normalization. White-label hosts map 1:1 to tenants.
- `store.ts` — createWebStore(now?): in-memory WebStore backing all modules (tenants, users, sessions, content, usage).
- `auth.ts` — createAuthService: signup/login/logout/authenticate/getUser. scrypt password hashing (`scrypt$salt$derived`), opaque random session tokens (24-byte base64url), 7-day TTL. SSO-ready seam (token strategy swappable later).
- `rbac.ts` — PERMISSIONS: cmsView/cmsEdit/cmsPublish/userManage/billingView/billingManage/tenantManage/consoleAccess. Role matrix owner>admin>editor>viewer + `can(user, permission)` / `requirePermission`.
- `cms.ts` — createCmsService: tenant-scoped content CRUD, publish/archive lifecycle, getBySlug, list.
- `billing.ts` — createBillingService: PLAN_LIMITS (starter 5 seats/20 published/$50mo, growth 25/200/$500, enterprise unlimited). recordUsage → estimateCostUsd from @dsrvm/telemetry; monthUsageUsd + remainingAiBudgetUsd aggregates.
- `console.ts` — createAdminService: tenant-scoped overview (owner) and global overview (consoleAccess) for the admin console skeleton.
- `service.ts` — createWebReferenceService facade + `bootstrap({name,host})` (creates growth tenant + owner@host / change-me-now).

## Reference server (apps/web)
Routes: GET /health, GET / (admin console HTML), POST /api/tenants (bootstrap), GET /api/tenants (consoleAccess), POST /api/auth/signup|login|logout, GET /api/auth/me, GET|POST /api/content, PATCH /api/content/:id/status, POST /api/usage (billing hook), GET /api/admin/overview, GET /api/tenant (Host-header tenant resolution). Auth via `Authorization: Bearer <token>`; tenant identity flows from the session.

`seedReference` seeds two white-label tenants end-to-end: Acme Consulting (acme.dsrvm.app, editor user, published pricing page, gpt-4o-mini usage) and Beta Retail (beta.dsrvm.app).

## Verification
- packages/web: 11 tests (tenants/host resolution, auth incl. wrong-password + logout, RBAC allow/deny, CMS lifecycle + tenant isolation, billing plan limits + usage cost + remaining budget, admin overview) — all green.
- apps/web: 6 integration tests via fastify.inject (health + console, host resolution, auth + tenant-scoped CMS, RBAC viewer denial, usage + overview, seedReference end-to-end) — all green.
- Monorepo turbo: build 10/10, typecheck 14/14, lint 10/10, test 14/14.
- Live smoke (:3210): health ok; both hosts resolve to their tenants; owner login → token; admin overview reports 2 tenants/3 users/2 content/usage $0.75; POST /api/usage raises monthUsageUsd to $0.7647; tenant-scoped CMS list returns only Acme's published pricing item.

## Notes / lessons
- App and core package cannot share an npm name (`@dsrvm/web` was claimed by both → pnpm resolved the app's own junction to itself; the app was renamed `@dsrvm/web-app` and the stale lockfile regenerated).
- Host-header based tenant resolution is the white-label seam; a reverse proxy (per-tenant CNAME/vanity domain) terminates at the same app instance.

## Follow-ups (outside this issue)
- SSO (SAML/OIDC) adapter behind the auth seam; Postgres-backed WebStore (mirror @dsrvm/hr PgStore pattern); Next.js presentation layer after CEO stack decision; webhook/portal billing integration.
