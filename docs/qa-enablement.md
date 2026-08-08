# QA Enablement — Onboarding the QA Automation Expert into the Delivery Pipeline

Owner: CTO (0a60ddf9) | Status: Active | Date: 2026-08-08
Issue: DSRA-34 | QA agent: 0a974791-9968-4728-a689-1103eba05a8d | Approval: f37e90c7

## 1. Mandate

The QA Automation Expert (agent `0a974791`) is a first-class member of the delivery
pipeline. QA does not simply run tests after the fact; it is a **release gate**: no
DSRA-17 go-live, and no future shipped slice, reaches production without a recorded
QA Pass and sign-off.

Persona (from DSRA-21, approved): a meticulous "Professional Breaker" whose job is to
find every failure point — edge cases, undocumented behaviour, regressions — and to
report bugs reproducibly. QA is objective; it is not tasked with defending the
developer's work.

## 2. Where QA sits in the pipeline

```
Engineer ships slice ──► CI (lint/typecheck/test/build) ──► QA gate ──► Deploy staging ──► CEO sign-off ──► Go-live
                              (turbo, .github/workflows/ci.yml)   (qa-gate job, E2E smoke)
```

- **CI** runs unit + integration tests (`pnpm test` = turbo run test) on every push/PR.
- **QA gate** (`qa-gate` job) runs the E2E smoke suite (`pnpm qa:smoke` →
  `scripts/qa-smoke.mts`) across the three release apps (api, hr-automation, web) and
  uploads `qa-report.json`. The gate **blocks** the `deploy-staging` job.
- **QA sign-off** is a human/agent checkpoint recorded on the release issue (DSRA-17)
  before the production promote.

## 3. QA workflow (adopted from DSRA-21 persona)

1. **Test planning** — review the CTO's slice spec; write a test plan covering happy
   path, error path, and edge cases.
2. **Automation** — extend the E2E/regression suite (see §4 harness) so every feature
   has an automated test; add unit tests at package level when a seam is new.
3. **Run** — execute the suite locally and report Pass/Fail on the ticket with the
   `qa-report.json` summary.
4. **Reporting** — log reproducible bugs on the tracker, mark each slice Passed or
   Failed, and notify the CTO (mention `@CTO 2` on the issue comment).

## 4. The test harness (monorepo)

Root scripts (run from `_default/`):

| Command                | What it does                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `pnpm test`            | Unit + integration tests across all packages/apps (turbo, vitest)                   |
| `pnpm qa:smoke`        | E2E HTTP smoke across `apps/api`, `apps/hr-automation`, `apps/web` (Fastify inject) |
| `pnpm qa`              | Full gate: lint → typecheck → test → build → smoke (what CI enforces)               |
| `pnpm qa:smoke` output | `qa-report.json` (suite, timestamps, pass/fail, failures list) + exit code          |

The smoke harness lives at `scripts/qa-smoke.mts` and covers, per app:

- **api**: `GET /health`.
- **hr-automation**: dashboard, role create (+400 validation) + list, candidate intake
  with AI screening (+400), list/get, status filter, CSV/email import (+empty 400),
  human review approve (+400, +409 unknown), audit trail, telemetry.
- **web**: health, dashboard, tenant create (+409 dup host), seeded-owner login (+401
  bad pw), signup (+409 dup email), logout (session invalidated), `/auth/me`, CMS
  create/publish/list (+401 unauth), usage metering with cost estimate, billing plans +
  portal, plan change (+400 unknown plan), signed billing webhook (+401 bad sig),
  admin overview (owner 200, viewer 403, logged-out 401), tenant host resolution (+404
  unknown), SSO provider list, SSO login redirect + OIDC callback happy path (+401 bad
  id_token).

Baseline at onboarding: **32/32 smoke, 148/148 unit tests** (2026-08-07). Baseline after
QA coverage extension (DSRA-41): **52/52 smoke, 151/151 unit tests, all turbo tasks
green** (2026-08-08, commit `ae0f0ed`).

## 5. How QA reviews shipped slices (before go-live sign-off)

For every slice entering the release (DSRA-17 items, HR automation, web):

1. QA runs `pnpm qa:smoke` (and `pnpm test` for unit-level confidence) against the
   slice's branch/commit.
2. QA reports on the slice's issue with:
   - **Verdict:** `PASS` or `FAIL` (with counts).
   - **Coverage notes:** what was exercised; what was out of scope.
   - **Bugs:** one entry per defect using the template in §6.
3. A slice is **released** only with `PASS`. On `FAIL`, the ticket returns to the
   engineer with the reproducible bug report; QA re-runs after the fix.
4. Before the DSRA-17 go-live promote, QA posts a **final sign-off** comment on
   DSRA-17 confirming the committed baseline is green (CI + smoke + report uploaded),
   mirroring the process already used on DSRA-17 in 2026-08-07.

## 6. Reproducible bug report template

```
**Bug:** <one-line summary>
**Severity:** Blocker / Major / Minor / Cosmetic
**App/Endpoint:** e.g. apps/hr-automation POST /api/candidates
**Steps to reproduce:**
1. ...
2. ...
**Expected:** ...
**Actual:** ...
**Evidence:** <request/response JSON, error stack, or qa-report.json excerpt>
**Regression:** Is this new or did it pass before? (cite commit/date if known)
```

## 7. Definition of a QA Pass (sign-off criteria)

- CI on the target commit is green (lint, typecheck, test, build).
- `pnpm qa:smoke` exits 0 with **0 failed** and a `qa-report.json` is available.
- No open Blocker/Major defects against the slice; known Minor/Cosmetic items are
  logged on the tracker, not hidden.
- For go-live: QA sign-off comment posted on DSRA-17 naming the verified commit SHA.

## 8. Escalation

- If QA finds a defect, it posts the report on the ticket and reassigns to the
  engineer (or notifies CTO) — do **not** let the ticket idle.
- If QA is blocked (env, credentials, missing spec), it comments the exact blocker on
  the ticket and assigns the blocking party.
- Every QA action ships with a ticket comment (transparency rule, same as CTO).

## 9. Reference

- `scripts/qa-smoke.mts` — E2E smoke harness.
- `.github/workflows/ci.yml` — `qa-gate` job (E2E smoke + report artifact).
- `docs/release-management.md` — DSRA-17 go-live plan (QA gate step).
- `docs/tooling-runbook.md` — delivery tooling runbook (QA section).
