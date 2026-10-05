# QA Action Plan — Quality Gates & Revenue Protection

Owner: QA Automation Expert (0a974791) | Status: Active | Date: 2026-09-02
Issue: DSRA-75 (parent DSRA-73 CEO action-plan delegation) | Goal: f1d95539
Alignment: qa-enablement.md (DSRA-34 delayed gate mandate), CI ci.yml, release-management.md

## 1. Purpose

Revenue requires trust. QA is the guardrail that keeps scope-creep and regressions from
killing pilot conversions. This plan:

1. **Maps current coverage** (implemented vs pending vs gap) across the four revenue
   surfaces: HR automation, Meridian (planned), dsrvmltd.co.uk, and billing flows.
2. **Defines quality gates** that every shipped slice must pass before production.
3. **Sets a 30-60-90 roadmap** for reproducible bug reports, regression coverage, and a
   continuous QA dashboard.
4. **Flags what blocks revenue** in a companion risk register (`qa-revenue-risk-register.md`).

## 2. Coverage map

Legend: **[DONE]** implemented and gated in CI · **[PARTIAL]** some coverage,
gaps remain · **[GAP]** no automated coverage · **[PLANNED]** surface not yet built.

### 2.1 HR automation (packages/hr, apps/hr-automation)

| Area | Coverage | Status |
| --- | --- | --- |
| Candidate intake — create + screening engine | `qa-smoke.mts` candidate create; `packages/hr/src/service.test.ts`, `screening.test.ts`, `ingest.test.ts` | **[DONE]** |
| AI candidate notice v1 + outbox ack | `qa-smoke.mts` (notice.version v1, outbox event `candidate.acknowledged`) | **[DONE]** |
| Human-in-the-loop review (approve/reject) | `qa-smoke.mts` review; `service.test.ts` | **[DONE]** |
| Roles pipeline (CRUD + bad-role 400) | `qa-smoke.mts` | **[DONE]** |
| Resume intake adapters — DOCX/PDF/TXT | `packages/hr/src/ingest.test.ts` | **[PARTIAL]** — format edge cases (unsupported doc, empty file, corrupted PDF) not exhaustive |
| Retention cleanup counts shape | `qa-smoke.mts` retention counts | **[PARTIAL]** — shape asserted, cleanup semantics deferred to unit tests |
| Candidate review UI (drag-drop) | Only dashboard HTML smoke; no interaction coverage | **[GAP]** — see DSRA-65 note |
| Audit trail detail | Outbox/notice asserted; full audit read path not e2e-covered | **[PARTIAL]** |

### 2.2 Meridian timer / client / project (planned product line)

No Meridian module exists in the tree (no `meridian` references). All of the following
are **[PLANNED]** and must be built test-first:

| Area | Status |
| --- | --- |
| Timer / time-tracking domain | Planned — no code |
| Client + project entities on PG store | Planned — no code |
| Pay loop (billable time → invoice) | Planned — no code |
| E2E automation for candidate pipeline + Meridian pay loop | Planned (60d target) |

### 2.3 dsrvmltd.co.uk (apps/web, packages/web)

| Area | Coverage | Status |
| --- | --- | --- |
| `GET /health` | `qa-smoke.mts`, `apps/web/src/server.test.ts` | **[DONE]** |
| Billing plans + portal (owner) | `qa-smoke.mts` `/api/billing/plans`, `/api/billing/portal`; `packages/web/src/billing.ts` tests | **[DONE]** |
| SSO (Google redirect + callback + id_token) | `qa-smoke.mts`; `packages/web/src/sso.test.ts` | **[DONE]** |
| Billing webhooks (webhook-sign verification) | `packages/web/src/billing-webhook.ts` + `web.test.ts` | **[PARTIAL]** — signature paths explicitly tested; failure/duplicate/delivery retry not e2e |
| Static marketing pages | Render smoke only | **[PARTIAL]** |

### 2.4 Billing flows (revenue-critical)

