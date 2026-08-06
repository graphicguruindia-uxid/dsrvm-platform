# Engineering Delivery Tooling - Runbook

Owner: CTO | Milestone M1.0 | Status: v1.2

## 1. Repository

- Monorepo: `dsrvm` (this repo), pnpm workspaces + Turborepo.
- Git remote: `https://github.com/graphicguruindia-uxid/dsrvm-platform` (public).
- Package layout: `apps/*` (web, api, hr-automation), `packages/*` (ai, db, config, ui).
- Branching: feature branches -> PR to `main`. PR title references the issue (e.g. `DSRA-4: ...`).

## 2. Local development

```bash
pnpm install
pnpm dev        # runs all apps in watch mode
pnpm test       # unit + integration tests
pnpm lint
pnpm typecheck
```

Local Postgres: use `docker compose up -d db` (see `docker-compose.yml`) or the
project-managed embedded Postgres on port 54329 for DSRVM-internal tooling.

## 3. CI (GitHub Actions)

`.github/workflows/ci.yml` runs on every push/PR and executes real tasks in
all 7 workspace packages (apps: api, hr-automation, web; packages: ai, config,
db, ui):

1. `pnpm install --frozen-lockfile`
2. `pnpm lint` (prettier --check per package)
3. `pnpm typecheck` (tsc --noEmit per package)
4. `pnpm test` (vitest per package)
5. `pnpm build` (tsc emit per package)
6. Deploy to Cloudflare staging on `main` (wired via `cloudflare/wrangler-action`,
   skips cleanly until `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secrets exist).

Test runner is Vitest; dev mode uses `tsx watch` in `apps/api`.

## 4. Environments & secrets

| Environment | Purpose | Config source |
|---|---|---|
| local | Developer machine | `.env.local` (gitignored) |
| staging | Mirrors production, safe to break | GitHub Actions secrets / vault, injected env |
| production | Real clients, approval required | GitHub Actions secrets / vault, manual promote |

**Rules:**

- Never commit secrets. `.env*` is gitignored; `.env.example` documents required vars.
- API keys, DB creds, model API keys live in the project secrets vault and are injected
  at deploy time only.
- Rotation: any suspected leak = rotate immediately, log an issue.
- Cloudflare deploy credentials (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) are
  GitHub Actions secrets (see section 6).

## 5. Database

- Managed PostgreSQL (Neon) per ADR-005; migrations versioned in `packages/db/migrations`
  (tooling TBD: node-pg-migrate or drizzle-kit).
- Connection string injected as `DATABASE_URL` via secrets/vault at deploy time.
- Migrations are applied by the deploy pipeline; never run migrations directly in production.

## 6. Deploying

- **Hosting (ADR-004):** Cloudflare. Web frontend -> Cloudflare Pages (`dsrvm-web`).
  Services -> Cloudflare Workers (`dsrvm-api`, `dsrvm-hr-automation`).
- **Staging:** automatic on merge to `main`; CI builds then deploys web/api/hr-automation
  to Cloudflare with `wrangler`. Workers run Fastify under `nodejs_compat`.
- **Production:** manual promote from staging after smoke tests + CEO sign-off
  (`wrangler deploy --env production`).
- **Credentials:** ask the board (local-board/CEO) to provision a Cloudflare API token
  (Pages + Workers) and add `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` to GitHub repo
  secrets. The deploy job stays green and skips until those secrets exist.

## 7. Definition of Done (DoD)

- PR merged to `main` with passing CI.
- Documentation updated (runbook/README/ADR) if behaviour or layout changed.
- Issue commented with what shipped and any follow-ups.
