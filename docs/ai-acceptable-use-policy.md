# DSRVM Ltd - AI Acceptable Use Policy (AUP) - Draft v1

Owner: AI Governance Officer (b170f5ca) | Status: Draft - pending CEO review | Date: 2026-08-07
Linked: DSRA-20, DSRA-25 | Applies to: all DSRVM staff, agents, contractors, and AI tooling

## 1. Purpose & scope

This policy defines what may and may not be done with AI systems while performing DSRVM
business. It governs DSRVM's own product surfaces (HR automation, recruiting platform,
web reference architecture, cold-calling/outreach agents) and how the DSRVM team uses
third-party AI tools (LLM providers, coding agents, assistants).

Compliance is a legal and reputational requirement: DSRVM is a provider of AI systems
(EU AI Act) and a data controller/fiduciary for customer data (UK GDPR / EU GDPR / India
DPDP). Non-compliance can create liability for DSRVM and its customers.

## 2. Data handling - what may go into an LLM

### 2.1 Allowed

- Publicly available non-personal information (market data, industry reports).
- Aggregated, de-identified telemetry (counters, no PII - see `@dsrvm/telemetry`).
- DSRVM-owned non-confidential documentation, marketing copy, and code.
- Anonymised synthetic test data that does not resemble any real individual.
- Personal data ONLY where: (a) a lawful basis is documented (consent or legitimate
  interest in the customer contract), (b) the processing is necessary for the service,
  and (c) the model provider's ToS/data-usage terms have passed vendor due diligence.

### 2.2 Prohibited (never feed into a third-party LLM)

1. **Credentials, keys, tokens, or secrets** (API keys, DB connection strings, cloud
   credentials, JWTs, passwords). If an LLM ever returns a secret, report immediately
   and rotate.
2. **Special category personal data** (race, ethnicity, religion, health, biometrics,
   trade-union membership, political opinion) from real candidates/customers - unless
   a specific lawful basis exists (e.g., diversity data collected under explicit consent
   with an approved protocol). AI screening of this data is prohibited at this stage.
3. **Children's data.**
4. **Unconsented candidate/customer PII** - resumes, emails, or contact details without
   a documented lawful basis or contract.
5. **Data governed by an NDA or client data-protection clause** where the client has not
   approved third-party model processing.
6. **Sensitive financial, legal-privileged, or unreleased commercial data** (M&A,
   pricing drafts, unreleased roadmap) unless the tool is approved for that class.

### 2.3 Handling rule

When in doubt, use an approved on-premise/local model (e.g., Ollama local deployment) or
ask the AI Governance Officer before any third-party submission. Default to not sending.

## 3. Acceptable vs prohibited use

### 3.1 Acceptable

- Building/testing DSRVM products with the AI delivery kit (`@dsrvm/ai` gateway,
  structured outputs, evals).
- AI-assisted coding, documentation, QA, research with approved tools.
- Using AI to draft candidate-facing or customer-facing copy **when** reviewed by a human
  before sending (see Section 5).
- Using AI for internal analysis on non-confidential or approved data.

### 3.2 Prohibited

1. **Deceptive AI interactions without disclosure.** Any AI-driven interaction with a
   person (cold calls, chat, candidate outreach) MUST disclose that it is an AI. No
   impersonation of a human without disclosure. (EU AI Act Art 50; Utah AI Policy Act;
   India IT Rules synthetic-content amendments; EU/UCPD fairness rules.)
2. **Autonomous high-impact decisions.** AI may not make final decisions that produce
   legal or similarly significant effects on candidates/employees without human review
   (GDPR Art 22; EU AI Act Art 14). The HR pipeline's human-in-the-loop approval is
   mandatory - never bypass it.
3. **Harmful or unlawful outputs** - discrimination, harassment, defamation, malware,
   fraud, phishing, or content that exploits vulnerability (EU AI Act Art 5).
4. **Using unauthorised tools for work data** - no personal/consumer AI accounts for
   DSRVM confidential data unless approved.
5. **Model training on customer data without approval** - no fine-tuning on real
   customer/candidate data without documented lawful basis + DPIA + vendor terms check.
6. **Circumventing guardrails** - bypassing eval gates, human review, or audit logging.
7. **Prompt injection exposure** - do not place untrusted content directly into
   privileged prompts without isolation (see Section 6).

## 4. Transparency & disclosure

- **End-users:** Where DSRVM products deliver AI-generated content or AI-mediated
  interaction to a person, the interface must clearly disclose it (label, banner, or
  voice announcement). Cold-calling/outreach scripts MUST include an AI disclosure.
- **Clients:** DSRVM provides "instructions for use" (EU AI Act Art 13) telling clients
  what the AI does, its limitations, and required human oversight. Include in contracts.
- **Disclosure wording** must be plain-language and prominent (not buried in fine print).

## 5. Human-in-the-loop & accountability

- Every automated decision that affects an individual's employment opportunity must be
  subject to human review before action. The existing approve/reject queue in
  `apps/hr-automation` is the control; it must remain enabled and audited.
- A named human/agent owner is accountable for each AI surface. Update in DSRA-25 gap
  analysis.
- AI-assisted content that is sent externally must be human-reviewed before sending.

## 6. Technical controls (aligned to `@dsrvm/*`)

- **Prompt registry & versioning** (`@dsrvm/ai` PromptRegistry) - production prompts are
  versioned and change-controlled.
- **Eval gates** - models must pass the eval harness before promotion; no production
  prompt/model changes without evals.
- **Audit logging** - immutable audit log for screening/review events (already in
  `packages/hr`); extend to any new AI decision surface.
- **Telemetry** - cost/usage tracked (`@dsrvm/telemetry`); PII never enters telemetry.
- **Isolation** - untrusted external content is treated as data, not instructions
  (prompt-injection mitigation).
- **Data minimisation** - only send the minimum fields required for the task to the model
  provider.

## 7. Vendor use of data

- Only approved AI providers (see vendor due diligence) may receive DSRVM data.
- Providers must not train on DSRVM/customer data without explicit written approval, must
  apply no-receipt/no-retention where contracted, and must have DPA/SCCs in place.
- Re-review provider ToS/privacy on change and at least annually.

## 8. Roles & responsibilities

- **CEO:** ultimate accountability; signs off this policy and exceptions.
- **CTO:** technical controls, evals, audit logging, deployment guardrails.
- **AI Governance Officer:** policy ownership, regulatory tracking, audits, vendor due
  diligence, exception review, AI literacy.
- **All team members/agents:** comply with this policy; report incidents.

## 9. Incidents & exceptions

- Report suspected misuse or data incidents immediately to the AI Governance Officer and
  CEO; record in the incident log.
- Exceptions require written approval from the AI Governance Officer + CEO, with
  rationale, risk assessment, and a review date.

## 10. Review cadence

Quarterly review, or on any material regulatory/product change. Version controlled;
sign-off recorded here: CEO ___, CTO ___, AI Gov ___.

## Change control

Draft v1 - 2026-08-07. Pending CEO review (see DSRA-25 comment). Next review:
2026-11-01 or on regulatory change.
