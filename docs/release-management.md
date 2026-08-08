# DSRA-17 Release Management — Go-Live Plan

Owner: CTO | Status: In progress | Date: 2026-08-06 (updated 2026-08-07)

## Scope

Go-live of three DSRVM services:

| App                      | Package                                       | Service                                                      | Deploy target                     |
| ------------------------ | --------------------------------------------- | ------------------------------------------------------------ | --------------------------------- |
| Enterprise web reference | `@dsrvm/web-app` (`apps/web`)                 | Fastify multi-tenant API + admin console + CMS/billing hooks | **Node host** (ADR-006, accepted) |
| HR automation            | `@dsrvm/hr-automation` (`apps/hr-automation`) | Candidate intake + AI screening + human review               | **Node host** (ADR-006, accepted) |
| API                      | `@dsrvm/api` (`apps/api`)                     | Health/edge API                                              | **Node host** (ADR-006, accepted) |

Static marketing site lives in the separate `dsrvmltd` repo (Cloudflare Pages, live at
`dsrvm-site.pages.dev`).

## Hosting decision (resolved)

**ADR-006 accepted 2026-08-07 via board approval `8f511abe`: services deploy to a Node host
(Option 1), not Cloudflare Workers.** Fastify's router `find-my-way` compiles route matchers
with `new Function`, which Workers permanently disallow (`EvalError: Code generation from
strings disallowed for this context` at startup — reproduced by QA under the Workers V8 flag,
`scripts/qa-worker.mts`). Fastify 5 has no router-substitution option. Cloudflare remains for
Pages (marketing site) + DNS. A Workers-native rewrite (Hono/Itty) is a tracked follow-up
only. See ADR-006 and the DSRA-17 board comment of 2026-08-07.

## Remaining blocker (board ask — has cost implications)

A specific **Node host** must be selected (Render/Fly.io/Railway/VPS) and its deploy
credentials provisioned. Per the board decision this is returned as a decision request
because host selection carries cost implications. The CI `deploy-staging` job is **gated on
the `DEPLOY_TARGET` repo variable** so merges to `main` stay green until then. (Cloudflare
credentials are confirmed provisioned in CI; they remain unused for these services.)

## Readiness checklist (verified)

- [x] Turbo pipeline green for the committed baseline (build/lint/typecheck/test, 40/40).
- [x] CI runs lint/typecheck/test/build and stays green (deploy job gated, not failing).
- [x] **QA gate wired (DSRA-34):** CI `qa-gate` job runs `pnpm qa:smoke` (E2E across
      api/hr-automation/web, 32/32) and uploads `qa-report.json`; it blocks the
      `deploy-staging` job. QA sign-off is required before production promote (§5).
- [x] Speculative Worker fetch adapters (`worker.ts`, wrangler `main=dist/worker.js`) reverted;
      apps run as plain Node Fastify servers via `apps/*/src/index.ts`.
- [x] Local dev (`pnpm dev`) serves all apps as Node servers.
- [x] Runtime constraint documented (ADR-006, accepted) with evidence + QA repro.
- [x] `.gitattributes` added so Windows checkouts keep LF (prettier `eol=lf`).

## Go-live steps (once board picks a Node host)

1. Board selects Node host + provides deploy credentials (or authorizes the free/VPS option).
2. Set `DEPLOY_TARGET` repo variable; wire the deploy-staging job steps to the host; staging
   smoke tests (`GET /health`, admin console, HR intake+review flow, tenant host resolution).
3. **QA sign-off gate:** QA Automation Expert runs `pnpm qa:smoke` + `pnpm test` on the
   candidate commit and posts a PASS verdict + `qa-report.json` reference on DSRA-17
   (see `docs/qa-enablement.md`). No promote without it.
4. Provision Postgres (Neon per ADR-005) staging `DATABASE_URL`; run migrations.
5. Production promote after QA sign-off + CEO sign-off.
6. Governance pre-production items from DSRA-25/26/27/29/30 fold in (candidate notice,
   data-residency/encryption record, retention job, bias gate, telemetry TTL).

## KPIs (post-go-live, 30 days)

- **Availability:** services 99.9% uptime; p95 latency < 500ms for API paths.
- **Deployment:** zero manual steps for staging; production promote < 15 min.
- **Security:** no secrets in repo; TLS on all endpoints; audit log for HR reviews retained.
- **Cost:** hosting within budget cap set by board; usage telemetry collected
  (`apps/hr-automation` `/api/telemetry`).

## Sign-off

- CEO/local-board: required for production promote and hosting-target (Node host) selection.
- CTO: owns readiness; re-verified blockers 2026-08-07.
