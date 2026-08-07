# DSRVM Ltd - AI Compliance Gap Analysis (ISO/IEC 42001 + AI Act + GDPR)

Owner: AI Governance Officer (b170f5ca) | Status: Baseline v1 | Date: 2026-08-07
Linked: DSRA-20, DSRA-25 | Method: self-assessment against ISO/IEC 42001:2023 control
domains plus EU AI Act / GDPR / DPDP obligations mapped to the current product line

## How to read this

Each row: control -> DSRVM status (Evidence / Gap) -> Priority -> Action. Baseline is
"not yet certified" - goal is a defensible AI governance posture now and ISO/IEC 42001
readiness in 6-12 months. Built from the DSRVM monorepo (`@dsrvm/*` packages, apps,
CI) and DSRA-23/24 onboarding (cold calling + BDR).

## Strengths already in the codebase (evidence found)

- Human-in-the-loop approval before action in HR screening - `apps/hr-automation`
  approve/reject queue, `packages/hr` service (DSRA-6/DSRA-10).
- Immutable audit log for screening/review events - `packages/hr` audit events
  (DSRA-6/DSRA-9).
- Provider-agnostic LLM gateway + prompt registry/versioning + eval harness -
  `packages/ai` (DSRA-5).
- Exactly-once outbox dispatch with leases - `packages/hr` (DSRA-9).
- Cost/usage telemetry without PII - `packages/telemetry` (DSRA-8).
- Postgres-backed persistence with RBAC-ready design - `packages/hr`, `packages/web`
  (DSRA-9/12).
- CI runs lint/typecheck/test/build on every change - monorepo CI (DSRA-4).
- Ingest adapters with row-level error handling + PII hygiene note - `packages/hr`
  ingest (DSRA-11).

## Gap register (prioritised)

### P1 - do now (weeks 1-4)

| # | Gap | Control reference | Current status | Required action | Owner |
|---|---|---|---|---|---|
| G1 | No formal DPIA for HR screening | GDPR Art 35; ISO 42001 8.4 (AIP) | Screening built; no documented DPIA | Produce DPIA covering candidate PII flow: ingest -> screening -> review -> outbox action -> retention | AI Gov (draft) + CTO (data flow) |
| G2 | No AI disclosure in cold-calling / outreach surfaces | EU AI Act Art 50; AUP 4 | Cold calling enablement kit (DSRA-23) being built; disclosure not yet mandated in kit | Add mandatory "AI disclosure" line to scripts + booking/email templates in DSRA-23; verify before go-live | AI Gov (policy) + Cold Calling agent |
| G3 | Vendor due diligence not on record | ISO 42001 5.2/8.2 (third parties) | Models via OpenAI/Anthropic/demo, tooling via Ollama/opencode; no formal reviews | Complete vendor due-diligence register (see ai-vendor-due-diligence.md); execute DPAs/SCCs before production | AI Gov |
| G4 | No AI literacy programme | EU AI Act Art 4 | None | Stand up AI literacy brief for all agents/staff (what is AI, disclosure rules, data rules, incident reporting) | AI Gov + CEO |
| G5 | No instructions-for-use / deployer contract pack | EU AI Act Art 13/25 | Client contracts generic | Add AI "instructions for use" + human-oversight clause to client SOW/contract templates | CEO + AI Gov |
| G6 | Data retention/deletion schedules undocumented | GDPR Art 5(1)(e); DPDP Rules | Candidate data persists; no retention policy | Define retention schedule per data class (resume PII, audit events, outbox); operationalise deletion | CTO + AI Gov |

### P2 - before production/EU market (weeks 4-12)

| # | Gap | Control reference | Current status | Required action | Owner |
|---|---|---|---|---|---|
| G7 | No bias/disparate-impact testing of screening model | EU AI Act Annex III data governance (Art 10); EEOC; NYC LL144; ISO 42001 8.3 | Eval harness checks format/semantics, not protected-class bias | Extend eval harness with protected-group bias tests (synthetic cohorts); document testing protocol + results | CTO + AI Gov |
| G8 | No technical documentation package | EU AI Act Art 11 + Annex IV | Code exists; no system-level documentation | Author technical documentation: intended purpose, architecture, dev process, test results | CTO |
| G9 | No post-market monitoring plan | EU AI Act Art 72; ISO 42001 9.1 | Telemetry exists (cost/usage) but no incident/performance review loop | Add monitoring of screening recommendation drift + incident review cadence | CTO + AI Gov |
| G10 | No explicit automated-decision / profiling disclosure to candidates | GDPR Art 22; EU AI Act Art 13/50 | Candidates not informed AI is used in screening | Add candidate-facing notice "AI-assisted screening" + right to request human review | CTO + AI Gov |
| G11 | Data Protection Officer not appointed | DPDP Rules (SDF); GDPR Art 37 trigger review | None | Assess whether DPO is legally required; if not, designate accountable individual + document rationale | CEO + AI Gov |

### P3 - ISO/IEC 42001 readiness (3-6 months)

| # | Gap | Control reference | Current status | Required action | Owner |
|---|---|---|---|---|---|
| G12 | No formal AI risk register / risk treatment plan | ISO 42001 6.1 | Risks captured in roadmap informally | Stand up risk register (risk, likelihood, impact, controls, owner, review date) | AI Gov |
| G13 | No management system policies/objectives | ISO 42001 5.2/6.2 | AUP draft (DSRA-25) only | Adopt AUP; set measurable AI governance objectives + KPIs | CEO + AI Gov |
| G14 | No competence/training records | ISO 42001 7.2 | AI literacy (G4) planned | Track completion; periodic refresher | AI Gov |
| G15 | No internal audit / management review process | ISO 42001 9.2/9.3 | None | Quarterly AI governance review with CEO; annual internal audit cycle | AI Gov + CEO |
| G16 | No documented change-management for AI | ISO 42001 8.1 (ops) | Prompt registry versioning exists; no change policy | Extend to model changes, prompt changes, feature changes affecting AI decisions | CTO |
| G17 | No incident management process | ISO 42001 8.5 | None | Define incident types (bias event, data breach, prompt injection, disclosure failure), response, escalation, logging | AI Gov + CTO |
| G18 | No alignment statement/opt-out for training on customer data | ISO 42001 8.2; AUP 2/7 | Not defined | Contractual commitment that customer data is not used for model training without approval | CEO + AI Gov |

## Risk summary

Top 5 risks if unaddressed:
1. AI screening bias leading to discrimination claims (EEOC/Equality Act/EU) - G7.
2. Missing disclosure on AI outreach/cold calls (Art 50, Utah, UCPD) - G2.
3. Vendor data-use/ownership misalignment with customer expectations - G3.
4. No DPIA = GDPR non-compliance at production scale - G1.
5. No retention/deletion = DPDP/GDPR storage-limitation breach - G6.

## Owner routing

AI Governance Officer owns the register and drives P1/P2 with CTO; CEO signs policy and
contract packs; Cold Calling agent implements G2 in DSRA-23. Review the register at the
next CEO sync or weekly heartbeat.

## Change control

Baseline v1 - 2026-08-07. Review monthly or on material change. Next review:
2026-09-01.
