# HR line — CareerForge alignment (DSRA-15)

## Assessment

CareerForge (`D:\Claude\Projects\careerforge`, board repo `graphicguruindia-uxid/careerforge-ai`) is a candidate-facing career assistant: React 18 + Tailwind v4 + Zustand client, Hono + SQLite (sql.js) server, fully offline by default. Its deterministic engine (`client/src/lib/engine.js`, "DSRVM 7-module framework") does resume parsing, UK role gap analysis, ATS compliance, template CV/cover-letter/LinkedIn generation, boolean job-search strings and job matching against 15 UK role benchmarks. Server-side `extractor.js` handles PDF/DOCX/DOC/RTF/TXT text extraction.

Monorepo side: `@dsrvm/hr` (DSRA-6/9/11) is the employer-side pipeline — candidate intake (CSV/email/resume) → AI screening → human review → outbox, Postgres-backed (DSRA-12 M2 store, pglite tests). `@dsrvm/ai` (DSRA-5) is a provider-agnostic LLM gateway (OpenAI/Anthropic/fake) with structured outputs + evals. `@dsrvm/telemetry` (DSRA-8) records usage.

The two are complementary, not duplicative: CareerForge = candidate self-serve career tool; `@dsrvm/hr` = employer intake/screening/review.

## Relationship decision — ADOPT

- **Keep CareerForge as the board-owned repo**, served under the `dsrvmltd.co.uk` domain (either `dsrvmltd.co.uk/careerforge/` proxied by the company site, or a dedicated subdomain). It is the candidate-facing, offline-first career product.
- **Keep the monorepo HR line as the production employer pipeline** (Postgres-backed, reviewed, outbox-driven).
- **Align the two through shared seams, not code absorption**:
  1. Resume-extraction semantics: CareerForge now emits `pii` flags matching `@dsrvm/hr` `detectPii` (email/phone/NI/postcode), so candidates can be handled privacy-first end to end.
  2. AI provider seam: CareerForge's server now speaks the `@dsrvm/ai` provider contract (`GET /api/ai/status`, `POST /api/ai/complete`, `{provider,model,text,usage}`), so career guidance and scoring can use the same gateway the HR pipeline uses (Ollama or any OpenAI-compatible provider), and the candidate score (blend of gap/compliance/match) is the number a future screening enrichment can consume.
- **Not absorbed into the monorepo**: CareerForge is plain-JS local-first (no TS/Postgres); absorption would force a rewrite with no candidate-facing benefit. Revisit only if the pilot wants one unified codebase.

## Enhancements shipped

**`@dsrvm/ai` (monorepo)**
- `createOllamaProvider()` in `packages/ai/src/providers/ollama.ts` — OpenAI-compatible provider defaulting to `http://localhost:11434/v1` + `llama3.2`, env `OLLAMA_BASE_URL`/`OLLAMA_MODEL`/`OLLAMA_API_KEY`. Exported from `providers/index.ts`. 4 unit tests (payload shape, defaults, error mapping, per-request model/format). The gateway now genuinely supports the Ollama↔provider swap.

**CareerForge repo**
- `server/src/ai.js` — gateway seam mirroring `@dsrvm/ai`: `AI_MODE=auto|local|ollama|openai` (+ `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`, `AI_TIMEOUT_MS`); `auto` resolves Ollama if a base URL is set, else OpenAI if a key is set, else local. `aiComplete()` returns the `CompletionResponse` shape; local/unreachable AI degrades gracefully (HTTP 200 `{available:false}`) so the app never bricks.
- `server/src/index.js` — `GET /api/ai/status`, `POST /api/ai/complete` (400 on bad body, 502 on provider errors).
- `client/src/lib/api.js` — `aiStatus()`, `aiComplete()`.
- `client/src/lib/engine.js` — `detectPii()` (aligned with `@dsrvm/hr`), `candidateScore()` (0-100 blend of UK gap score 50% / ATS compliance 30% / top job-match 20%), both surfaced via `analyzeResume`.
- `server/test/ai.test.js` + `server/test/engine.test.js` — 14 node:test cases (zero new deps).
- `package.json` — `npm test` = `node --test`.

**`@dsrvm/hr` (monorepo, follow-up #2)**
- `CandidateEnrichment` type + `Candidate.enrichment` in `packages/hr/src/types.ts`: `{ score: number; pii: string[]; source?: string }`.
- `HrService.enrichCandidate(id, input)` in `packages/hr/src/service.ts` — accepts a CareerForge-style score (0-100) + PII flags (`email`/`phone`/`NI`/`postcode`, matching `detectPii`), clamps the score, dedupes/sorts the flags, audits `candidate.enriched`. Guarded to the `pending_screening` state only.
- `createScreeningEngine` in `packages/hr/src/screening.ts` — `screen()` now consumes `candidate.enrichment` when present: appends an "External enrichment (<source> candidate score): X/100. PII detected… Treat as context only" block to the prompt. Prompt template stays v1, so the bias gate and existing renders are unchanged.
- `enrichment` jsonb column in `packages/hr/src/db/schema.ts` + `pg-store.ts` row mapping (round-trips through real Postgres).
- Tests: `service.test.ts` (enrich + clamp/dedupe + state guard + audit), `screening.test.ts` (enrichment context present/absent in prompt), `db/pg-store.test.ts` (jsonb round-trip). hr suite 47/47 green.

**Deploy/infra (CareerForge)**
- `fly.toml` — Fly.io service (internal port 3001, health check `/api/health`, `careerforge_data` volume at `/app/data` for SQLite, primary region `lhr`), per the DSRA-4 CEO stack call (Fly services + Vercel web for the company site).
- `.github/workflows/deploy.yml` — `flyctl deploy --remote-only` on `main` using a `FLY_API_TOKEN` secret.
- `.dockerignore` — excludes host `node_modules`/`dist`/`data` so the multi-stage Docker build is reproducible (was a latent breakage).
- README + AGENTS.md — AI modes, tests, deploy target, structure; fixes the stale "no Ollama" claims.

## Verification

- CareerForge: `npm test` 14/14 pass; `npm run build` green (Vite 6). Live smoke: `AI_MODE=local` → `/api/ai/status` reports `available:false`, `/api/ai/complete` degrades gracefully; `AI_MODE=ollama` against a mock OpenAI-compatible endpoint → status `available:true`, complete returns `{provider:'ollama', model:'llama3.2', text, usage}`.
- Monorepo: `pnpm build` 10/10; `pnpm test` 14/14 task groups (144 tests, incl. new ollama 4); `pnpm typecheck` 14/14.

## Follow-ups (next slices)

1. Candidate-facing UI toggle for the AI upgrade (use `/api/ai/complete` for cover-letter/CV drafting when available).
2. ~~A `@dsrvm/hr` enrichment hook that consumes a CareerForge-style candidate score/PII during screening.~~ **DONE** — shipped in monorepo (see Enhancements shipped), hr suite 47/47 green.
3. Fly launch against the board repo + DNS for `dsrvmltd.co.uk/careerforge/` (needs deploy creds / domain access).
