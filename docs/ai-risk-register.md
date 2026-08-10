# AI risk register - DSRVM Ltd

Version: Draft v1.1 | Date: 2026-08-08 | Owner: AI Governance Officer (b170f5ca)
Linked: DSRA-36 (deliverable), DSRA-25 (G12), DSRA-26 (DPIA risk table), DSRA-29 (bias), DSRA-35 (incident mgmt), DSRA-20
Status: v1.1 - risk appetite APPROVED by CEO 2026-08-08; register reviewed monthly (ISO 42001 9.1); v1.1 folds in CTO data-residency confirmation (DSRA-37)
Alignment: ISO/IEC 42001 6.1 (risk assessment), EU AI Act Art 9 (risk management)

## 1. Risk appetite statement (for CEO approval)

DSRVM accepts **low-to-moderate, well-controlled risk** in its AI product lines. We do not
accept: (a) risks to candidate/client individuals (bias, harm, unlawful automated
decisions) beyond low residual; (b) avoidable regulatory non-compliance (EU AI Act, GDPR,
DPDP, PECR); (c) reputational risk from undisclosed AI or data misuse. Appetite is
reviewed at CEO sign-off and quarterly.

## 2. Scoring

- **Likelihood (L):** 1 Rare - 2 Unlikely - 3 Possible - 4 Likely - 5 Almost certain
- **Impact (I):** 1 Negligible - 2 Minor - 3 Moderate - 4 Major - 5 Severe
- **Severity = L x I:** 1-6 Low, 7-12 Medium, 13-19 High, 20-25 Critical

## 3. Risk register

| # | Risk | L | I | Sev | Controls (evidence) | Residual | Owner | Review |
|---|---|---|---|---|---|---|---|---|
| R1 | Bias / disparate impact in screening leads to discrimination complaints | 3 | 5 | 15 High | Human-in-the-loop gate (DSRA-6/10); bias protocol + eval gate (DSRA-29); audit trail; candidate notice + human-review right (DSRA-27) | Medium | CTO + AI Gov | Monthly + on model change |
| R2 | Unlawful automated decisions (Art 22 / AI Act) | 2 | 5 | 10 Med | Recommendation-only design; mandatory human review (DPIA DSRA-26); Art 13/26 deployer pack (DSRA-28) | Low | CTO + AI Gov | Monthly |
| R3 | Transparency failure - AI not disclosed (calls, emails, screening) | 3 | 4 | 12 Med | AUP 4 (DSRA-25); cold-calling kit disclosure + human-controller (DSRA-23); candidate notice (DSRA-27); outreach addendum footer (DSRA-33); incident type IT-3 (DSRA-35) | Low-Med | AI Gov + Lead BDR | Monthly |
| R4 | Data breach / PII exposure (candidates, leads) | 2 | 5 | 10 Med | ROPA (DSRA-30); encryption at rest (AES-256) + in transit (TLS 1.2+, CTO-confirmed DSRA-37); hosting UK/EEA eu-west-2; vendor DPAs/ZDR (G3 - go-live precondition); retention/deletion (G6 - pending); incident mgmt + 72h notification (DSRA-35); AUP data rules | Low | CTO + AI Gov | Monthly |
| R5 | Vendor/provider data misuse or training on customer data | 2 | 4 | 8 Med | Vendor due-diligence register (DSRA-25); no-training/ZDR posture (Anthropic preferred, ZDR + DPA/SCC as G3 go-live precondition, DSRA-37); self-hosted Ollama fallback (candidate data stays on DSRVM infra) | Low | AI Gov | Quarterly |
| R6 | Prompt injection via untrusted content | 2 | 3 | 6 Low | AUP 6 isolation; structured outputs; eval gate (DSRA-5); incident IT-4 (DSRA-35) | Low | CTO | On change |
| R7 | Hallucination / misfunction causing material error | 3 | 3 | 9 Med | Eval harness (DSRA-5); human review; incident mgmt IT-5 (DSRA-35); monitoring (G9 pending) | Low-Med | CTO | Monthly |
| R8 | Regulatory change (EU AI Act deadlines, DPDP Rules, US state laws) | 3 | 4 | 12 Med | Regulatory map + monthly review (DSRA-25); deadlines tracked (Art 50 live now; high-risk 2027) | Low-Med | AI Gov | Monthly |
| R9 | Reputational / legal from outbound outreach (PECR, spam complaints, opt-out failure) | 3 | 3 | 9 Med | Outreach addendum (DSRA-33); CRM optOut field (pending apply); region matrix; incident IT-3 | Low-Med | Lead BDR + AI Gov | Monthly |
| R10 | Retention beyond storage limitation (candidate data) | 3 | 3 | 9 Med | G6 deletion schedule (pending engineering); ROPA retention refs | Med (open) | CTO | Monthly until closed |
| R11 | Client deployer misuse (client bypasses human review) | 2 | 3 | 6 Low | Contract pack deployer responsibilities (DSRA-28 C); instructions-for-use | Low | CEO + AI Gov | Quarterly |
| R12 | Dependence on single model provider | 2 | 3 | 6 Low | Provider-agnostic gateway (DSRA-5); Ollama local option; vendor register | Low | CTO | Quarterly |

## 4. Top residual risks to track

1. **R1 bias (High)** - mitigated to Medium residual by human review + pending bias-test
   implementation (G7, DSRA-29). Close G7 before scaling (gates DSRA-22).
2. **R10 retention (Med, open)** - G6 deletion job is the only DPIA control still open in
   code; schedule + implement before production.
3. **R5/R4 vendor** - G3 DPA/ZDR execution before production with OpenAI/Anthropic
   (CTO confirmed as go-live precondition, DSRA-37).
4. **R3/R9 outreach** - footer + CRM optOut field (DSRA-33) before wave-1 sends.

## 5. Governance

- Monthly review of the register (with CEO sync); update on: new product line, model/prompt
  change, regulation change, incident (DSRA-35), or material risk change.
- Risk treatment: mitigate (controls), accept (documented, within appetite), transfer
  (insurance/contract), avoid (do not do).
- Register is evidence for ISO/IEC 42001 readiness (DSRA-25 G15 internal audit).

## 6. Sign-off

Risk appetite approved by CEO: 709bb68f (CEO), date: 2026-08-08; next review: 2026-09-01.

## Versioning

v1 - 2026-08-07 draft. v1.1 - 2026-08-08 CTO data-residency confirmation folded in (UK/EEA
hosting, AES-256 + TLS, G3 go-live precondition, Ollama fallback). Review monthly; next
formal review: 2026-09-01.