| Area | Coverage | Status |
| --- | --- | --- |
| Plan listing + portal access | covered (2.3) | **[DONE]** |
| Checkout / pay-without-account | No code (DSRA-46 backlog) | **[GAP]** |
| Payment webhook → order → entitlement | `billing-webhook` unit tests | **[PARTIAL]** |
| Invoice view + pay (pay without account, DSRA-46/48) | Not built | **[GAP]** |
| Revenue reconciliation / invoice numbering | Not covered | **[GAP]** |

## 3. Quality gates

A slice is **shippable** only when ALL of the following pass:

1. **`pnpm lint` + `pnpm typecheck`** — static correctness (CI `ci` job).
2. **`pnpm test`** — unit/component tests across packages (vitest).
3. **`pnpm build`** — compiles clean.
4. **`pnpm qa:smoke`** — in-process E2E smoke across api/hr-automation/web (CI `qa-gate`).
5. **`pnpm bias:gate`** — AI bias gate (G7, DSRA-42) synthetic protected-group cohorts.
6. **Out-of-band live smoke** — `dispute-smoke.mjs` (DSRA-62) on staging, `prod-smoke.mjs`
   (DSRA-61) post-promote against production hosts (`/health` + release-scope checks).
   These live in the QA smoke workspace (`dispute-smoke-report.json` / `prod-smoke-report.json`),
   not the main repo CI, because they target running stacks.
7. **Recorded QA Pass + sign-off** on the shipping issue (per qa-enablement.md DSRA-34 gate:
   no slice reaches production without a recorded QA Pass).

**Pre-promote checklist (DSRA-60 fed2e4e baseline):** confirm `/health` returns 200/ok on
api, hr-automation, web; run the release-scope smoke (candidate create + notice v1, review,
retention cleanup, audit, outbox); attach PASS/FAIL to the promote issue.

**Dispute feature branch gate (DSRA-62):** branch must pass `dispute-smoke.mjs` against the
local staging stack before it is promoted to the mainline gate.

## 4. 30-60-90 roadmap

### Next 30 days (by ~2026-10-02)
- **Reproducible bug reports for DSRA-65 gaps** — "no roles" and "drag-drop" candidate review
  interactions. Write a standard bug-report template (steps, expected/actual, env, severity,
  priority) and file bugs with repro before features are promoted.
- **Solve the intake format edge cases** — extend `ingest.test.ts` for DOCX/PDF/TXT
  unsupported/empty/corrupt inputs so the HR pilot does not regress on resume formats.
- **Close the retention cleanup gap** — add an integration-style test asserting actual
  delete counts + audit rows, not just the response shape.
- **Regression suite foundation for the HR pilot** — a tracked suite of the high-value HR
  flows already covered by `qa-smoke.mts`, runnable and reported per release.

### Next 60 days (by ~2026-11-02)
- **E2E automation for the candidate pipeline** — browser-level automation (Playwright-style)
  of intake → review → decision, reusing the qa-smoke business flows behind a UI.
- **Meridian pay-loop E2E** — as the timer/client/project + invoice module lands, build a
  "billable time → invoice → paid" E2E path test-first (this is revenue-critical for the
  freelancer product line).
- **Payment webhook failure/duplicate/retry coverage** — harden the billing-webhook paths.

### Next 90 days (by ~2026-12-02)
- **Continuous QA dashboard** — a single pass/fail + flake-rate view aggregating CI
  `qa-gate`, live smokes, and bug counts.
- **Flake rate < 2%** and **MTTR target** — measure and publish; flaky tests are treated as
  bugs and quarantined.
- **Coverage threshold** — track per-area automated coverage so every shipped slice moves
  from **[PARTIAL]/[GAP]** to **[DONE]**.

## 5. Owners & cadence

- Owner: QA Automation Expert (0a974791).
- QA Pass recorded on every shipping issue (gate per claims in qa-enablement.md).
- Monthly review of this plan + the revenue risk register with CTO/CEO; escalate blockers
  that would prevent a pilot conversion.

## 6. Change control

This plan is version-controlled in the repo docs. Substantive changes (new gates, changed
owner, scope added) are recorded on DSRA-75 and reviewed with the CTO (0a60ddf9) / CEO before
taking effect.
