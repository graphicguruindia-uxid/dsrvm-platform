# Technical documentation - AI-assisted HR screening (high-risk system)

Version: Filled v1.0 | Date: 2026-08-17 | Owner: CTO 2 (0a60ddf9), template by AI Gov (b170f5ca)
Linked: DSRA-42 (G8), DSRA-26 (DPIA), DSRA-29 (bias protocol), DSRA-36 (risk register), DSRA-25 (AUP)
Compliance: EU AI Act Art 11 + Annex IV (high-risk system, Annex III(4)(a))

## Purpose

Technical documentation package for the DSRVM AI-assisted HR screening system under EU AI
Act Art 11 / Annex IV. Engineering sections completed by the CTO; governance content is
referenced (DPIA, risk register, bias protocol, AUP, QA evidence). Retained for 10 years
after the system is placed on the market.

## 1. System identification

| Field | Content |
|---|---|
| Name / version | dsrvm-hr-screening v0.2.0 (packages/hr + packages/ai) |
| Provider / deployer | DSRVM Ltd |
| Date placed on market | [FILL: pilot go-live date - not yet placed; pilot pre-production] |
| Location of system (URL / repo) | Monorepo, `packages/hr` + `packages/ai` + `apps/hr-automation` |
| Applicable legislation | EU AI Act (high-risk), UK GDPR / EU GDPR, India DPDP Act 2023 |

## 2. Intended purpose (Art 11 / Annex IV 1(a))

- General description: candidate intake + AI-assisted shortlisting for DSRVM clients'
  hiring; output is a **recommendation only** (score 0-100, advance/reject/needs_review).
  Reference: DPIA Section 2.1 (data flow).
- Final decision is always a human reviewer decision (Art 22-compliant design).
- Product description: clients submit roles + candidates (ATS/CSV/email/resume); DSRVM
  screens each candidate against the role with a structured LLM call; the reviewer UI shows
  the recommendation with a mandatory human approve/reject gate; decisions are dispatched
  (outbox) with an AI transparency notice on every status email.
- Not intended for: autonomous hiring decisions, decisions without human review, use on
  children's data, or processing outside the approved recruitment context.

## 3. System architecture and logic (Annex IV 1(a)/(b))

- Architecture: ingest (ATS/CSV/email/resume via `CandidateIngestor`) -> Postgres
  (`candidates`, `audit_events`, `outbox_events`) -> AI screening (`packages/ai` gateway via
  `packages/hr` `createScreeningEngine`) -> human review UI (`apps/hr-automation` reviewer
  server) -> outbox dispatch (ack + decision emails, each carrying the AI transparency
  notice). Reference: DPIA Sections 2.1-2.4.
- Key design choices / algorithms: provider-agnostic `LlmGateway` with active-provider
  switch (Anthropic/OpenAI/Ollama/demo/fake); `SCREENING_PROMPT` registered in a
  `PromptRegistry` (versioned, render-time guard on missing variables); structured output
  via `generateStructured` against the `SCREENING_SCHEMA`:
  `ScreeningResult { score, recommendation, summary, strengths, flags, provider, model,
  screenedAt }`; score clamped 0-100; recommendation restricted to
  advance | reject | needs_review.
- Data flow and storage: DPIA Sections 2.1-2.4 (UK/EEA hosting eu-west-2, AES-256 at rest,
  TLS 1.2+ in transit, US transit for screening API under DPA+SCCs+ZDR - G3 precondition).
- Human oversight: mandatory `pending_review` gate - review is hard-blocked (400) until the
  AI transparency notice is disclosed (`ai_notice_disclosed_at`), enforced in
  `reviewCandidate` + API (DSRA-27/R6). Reference DPIA Section 6.1.

## 4. Development process (Annex IV 1(c))

- Version control / CI: pnpm + Turborepo monorepo; CI runs lint/typecheck/test/build
  (`.github/workflows/ci.yml`) then the QA gate (`qa:smoke`, E2E smoke) then the AI bias
  gate (`bias:gate`, DSRA-42 G7). Promotion requires all four green.
- Model/provider selection and changes: provider gateway in `packages/ai`; model + prompt
  versions are recorded in `ScreeningResult`; eval harness (`runEvals`) + bias suite
  (`assessBiasSuite`/`runBiasGate`) gate any prompt/model/screening-logic change
  (ai-bias-testing-protocol cadence).
