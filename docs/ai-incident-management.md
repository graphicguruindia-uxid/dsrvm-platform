# AI incident management process

Version: Draft v1 | Date: 2026-08-07 | Owner: AI Governance Officer (b170f5ca)
Linked: DSRA-35 (deliverable), DSRA-25 (G17), DSRA-20, DSRA-29 (bias protocol), DSRA-26 (DPIA), DSRA-30 (ROPA)
Status: Draft - apply on adoption; review with CEO
Alignment: EU AI Act Art 72 (post-market monitoring, supporting), ISO/IEC 42001 8.5, GDPR Art 33/34 (breach notification), AUP Section 9

## 1. Purpose & scope

Defines how DSRVM detects, contains, investigates, and remediates incidents involving its
AI systems (HR screening, recruiting, cold-calling/outreach, and AI-assisted web/agents).
Referenced by the AUP (Section 9) and AI literacy brief (Section 5) - this makes those
"report to AI Governance" obligations actionable.

## 2. Incident types

| ID | Type | Example |
|---|---|---|
| IT-1 | Bias / disparate-impact event | Screening scores differ materially across protected groups; discrimination complaint; bias-test FAIL (DSRA-29) |
| IT-2 | Data breach / loss | Candidate/customer PII exposed, leaked, or accessed without authorisation |
| IT-3 | Disclosure failure | AI interaction not disclosed (call, chat, email, screening) contrary to Art 50 / AUP |
| IT-4 | Prompt injection | Untrusted content manipulates the model to leak data or take wrong action |
| IT-5 | Model malfunction / hallucination harm | Wrong recommendation with material consequence; wrong screening action dispatched |
| IT-6 | Regulatory / legal request | Complaint, SAR, ICO/DPA enquiry, regulator notice involving an AI system |
| IT-7 | Vendor/provider incident | Model provider breach/outage affecting DSRVM processing |

## 3. Severity levels

| Level | Definition | Examples | Escalation |
|---|---|---|---|
| S1 Critical | Actual or likely significant harm to an individual; legal/regulatory breach; breach requiring ICO notification (GDPR Art 33) | PII exposure at scale, discrimination with material impact, undisclosed AI in live service | AI Gov + CEO immediately; ICO within 72h where applicable; consider service pause |
| S2 High | Likely harm to an individual or clear compliance gap, no proof of material impact yet | Bias-test FAIL pre-release, disclosure failure in a live interaction, isolated data exposure | AI Gov + CEO same day; pause affected model/prompt |
| S3 Medium | Non-harmful but rule-breaking or concerning behaviour | Hallucination in internal analysis, single opt-out not honoured, telemetry gap | AI Gov within 1 business day; fix + log |
| S4 Low | Observation/practice improvement, no impact | Prompt drift, eval warning, documentation gap | Log + review at monthly governance check |

## 4. Response flow

1. **Detect & report** - anyone who spots an incident (agents, staff, clients, candidates)
   reports to the AI Governance Officer and CEO. No blame, no silent fixes (literacy brief
   Section 5). Record in the incident register (Section 6).
2. **Triage (same day, S1/S2)** - AI Gov classifies type + severity; CEO informed; for S1,
   CEO + AI Gov convene response.
3. **Containment** - depending on type:
   - Model/prompt issue: revert to last-known-good prompt/model version; hold promotions
     (eval + bias gates re-run - DSRA-29).
   - Data exposure: disable affected endpoints/secrets, notify processor(s), preserve
     evidence (audit events).
   - Disclosure failure: stop the affected surface; re-enable only with disclosure present.
   - Vendor incident: request provider detail; check our no-training/ZDR posture (DSRA-25
     vendor register).
4. **Investigation** - root cause from audit log (`audit_events`), telemetry (model/prompt
   version per task - DSRA-8), and reviewer records. Document findings + timeline.
5. **Remediation** - fix root cause; implement guardrail; re-run eval + bias suite before
   re-promotion; update the AUP/DPIA/gap register if it reveals a gap.
6. **Notification** - GDPR Art 33/34: notify ICO (within 72h of awareness for personal-data
   breach with risk to individuals) and affected individuals where required. EU AI Act:
   report serious incidents per provider/deployer duties; support Art 72 monitoring.
7. **Post-incident review** - lessons learned, process/policy updates, register closed out.
   For bias incidents, full bias-suite re-run + documentation (DSRA-29 cadence).

## 5. Roles

- **Reporter:** any agent/staff/client - report immediately, keep evidence.
- **AI Governance Officer:** owns register + triage + remediation coordination + regulator
  notifications (with CEO).
- **CEO:** final escalation authority; approves service pauses and external notifications.
- **CTO:** containment + technical root cause + eval/bias re-run + re-promotion decision.
- **QA (when active):** independent verification of fixes and regression.

## 6. Incident register template

| ID | Date | Type | Severity | Summary | Containment | Root cause | Remediation | Notified (ICO/client) | Status | Owner |
|---|---|---|---|---|---|---|---|---|---|---|
| AI-2026-001 |  |  |  |  |  |  |  |  | open |  |

Store as a CSV/markdown file in the governance folder; review monthly. S1/S2 must also be
recorded in the ROPA (DSRA-30) incident notes.

## 7. KPI & review

- Time-to-triage for S1/S2: same day. Time-to-ICO-notification: within 72h.
- Monthly incident review (part of the ISO 42001 9.1 monitoring cadence - DSRA-25 G15).
- Annual refresh of this process or on material change.

## Versioning

v1 - 2026-08-07 draft. Review with CEO before adoption; next review: 2026-09-01 or on change.
