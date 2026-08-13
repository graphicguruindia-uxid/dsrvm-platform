# DSRVM Ltd - Engineering Monorepo (Delivery Tooling)

Status: Scaffold v1.1 | Owner: CTO | Milestone: M1.0 (tech-roadmap)

This repository is the delivery foundation for DSRVM Limited's three product lines:
AI consulting delivery, intelligent HR automation, and enterprise web solutions.

## Stack

- **Language:** TypeScript (Node 22+)
- **Monorepo:** pnpm workspaces + Turborepo
- **Web apps:** Next.js (App Router) + React
- **Services:** Fastify
- **Database:** PostgreSQL (+ pgvector)
- **Jobs/queues:** BullMQ (Redis) or Postgres-backed queues
- **CI:** GitHub Actions (lint, typecheck, test, build) + Cloudflare deploy (Pages/Workers)

## Repository layout

```
apps/
  web/            # marketing + client apps (Next.js)
  api/            # backend services (Fastify)
  hr-automation/  # HR automation pipeline worker
packages/
  ai/             # LLM gateway + provider abstraction + evals
  db/             # shared data access + migrations
  config/         # shared tsconfig/eslint configs
  ui/             # shared React components (admin console)
docs/             # runbooks, decision logs, ADRs
```

All `apps/*` and `packages/*` ship as buildable, typed, tested TypeScript
skeletons so CI runs real lint/typecheck/test/build work today. The Next.js
web app scaffold lands with the enterprise web reference architecture (DSRA-7).

## Quick start

```bash
pnpm install
pnpm build       # build all packages
pnpm lint        # lint everything
pnpm typecheck   # typecheck everything
pnpm test        # run all tests
pnpm dev         # run all apps in dev mode
```

## Dev ports

`pnpm dev` (turbo) boots all three apps with distinct default ports so nothing
collides (previously api + hr-automation both defaulted to 3001 -> EADDRINUSE):

| App             | Default port | Health check                         |
| --------------- | ------------ | ------------------------------------ |
| api             | 8899         | http://127.0.0.1:8899/health         |
| hr-automation   | 3002         | http://127.0.0.1:3002/health         |
| web             | 3003         | http://127.0.0.1:3003/health         |

8899 is the primary dev entry. Override per app with `PORT` (single app) or
`API_PORT` / `HR_PORT` / `WEB_PORT` (run-local / staging:local). See `.env.example`.

## Environments

- **local** - developer machine, `.env.local` files, local Postgres.
- **staging** - deployed from `main` via CI to Cloudflare (Pages for web, Workers for
  services), mirrors production config.
- **production** - manual promote from staging after approval.

Secrets are managed via the project secrets vault and injected as environment
variables at deploy time. Cloudflare deploy tokens are GitHub Actions secrets
(`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`). Never commit secrets.
See `docs/tooling-runbook.md`.

## Working agreement

- All changes land via pull request; CI must pass (lint, typecheck, tests, build).
- Every PR references an issue (e.g. `DSRA-4`).
- ADRs in `docs/decision-log/` for architectural decisions.
- No destructive commands outside sandbox/staging without sign-off.
