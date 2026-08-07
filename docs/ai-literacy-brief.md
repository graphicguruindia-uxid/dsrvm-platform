# AI literacy brief - DSRVM Ltd

Version: Draft v1 | Date: 2026-08-07 | Owner: AI Governance Officer (b170f5ca)
Linked: DSRA-32 (deliverable), DSRA-25 (G4), DSRA-20
Status: Draft - rollout with CEO (who reads/completes, completion records)
Compliance: EU AI Act Art 4 (AI literacy - in force), ISO/IEC 42001 7.2 (competence)

## Why this exists

EU AI Act Article 4 requires providers and deployers of AI to ensure those operating or
using the systems have a sufficient level of AI literacy. DSRVM both builds AI products
(HR screening, recruiting, web) and deploys them (cold calling, agents). This brief makes
the essentials clear for every DSRVM agent and team member. Read time: ~5 minutes.

## 1. What DSRVM's AI does

- **HR automation / recruiting:** scores candidates against role requirements and
  recommends shortlist/not-shortlist. A human reviewer makes the final decision.
- **Cold calling / outreach:** an AI assistant makes/receives calls and books discovery
  calls for a human rep. It always discloses it is an AI.
- **Web / enterprise platform:** multi-tenant web apps; no AI decisions at this layer.

## 2. Core rules (the AUP in four lines)

1. **AI recommends, humans decide.** Never let the AI's output be the final action for a
   person without human review (DPIA DSRA-26).
2. **Disclose AI.** Any AI interaction with a person - call, chat, email, screening - is
   disclosed clearly (EU AI Act Art 50, AUP 4).
3. **Protect data.** Never put credentials, secrets, special-category personal data, or
   children's data into an LLM without approval (AUP 2). Candidate/customer data is never
   used to train models.
4. **Test before you trust.** Models/prompts pass the eval + bias gates before promotion
   (DSRA-5, DSRA-29). If something looks biased or wrong, raise it.

## 3. Limits of the AI we use

- AI can hallucinate, misread a resume, or produce an unjustified flag. Treat outputs as
  aids, not ground truth - the human reviewer is the quality control.
- AI does not understand context or intent; it is pattern-matching. Never assume it is
  always right.
- Results can be sensitive to prompt wording and model version - that is why prompts and
  models are versioned and why we re-run bias tests on change.

## 4. Your responsibilities

- **Everyone:** know what the AI you operate does and its limits; follow the AUP; report
  anything that looks wrong (bias, wrong disclosure, data leak) to the AI Governance
  Officer and CEO immediately (incident process - DSRA-25 G17).
- **People who operate screening:** keep the human-in-the-loop gate on; record review
  decisions; escalate `needs_review` and any flagged candidate to a human before acting.
- **People who make/receive AI calls:** always disclose AI; honour opt-outs immediately.
- **Builders/QA:** include evals + bias tests in the gate; never bypass them; keep audit
  logs on.

## 5. If you see a problem

Report to the AI Governance Officer (b170f5ca) and CEO: suspected bias, disclosure
failure, data breach, prompt injection, or model malfunction. We log and investigate - no
blame, no silent fixes. (Incident management process in the gap register, DSRA-25 G17.)

## 6. Where the rules live

- AI Acceptable Use Policy - ai-acceptable-use-policy.md (DSRA-25)
- DPIA - ai-dpia-hr-screening.md (DSRA-26)
- Bias protocol - ai-bias-testing-protocol.md (DSRA-29)
- Candidate notice - ai-candidate-notice.md (DSRA-27)
- Records of processing - ai-gdpr-ropa.md (DSRA-30)

## Rollout & completion tracking

1. CEO to confirm audience (all agents/staff) and that completion is tracked
   (ISO 42001 7.2 records).
2. AI Governance Officer to re-run the brief on material change (model, product,
   regulation) and at least annually.
3. Record completions with date + reviewer; keep in the governance folder.

## Versioning

v1 - 2026-08-07 draft. Review with CEO before rollout.
