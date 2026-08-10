# Technical documentation template - AI-assisted HR screening (high-risk system)

Version: Template v1 | Date: 2026-08-10 | Owner: AI Governance Officer (b170f5ca)
Linked: DSRA-42 (G8), DSRA-26 (DPIA), DSRA-29 (bias protocol), DSRA-36 (risk register), DSRA-25 (AUP)
Compliance: EU AI Act Art 11 + Annex IV (high-risk system, Annex III(4)(a))

## Purpose

This is the template for the technical documentation package required for a high-risk AI
system under EU AI Act Art 11 / Annex IV. CTO fills in each section with engineering
specifics (marked `[FILL]`). Governance content already exists and is referenced, not
re-written. The completed package must be kept up to date and retained for 10 years after
the system is placed on the market.

## 1. System identification

| Field | Content |
|---|---|
| Name / version | [FILL: e.g. dsrvm-hr-screening vX.Y.Z] |
| Provider / deployer | DSRVM Ltd |
| Date placed on market | [FILL: pilot go-live date] |
| Location of system (URL / repo) | [FILL: repo path, packages/hr + packages/ai] |
| Applicable legislation | EU AI Act (high-risk), UK GDPR / EU GDPR, India DPDP Act 2023 |

## 2. Intended purpose (Art 11 / Annex IV 1(a))

- General description: candidate intake + AI-assisted shortlisting for DSRVM clients'
  hiring; output is a **recommendation only** (score, advance/reject/needs_review).
  Reference: DPIA Section 2.1 (data flow).
- Final decision is always a human reviewer decision (Art 22-compliant design).
- [FILL: one-paragraph product description from the product owner].
- Not intended for: [FILL: out-of-scope uses - e.g., no autonomous hiring decisions].

## 3. System architecture and logic (Annex IV 1(a)/(b))

- [FILL: architecture diagram - ingest (ATS/CSV/email/resume) -> Postgres (candidates,
  audit_events, outbox_events) -> AI screening (packages/ai gateway) -> human review UI ->
  outbox dispatch].
- Key design choices / algorithms: [FILL: model + prompt version, scoring logic, structured
  output schema - ScreeningResult { score, recommendation, summary, strengths, flags,
  provider, model, screenedAt }].
- Data flow and storage: DPIA Sections 2.1-2.4 (UK/EEA hosting eu-west-2, AES-256 at rest,
  TLS 1.2+ in transit, US transit for screening API under DPA+SCCs+ZDR - G3 precondition).
- Human oversight: [FILL: mandatory pending_review gate; reference DPIA Section 6.1].

## 4. Development process (Annex IV 1(c))

- Version control / CI: [FILL: monorepo, lint/typecheck/test/build gate, QA gate]
- Model/provider selection and changes: [FILL: provider gateway packages/ai, model version,
  prompt versioning, eval harness]
- Change management: reference risk register G16 / AUP; [FILL: process].

## 5. Data and data governance (Art 10; Annex IV 1(d))

- Data categories used (training / validation / testing): [FILL: eval cohorts; synthetic
  protected-class cohorts from ai-bias-testing-protocol]
- Provenance and collection: [FILL]
- Data minimisation: DPIA Section 6.3 + AUP 2.3/6 (no special-category data to models).
- Special category handling: AUP 2.2.2 flag-and-redact.

## 6. Testing, validation, and results (Annex IV 1(d); Art 9)

- Eval harness: [FILL: accuracy metrics, pass criteria, date + results]
- Bias testing (G7): attach results per ai-bias-testing-protocol (synthetic cohorts,
  protected groups, threshold + outcome). [FILL: date + results, on completion]
- QA gate evidence: [FILL: QA reports - DSRA-41 PASS (f78375ee, 52/52 smoke)]
- Known limitations / failure modes: [FILL: hallucination/misread guidance from literacy
  brief; prompt-injection handling AUP 6].

## 7. Risk management (Art 9; Annex IV 1(e))

- Risk register: ai-risk-register.md (DSRA-36), top residuals R1 (bias - G7), R5
  (retention - G6), R7 (provider - G3). DPIA Section 5 risk table.
- [FILL: summary of residual risk after G3/G6/G7 closed].

## 8. Human oversight measures (Art 14; Annex IV 1(f))

- [FILL: reviewer UI, ReviewDecision { approved, reviewer, note, decidedAt }, escalation
  path needs_review]. Reference DPIA Sections 2.1.4 + 6.1.

## 9. Lifecycle and maintenance (Annex IV 1(g))

- Expected lifetime: [FILL]
- Maintenance / re-testing triggers: model or provider change, prompt change, feature
  change, regulation change (DPIA Section 8 review cadence).
- Post-market monitoring (G9): [FILL: drift + incident review cadence].

## 10. Change log

| Date | Version | Change | By |
|---|---|---|---|
| 2026-08-10 | v1 | Template created | b170f5ca |