- Change management: reference risk register G16 / AUP; changes flow through the normal
  PR -> CI -> QA gate -> promote path with audit trail retained.

## 5. Data and data governance (Art 10; Annex IV 1(d))

- Data categories used (training / validation / testing): no training data; evaluation uses
  synthetic protected-class cohorts from `buildSyntheticCohorts` (git-versioned fixtures in
  `packages/hr`), which vary only protected-characteristic signals (name/email/education/
  employment gaps/disability accommodation mentions) over identical skills.
- Provenance and collection: candidate data collected only from client-provided intake
  (ATS/CSV/email/resume) in the HR pilot; no data sold or shared beyond the screening flow.
- Data minimisation: DPIA Section 6.3 + AUP 2.3/6 (no special-category data to models;
  screening operates on resume text only).
- Special category handling: AUP 2.2.2 flag-and-redact; special-category data is never sent
  to a model.

## 6. Testing, validation, and results (Annex IV 1(d); Art 9)

- Eval harness: `runEvals` in `packages/ai` - per-case asserts (`contains`,
  `not_contains`, `exact`, `json_schema`), pass/fail summary, duration. Runs as part of
  package tests (39 tests green in `@dsrvm/ai`).
- Bias testing (G7): `assessBiasSuite` in `packages/ai` + `runBiasGate`/`buildSyntheticCohorts`
  in `packages/hr`. Metrics: recommendation parity, score mean/median, 4/5ths rule (EEOC),
  Cohen's d effect size, Mann-Whitney U p-value. Thresholds per ai-bias-testing-protocol:
  PASS (4/5ths >= 0.9 AND |d| < 0.1 AND no significant diff), WATCH, FAIL. Wired as
  `pnpm bias:gate` in CI + 2 qa-smoke checks. Deterministic demo gate: **PASS** (61/61
  qa-smoke). Real-provider runs gate on model/prompt/screening changes and at least
  quarterly (protocol cadence).
- QA gate evidence: DSRA-41 PASS (f78375ee, 52/52 smoke baseline); qa-smoke extended to
  61/61 incl. G6 retention + G7 bias checks; unit suites green across packages.
- Known limitations / failure modes: LLM hallucination/misread and unjustified flags -
  treated as aids, human reviewer is quality control (literacy brief); prompt-injection
  handling per AUP 6; recommendation-only design limits harm.

## 7. Risk management (Art 9; Annex IV 1(e))

- Risk register: ai-risk-register.md (DSRA-36), top residuals R1 (bias - G7, now gated),
  R5 (retention - G6, now enforced), R7 (provider - G3, precondition). DPIA Section 5
  risk table (residual Medium-Low, CEO signed DSRA-26).
- Residual risk after G3/G6/G7: G6 enforced (retentionCleanup scheduled hourly +
  on-demand, dispute-hold override, telemetry TTL 90d); G7 bias gate in CI (bias:gate);
  G3 remains a go-live precondition - no pilot screening dispatch occurs before DPA+SCCs+
  ZDR are executed (per DPIA sign-off conditions).

## 8. Human oversight measures (Art 14; Annex IV 1(f))

- Reviewer UI (`apps/hr-automation`): `ReviewDecision { approved, reviewer, note,
  decidedAt }`, mandatory review gate, `needs_review` escalation path; review is blocked
  until AI notice disclosure is recorded. Reference DPIA Sections 2.1.4 + 6.1.

## 9. Lifecycle and maintenance (Annex IV 1(g))

- Expected lifetime: indefinite with continuous maintenance; retained documentation for
  10 years post-market (Art 11).
- Maintenance / re-testing triggers: model or provider change, prompt change (PromptRegistry
  version bump), screening-logic change, intake change altering candidate population,
  regulation change (DPIA Section 8 review cadence), post-incident.
- Post-market monitoring (G9): telemetry tracks per-task cost + model versions; QA
  post-promote evidence retained (DSRA-61 fed2e4e); bias suite re-run per protocol cadence.

## 10. Change log

| Date | Version | Change | By |
|---|---|---|---|
| 2026-08-10 | v1 | Template created | b170f5ca |
| 2026-08-17 | v1.0 | Engineering sections filled (G8) | 0a60ddf9 |