# Bias & disparate-impact testing protocol for screening evals

Version: Draft v1 | Date: 2026-08-07 | Owner: AI Governance Officer (b170f5ca)
Linked: DSRA-29 (deliverable), DSRA-25 (G7), DSRA-26 (DPIA control R1), DSRA-5 (eval harness), DSRA-20
Status: Draft - implementation-ready spec for CTO to build into @dsrvm/ai eval harness
Compliance: EU AI Act Art 10/Annex III, GDPR Art 22/35, EEOC, NYC LL144, Colorado AI Act, ISO/IEC 42001 8.3

## 1. Objective

Ensure the HR screening model does not produce disparate outcomes across protected groups
before it scales. This protocol defines what DSRVM tests, how, what "pass" means, and what
happens on failure. It extends the existing eval harness (`@dsrvm/ai`) which already gates
prompt/model changes - bias checks become part of that gate.

## 2. Scope

- **In scope:** AI screening recommendations (`ScreeningResult.score`, `recommendation`),
  for HR automation (DSRA-6/10) and the recruiting platform (DSRA-22). Cold-calling
  scripts (DSRA-23) are content, not decisions - reviewed for tone by policy (AUP), not by
  this protocol, though the same framework can be reused if they ever auto-qualify leads.
- **Out of scope:** marketing, web, telemetry packages (no decisions on individuals).

## 3. Definitions

- **Protected group:** candidates sharing a protected characteristic (age, sex, ethnicity,
  disability, religion, etc.). DSRVM does NOT collect these directly; we use **synthetic
  cohorts** (Section 4) and **proxy/aggregate analysis** on real data without storing
  protected attributes (privacy-preserving: no special-category data collection, per AUP 2).
- **Metric:** a quantitative measure of outcome parity between protected groups.
- **Trigger:** a metric value at or beyond the failure threshold that mandates action.

## 4. Synthetic cohort construction

1. Build N=1000+ synthetic candidate profiles per role, balanced across protected groups
   (paired cohorts: identical skills, differing only by protected-characteristic signal in
   the synthetic resume text where relevant, plus varied skills).
2. Cohorts must include realistic edge cases: name/email/nationality variety, education
   from different countries, employment gaps, non-traditional career paths, disability
   accommodations mentions (workplace example: remote-first preference).
3. Ground truth: an agreed "golden" label per profile (advance/reject) set by reviewers,
   not by the model under test.
4. Version and store cohorts in the eval harness (git-versioned fixtures) so runs are
   reproducible and diffable.

## 5. Metrics to compute (per role, per model/prompt version)

For each protected-group pair (e.g., cohort A vs cohort B):

1. **Recommendation parity:** share of `advance` per group. Flag if groups differ.
2. **Score distribution:** mean/median score per group + distribution (histogram/ECDF).
3. **4/5ths rule (EEOC):** selection ratio of the lower group vs higher group; flag if
   < 0.8 (i.e., lower group selected < 80% as often).
4. **Statistical test:** two-sample test on scores (e.g., Mann-Whitney U) and
   proportion test on advance rates; report p-values. Note: significance is a signal, not
   a verdict - combine with effect size.
5. **Effect size:** standardized mean difference (Cohen's d) on scores; flag |d| >= 0.2
   (small-but-real) for review.

## 6. Pass/fail thresholds & action triggers

| Level | Trigger | Action |
|---|---|---|
| PASS | 4/5ths >= 0.9 AND no significant difference AND |d| < 0.1 | Ship normally. Record run in eval report. |
| WATCH | 4/5ths 0.8-0.9 OR |d| 0.1-0.2 OR significant test | Do NOT ship silently. Investigate cohort/prompt; log finding; decide: fix prompt, add guardrail, or document accepted risk with human-review note; re-run before ship. |
| FAIL | 4/5ths < 0.8 OR |d| >= 0.2 OR recurring WATCH across cohorts | Halt promotion. Escalate to AI Governance Officer + CTO. Do not deploy this model/prompt version to screening. Remediation required (prompt fix, dataset fix, re-train, or documented rationale + mitigations reviewed by human). |

Every run is recorded (model, prompt version, cohorts, metrics, decision, reviewer note) to
the eval report and the audit log - evidence for EU AI Act / EEOC / auditor.

## 7. Cadence & triggers for re-run

Run bias suite:
1. On any model change (provider/model version).
2. On any production prompt change (PromptRegistry bump).
3. On any screening logic change (score/rec weighting, thresholds).
4. On intake change that alters candidate population (new ingest source, new client
   vertical).
5. Scheduled: at least quarterly against real-data aggregates.
6. Post-incident: any bias complaint or dispute triggers full re-run + investigation.

## 8. Human-review requirement

- Bias failures or WATCH findings must be reviewed by a human (AI Gov + CTO) with a
  documented note in the audit trail.
- Final decisions on candidates remain human (per DPIA DSRA-26) - this protocol ensures the
  *recommendation* layer is fair, but never replaces the reviewer gate.

## 9. Implementation notes for CTO

- Add to `@dsrvm/ai` eval harness: cohort fixtures, metric functions, threshold config,
  report output (JSON + markdown), and a `bias` gate command wired into the CI/pre-promote
  step (same hook as existing eval gates).
- Telemetry (`@dsrvm/telemetry`) can surface per-task model version for post-hoc auditing.
- Keep protected-attribute handling synthetic-only; never store real candidates' protected
  data (AUP 2.2).

## 10. Failure of oversight

If bias testing cannot be implemented before scaling the recruiting platform (DSRA-22),
treat it as a release gate for that product per DPIA (DSRA-26): do not take external
clients to production-scale screening without it.

## Versioning

v1 - 2026-08-07 draft. Review with CTO on resume before implementation.
