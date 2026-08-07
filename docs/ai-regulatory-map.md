# DSRVM Ltd - AI Regulatory Map

Owner: AI Governance Officer (b170f5ca) | Status: Baseline v1 | Date: 2026-08-07
Linked: DSRA-20, DSRA-25 | Reviewed: EU AI Act timelines, India DPDP Rules, US state AI laws

## Purpose

Map the AI and data-protection regulations that apply to DSRVM's product surfaces and
delivery operations, state which obligations attach to each surface, and give the team a
single source of truth for "which law applies where." This is the foundation for the
Acceptable Use Policy (DSRA-25) and the ISO/IEC 42001 gap analysis.

## Applicability logic

DSRVM is a UK company ("provider" of AI systems and "data controller"/"data fiduciary"
for customer data). Applicability depends on (a) where DSRVM operates, (b) where DSRVM's
users/data subjects are located, and (c) what the AI system does.

| DSRVM surface | Region (per board/CTO plans) | AI function | High-risk? |
|---|---|---|---|
| HR automation (`@dsrvm/hr`, `apps/hr-automation`) | UK first, then EU + global | CV screening, candidate scoring, summarise, routing recommendations | **YES - EU AI Act Annex III(4)** (recruitment, CV screening, candidate evaluation) |
| AI recruiting platform (DSRA-22) | India/UAE + SMBs, global | AI sourcing, scoring, matching, outreach | **YES - EU AI Act Annex III(4)** if EU users; India DPDP + IT Rules; UAE PDP Law (2021, enforced 2024) |
| Enterprise web ref arch (`apps/web`) | Global (white-label) | CMS, SSO, billing - minimal AI | No (not an AI system in the AI Act sense unless embedded) |
| AI delivery kit (`@dsrvm/ai`) | DSRVM-internal + client engagements | LLM gateway, evals | Tooling used to build high-risk systems; obligations attach at the system level |
| Cold Calling agent | UK/global outbound | AI-voice / AI-written outreach | **Not** high-risk, but Article 50 transparency + UK/EU UCPD disclosure apply (AI disclosure mandatory) |
| Telemetry/usage (`@dsrvm/telemetry`) | All surfaces | Cost/usage metrics | No; but feeds pricing and model-use logging (supporting control) |

## 1. EU AI Act (Regulation (EU) 2024/1689)

Status as of 2026-08-07: in force; prohibited practices + AI literacy already applied
(2 Feb 2025); Article 50 transparency rules apply 2 Aug 2026; **high-risk Annex III
obligations were deferred by the Digital Omnibus to 2 Dec 2027** (provisional agreement
May 2026; Council sign-off expected before 2 Aug 2026 - if the Omnibus is not adopted,
the original 2 Aug 2026 date stands. Treat 2 Dec 2027 as target, 2 Aug 2026 as fallback
for planning).

Obligations that are already live and matter to DSRVM now:

