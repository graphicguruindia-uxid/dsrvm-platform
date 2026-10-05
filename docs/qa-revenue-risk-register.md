# QA Revenue Risk Register — What Blocks Revenue

Owner: QA Automation Expert (0a974791) | Status: Active | Date: 2026-09-02
Issue: DSRA-75 (parent DSRA-73) | Companion: docs/qa-action-plan.md
Risk appetite: aligned to ai-risk-register.md (low-to-moderate, well-controlled; pilot
conversion is the primary revenue goal). **The #1 revenue risk is a trust-breaking
regression at a pilot — QA exists to prevent that from shipping.**

Scoring: Likelihood 1-5 · Impact 1-5 · Severity = L x I (1-6 Low, 7-12 Med, 13-19 High, 20-25 Critical)

| # | Revenue-blocking risk | L | I | Sev | Current control (evidence) | Residual | Owner | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Q1 | HR pilot regression in candidate intake / screening ships to a pilot and destroys trust | 3 | 5 | 15 High | `pnpm qa` CI `ci` + `qa-gate`; candidate-create + review smoke; recorded QA Pass gate | Medium | QA + CTO | Each release + monthly |
| Q2 | Resume intake breaks on a real-world DOCX/PDF/TXT variant (only happy-path formats covered) | 4 | 3 | 12 Med | `ingest.test.ts` happy paths | Medium | QA + HR | 30d |
| Q3 | AI notice / outbox ack path fails → candidate disclosure non-compliance (blocks deals, legal risk) | 2 | 5 | 10 Med | `qa-smoke` notice v1 + outbox ack; audit trail | Low | QA + AI Gov | Monthly |
| Q4 | AI bias surfaced in screening (protected-class disparate impact) → complaint halts pilot | 3 | 5 | 15 High | `pnpm bias:gate` (G7/DSRA-42); human-in-the-loop gate; candidate notice | Medium | QA + AI Gov | Monthly + on model change |
| Q5 | Billing/payment path breaks (webhook → entitlement) → customers cannot pay / are double-charged | 3 | 5 | 15 High | `billing-webhook` unit tests w/ signature verify | Medium | QA + Web | 60d |
| Q6 | Pay-without-account & invoice view unrealized (DSRA-46/48 backlog) — revenue-critical free-tier→paid friction not shipped | 4 | 4 | 16 High | None (feature not built) | High | CTO + Product | Board |
| Q7 | Meridian pay loop ships without test-first coverage → billing defects in new product line | 4 | 4 | 16 High | None (module not built) | High | QA + Product | 60d |
| Q8 | Flaky CI `qa-gate` → releases blocked or, worse, gate bypassed silently | 3 | 3 | 9 Med | CI hard-gates staging deploy | Medium | QA | 90d target |
| Q9 | No automated UI regression for drag-drop/no-roles review → broken interaction ships undetected | 4 | 3 | 12 Med | None (GAP per coverage map) | High | QA | 30d |
| Q10 | Live smoke (dispute/prod) run manually / not on a schedule → post-promote regression goes unnoticed until a customer hits it | 4 | 4 | 16 High | Out-of-band smoke scripts; recorded QA Pass | Medium | QA | 30d |

## Top blockers to escalate (drives pilot conversion)

1. **Q9 / Q6 / Q7 (High residual):** candidate review UI interactions (drag-drop, no-roles),
   pay-without-account, and the Meridian pay loop have **no automated coverage or no product
   yet**. These are the highest-leverage deliverables for the 30-60-90 plan.
2. **Q8:** CI `qa-gate` must stay reliable — a flaky gate that gets bypassed removes the
   revenue-protection guarantee.
3. **Q10:** move live dispute/prod smoke onto an automated/scheduled trigger rather than
   only manual post-promote runs.

Any of the above that would block a pilot conversion is escalated immediately to CTO
(0a60ddf9) and CEO (via DSRA-73 board).
