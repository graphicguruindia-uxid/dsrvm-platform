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

### QA gate (DSRA-34)

- QA Automation Expert (agent 0a974791) is a first-class pipeline member; process and
  sign-off criteria in `docs/qa-enablement.md`.
- `pnpm qa:smoke` = E2E HTTP smoke across api/hr-automation/web (`scripts/qa-smoke.mts`),
  writes `qa-report.json` and exits non-zero on failure.
- `pnpm qa` = lint → typecheck → test → build → smoke (the full gate).
- CI `qa-gate` job runs `pnpm qa:smoke` on every push/PR and uploads `qa-report.json`;
  `deploy-staging` `needs: [ci, qa-gate]`.

## 4. Environments & secrets

| Environment | Purpose                           | Config source                                  |
| ----------- | --------------------------------- | ---------------------------------------------- |
| local       | Developer machine                 | `.env.local` (gitignored)                      |
| staging     | Mirrors production, safe to break | GitHub Actions secrets / vault, injected env   |
| production  | Real clients, approval required   | GitHub Actions secrets / vault, manual promote |

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

> **Decision (ADR-006, accepted 2026-08-07 via board approval 8f511abe): services deploy
> to a Node host, not Cloudflare Workers.** Fastify's router `find-my-way` compiles route
> matchers with `new Function`, which the Workers runtime permanently disallows (no
> `eval`/codegen) — `EvalError: Code generation from strings disallowed for this context`
> at startup, reproduced by QA under the Workers V8 flag (`scripts/qa-worker.mts`). Fastify 5
> offers no router substitution hook. Verified against Fastify 5.11.2 + find-my-way 9.7.0.

- **Services (web, api, hr-automation): Node host** (Render/Fly.io/Railway/VPS). All three
  apps run as plain Node Fastify servers via `apps/*/src/index.ts`
  (`pnpm dev` / `node dist/index.js`). Baseline is green (build/lint/typecheck/test).
  **Host target selection is a board ask on DSRA-17** (carries cost implications); the CI
  `deploy-staging` job is gated on the `DEPLOY_TARGET` repo variable so merges to `main`
  stay green until a host is chosen and its deploy credentials are provisioned.
- **Workers-native rewrite (Hono/Itty)** is a tracked follow-up only, not this release.
- **Cloudflare remains** for the static marketing site (Pages, live at `dsrvm-site.pages.dev`
  from the `dsrvmltd` repo) and DNS. The `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`
  secrets and `wrangler.toml` files are retained for future Workers/edge use, but no
  service deploys to Workers.

## 7. Definition of Done (DoD)

- PR merged to `main` with passing CI.
- Documentation updated (runbook/README/ADR) if behaviour or layout changed.
- Issue commented with what shipped and any follow-ups.