- **Article 50 transparency (2 Aug 2026):** AI-generated synthetic content and AI
  interactions must be disclosed to users. Affects: cold-calling/outreach (declare "you
  are speaking with an AI"), AI-generated candidate communications, and any AI chatbot
  surfaces. Deployers must inform affected natural persons that they are interacting with
  an AI system.
- **AI literacy (Art 4):** DSRVM staff who develop/deploy AI must have an appropriate level
  of AI literacy. Requires a training/awareness programme.
- **Prohibited practices (Art 5, since 2 Feb 2025):** DSRVM must not deploy social scoring,
  subliminal manipulation, or AI that exploits vulnerability. None of our surfaces do this,
  but the AUP should restate the ban.

High-risk obligations (Annex III(4) employment systems - CV screening, candidate
evaluation, selection). When they apply (2 Dec 2027 target), DSRVM as **provider** must
have:

1. Risk management system (Art 9) - HR pipeline: bias, error, exclusion risks.
2. Data governance (Art 10) - training/validation data quality, bias controls.
3. Technical documentation (Art 11 + Annex IV) - intended purpose, system architecture,
   development process, testing results.
4. Record-keeping / logging (Art 12) - every automated screening decision logged.
5. Transparency & information to deployers (Art 13) - instructions for use, capabilities,
   limitations.
6. Human oversight (Art 14) - human-in-the-loop review of AI screening before action.
   **Already implemented in DSRA-6/DSRA-10 (approve/reject review queue) - this is a
   strong existing control.**
7. Accuracy, robustness, cybersecurity (Art 15) - eval harness (`@dsrvm/ai`),
   guardrails, adversarial testing.
8. Conformity assessment + EU declaration + CE marking + registration in EU database
   (Art 43/47/49) - required before placing on EU market.
9. Post-market monitoring (Art 72) - ongoing performance/bias monitoring.

For customers (deployers) using DSRVM as provider: they must follow DSRVM's instructions
for use; DSRVM must provide them in a written agreement (Art 25).

## 2. GDPR / UK GDPR

Applies to personal data processing of EU/UK data subjects regardless of DSRVM's location.

- **Lawful basis + purpose limitation (Art 5/6):** candidate data processed for screening
  must have a documented lawful basis (consent or legitimate interests documented in the
  client contract).
- **Automated decision-making / profiling (Art 22):** AI screening that produces decisions
  with legal/similar significant effect must allow human review and the right to contest.
  DSRVM's human-in-the-loop approval flow satisfies this in spirit; formalise it.
- **DPIA (Art 35):** HR screening of candidates is a high-risk processing; a DPIA is
  required before large-scale production. This is a **priority action item**.
- **Data minimisation, storage limitation, integrity/confidentiality (Art 5):** resume
  PII handling; retention schedules; encryption.
- **Rights:** access, rectification, erasure ("right to be forgotten" - including not
  using data to train models in a way that keeps it recoverable), restriction, portability,
  objection. Must be operationally supported.
- **Records of processing (Art 30), breach notification 72h (Art 33/34).**
- **Cross-border transfers (Art 44-49):** if data flows to US model providers (OpenAI/
  Anthropic), transfer mechanism (SCCs + TIA, or EU/UK-US Data Privacy Framework
  certification) must be verified - ties into vendor due diligence.

## 3. India - DPDP Act 2023 + DPDP Rules 2025

DPDP Rules notified 13 Nov 2025; phased 18-month rollout (~full operationalisation
mid-2027). Applies to processing of digital personal data connected to goods/services
offered to individuals in India (extraterritorial).

- **Consent + notice:** consent requests must be accompanied by an itemised notice
  (purpose, categories, retention). Applies to candidate data on the recruiting platform.
- **Data principal rights:** access, correction, erasure, grievance redressal (90 days).
- **Breach notification:** notify DPBI + affected principals "without delay", detailed
  report within 72 hours. Penalties up to Rs 250 crore for security-safeguard failures.
- **Accuracy/consistency** where data is used for decisions affecting individuals -
  directly relevant to AI scoring/ranking.
- **Significant Data Fiduciary (SDF):** if DSRVM crosses SDF thresholds: DPO appointment,
  annual DPIAs, independent audits, algorithmic fairness assessments.
- **Synthetic content:** IT (Intermediary Guidelines) Amendment Rules 2026 (effect
  20 Feb 2026) - deepfake/AI-generated content disclosure obligations for platforms;
  relevant to AI-sourced candidate communications and content on the platform.
- **No standalone Indian AI Act yet** (as of Feb 2026): regulate through DPDP + IT Act +
  sectoral rules + "India AI Governance Guidelines" (non-binding).

## 4. US - federal & state

- **EEOC (Title VII):** AI hiring tools must not discriminate on protected class; EEOC
  technical assistance guidance applies to employers; DSRVM's screening must be tested
  for disparate impact by protected group.
- **New York City Local Law 144** (AEDT): if DSRVM deploys an "automated employment
  decision tool" for NYC-based roles: independent bias audit (annually), public disclosure
  of audit, notice to candidates, record retention.
- **Illinois AIVI Act / Maryland / NYC Local Law 1894:** requirements around AI video
  interview analysis (consent, disclosure, limits).
- **Colorado AI Act (SB 24-205, effective 2026):** first comprehensive US state AI law -
  for "high-risk AI systems" (incl. employment) deployers must implement a risk-management
  framework, notify consumers, report algorithmic discrimination to AG. Applies to DSRVM
  customers deploying our HR tools in Colorado.
- **Utah AI Policy Act:** transparency for AI interactions (disclosure that user interacts
  with AI) - relevant to cold-calling/chatbots.
- **Federal:** no comprehensive federal AI law; Executive Orders/NIST AI RMF (NIST AI 600-1)
  as the practical framework DSRVM should adopt for risk management.

## 5. UK / UAE / other

- **UK:** no standalone AI Act; UK GDPR + Equality Act 2010 (indirect discrimination in
  recruitment) + ICO AI guidance; ICO "AI and data protection risk toolkit". AI regulation
  approach is sector-led. The Online Safety Act and UK copyright/IP concerns for training
  data should be monitored.
- **UAE:** Federal Decree-Law No. 45/2021 (PDP Law) + Personal Data Protection Regulations
  2024; no AI-specific law - DPDP for the recruiting platform's UAE users.
- **China (if DSRVM targets APAC/China users):** Algorithmic Recommendation Regulations
  2022, Interim Measures for Generative AI 2023, PIPL. Monitor, not a current priority.

## 6. Standards-based governance (voluntary)

- **ISO/IEC 42001:2023** (AI management system) - the leading certifiable standard; gap
  analysis in DSRA-25.
- **NIST AI RMF 1.0 / NIST AI 600-1** - risk management framework aligned to US.
- **IEEE 7000** - ethics-by-design in system engineering.

## Summary of immediate obligations (prioritised)

1. **Article 50 disclosures** for AI interactions (cold-calling, candidate outreach) - live.
2. **AI literacy programme** (Art 4) - live.
3. **DPIA for HR screening** (GDPR Art 35) - before production scale.
4. **Human-in-the-loop + audit logging** for screening - already built (DSRA-6/9/10);
   verify + document.
5. **Vendor data-protection alignment** with model providers (SCCs/DPF, retention,
   non-ownership of inputs) - vendor due diligence in DSRA-25.
6. **Bias/discrimination testing** (EEOC, EU Annex III data governance, NYC LL144,
   Colorado) - eval harness extension.
7. **Instruct-for-use docs for deployers** (AI Act Art 13/25) - contractual.

## Change control

This map is a living baseline. Re-review quarterly or on material product/regulatory
changes (e.g., Council sign-off of the Digital Omnibus, DPDP phased dates, state AI laws).
Next scheduled review: 2026-11-01.
