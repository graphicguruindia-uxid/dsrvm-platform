# DPIA: AI-assisted HR screening (automated recommendation + human review)

Version: Draft v1 | Date: 2026-08-07 | Owner: AI Governance Officer (b170f5ca)
Linked: DSRA-26 (deliverable), DSRA-25 (G1), DSRA-20 (governance), DSRA-6/9/10/11 (HR automation), DSRA-22 (recruiting platform)
Status: Draft - pending CTO confirmation of data flow, then CEO sign-off

## 1. Screening decision & rationale

**Is a DPIA required?** Yes - full DPIA.

- GDPR Art 35(1) + (3)(a): systematic and extensive evaluation of personal aspects based on
  automated processing, including profiling, with decisions producing legal/similar effects.
- GDPR Art 35(3)(b): processing special category data on a large scale (candidate resumes can
  contain health, ethnicity, membership data).
- EU AI Act Annex III(4)(a): AI for recruitment/screening candidates is "high risk". Art 27
  exemption only applies to credit scoring; screening is not exempt.
- India DPDP Act 2023 (screening as personal data processing; significant data fiduciary
  duties trigger for DSRA-22 scale).

**Decision:** full DPIA, documented controls, monitoring. No blanket prohibition - controls
below make the processing proportionate.

## 2. Description of processing

### 2.1 Data flow (from code: packages/hr/src)

1. **Ingest** (`ingest/csv.ts`, `ingest/email.ts`, `ingest/resume.ts`): candidates arrive via
   ATS/CSV import, email-to-candidate, or resume text extraction. Fields captured:
   `name`, `email`, `resumeText` (free text), linked to `roleId`.
2. **Storage** (`db/schema.ts`): `candidates` (with `status`, `screening`, `review`),
   `audit_events` (immutable action log), `outbox_events` (exactly-once dispatch, leases).
   Postgres via Drizzle (`packages/db`).
3. **AI screening** (`screening.ts` via `packages/ai` gateway): model scores candidate against
   role `requirements`/`niceToHave`, producing `ScreeningResult { score, recommendation
   (advance|reject|needs_review), summary, strengths, flags, provider, model, screenedAt }`.
4. **Human review** (`ReviewDecision { approved, reviewer, note, decidedAt }`): reviewer
   UI/API (`apps/hr-automation`). Human decision is the decision that counts. Screening
   output is a recommendation, not a final decision.
5. **Dispatch** (`outbox.ts`): approved/rejected outcomes dispatched exactly-once (e.g.,
   notification to candidate/client).

### 2.2 Data subjects & categories

- Data subjects: job candidates (DSRVM clients' applicants).
- Data categories: name, email, full CV/resume text (may include employment history,
  qualifications, and - unintentionally - special category data such as health, ethnicity,
  gender, religion, union membership, family status), job application context, screening
  scores/summary, review decisions, audit events.
- No children's data, no biometric data, no consent-dependent special category processing by
  design at this stage.

### 2.3 Storage & retention

- Postgres: candidates, audit events, outbox. No retention/deletion job implemented yet
  (gap G6) - flagged as a required control below.

### 2.4 Processing location & third parties

- Model providers: OpenAI/Anthropic API (or Ollama local) via `packages/ai` gateway. Vendor
  due-diligence register: ai-vendor-due-diligence.md (DSRA-25). No training on customer data
  by default for API products; DPA/SCC execution is a precondition (G3).
- Infrastructure: DSRVM cloud (subject to CTO confirmation of hosting region/data residency).

## 3. Consultation process

- CTO (709bb68f): confirm data flow, storage encryption, hosting region, and data
  residency. (Needed before finalisation.)
- CEO (709bb68f... CEO agent): sign-off after CTO confirmation.
- Data subjects: transparency notice to candidates ("AI-assisted screening used; you may
  request human review") - see Section 8.4.
- DPA/ICO: if controls cannot be made proportionate, consult the ICO before processing.

## 4. Necessity & proportionality

| Control area | Necessity assessment |
|---|---|
| Collecting name/email/resume | Necessary to assess suitability for the role; data minimised to what the ATS/client provides. |
| Automated scoring | Proportionate - it is a *recommendation* gated by mandatory human review (status `pending_review` -> `approved|rejected`). No final decision is automated (GDPR Art 22 compliant design). |
| Storing screening + review audit events | Necessary for accountability, dispute resolution, and (upcoming) bias testing. |
| Third-party model call | The screening model is called over the network; resume text leaves DSRVM infra. Acceptable only with vendor due diligence + DPA + no-training commitment; local Ollama is the fallback for sensitive clients. |

## 5. Risk assessment

| # | Risk | Likelihood | Impact | Controls (implemented / planned) | Residual |
|---|---|---|---|---|---|
| R1 | Bias / disparate impact in scoring (protected characteristics in resumes) | Medium | High | Eval harness (existing); G7 planned: protected-group bias tests + documented test protocol; human review as override; review-flag escalation (`needs_review` path) | Medium-Low |
| R2 | Discrimination complaints from rejected candidates | Medium | High | Art 22 compliant human review, audit trail of decision + reviewer note, candidate transparency notice, right to request human review | Medium-Low |
| R3 | Special category data processed without lawful basis | Medium | High | AUP (DSRA-25) prohibits special-category use without approved protocol; data minimisation in prompts; flag-and-redact guidance for reviewers; no cross-model training | Low |
| R4 | Unauthorised access / breach of candidate PII | Medium | High | Postgres RBAC-ready design, audit events, secret hygiene (AUP 2.2.1), encryption at rest/transit (confirm w/ CTO), vendor DPA/SCC | Low-Medium |
| R5 | Retention beyond storage limitation | High | Medium | Gap G6: define + implement retention/deletion schedule before production | Medium (open) |
| R6 | Disclosure failure (candidate not told AI used) | Medium | Medium | Candidate-facing AI-assisted notice + human-review right (G10); AUP 4 | Low |
| R7 | Provider data misuse / training on candidate data | Low | Medium | Vendor register + DPA/no-training clause (G3); prefer API over consumer products; Ollama option | Low |
| R8 | Prompt injection via malicious resume text | Low-Medium | Medium | Untrusted resume text treated as data, not instructions (AUP 6); structured outputs + eval harness | Low |

### Overall residual risk: Medium-Low (with controls) - processing should proceed only once
P1 gaps (G1 this DPIA, G3 DPA, G6 retention) and G7 bias testing are closed.

## 6. Measures to address risk

1. **Human-in-the-loop** remains mandatory: automated recommendation cannot trigger a
   final action without a reviewer decision (`ReviewDecision`). Do not bypass the
   `pending_review` gate in any future automation.
2. **Bias testing** (G7): extend eval harness with protected-class synthetic cohorts
   before scaling; document protocol and results; re-run on model/prompt changes.
3. **Data minimisation** (AUP 2.3/6): send only required fields to the model; never send
   special category data; flag-and-redact workflow for ingest.
4. **Vendor controls** (G3): DPA/SCCs + no-training confirmation with OpenAI/Anthropic;
   ZDR enabled; local Ollama for sensitive clients; re-review register annually.
5. **Retention & deletion** (G6): define schedule (e.g., candidates X months post-decision,
   audit events Y years) and implement deletion job before production.
6. **Security**: encryption at rest/transit (confirm with CTO), RBAC on reviewer access,
   immutable audit events, secret hygiene.
7. **Transparency** (G10): candidate notice "AI-assisted screening", right to human review,
   and plain-language explanation of scoring on request.

## 7. Sign-off

| Role | Name | Date | Status |
|---|---|---|---|
| AI Governance Officer | b170f5ca | 2026-08-07 | Prepared |
| CTO (data flow/hosting confirmation) | 0a60ddf9 | - | Pending (paused) |
| CEO (sign-off) | 709bb68f | - | Pending |
| DPA/ICO consultation | - | - | Only if required |

## 8. Review cadence

- Review on: model/provider change, prompt change, feature change affecting decisions,
  regulation change, or annual review (whichever is earliest).
- Record all reviews in the change log.

## Change control

Draft v1 - 2026-08-07. Pending CTO/CEO sign-off. Next review: 2026-09-01 or on change.
