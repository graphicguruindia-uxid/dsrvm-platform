# HR Matching, Ranking & Communication Automation — Design

**Date:** 2026-10-06 | **Status:** Approved (owner review of this file pending)
**Scope:** `packages/hr` domain + `apps/hr-automation` HTTP surface
**Decisions taken:** layered ranking (deterministic default, explicit LLM compare);
  transport-first comms (SMTP now, API providers later); drafts UX deferred.

## 1. Context

Screening scores each candidate in isolation (0–100 + recommendation). Nothing
compares candidates against each other or against role requirements as a set:
`CandidateComparison` exists in `types.ts` but is referenced nowhere. The
outbox carries lifecycle events only (`created`, `acknowledged`, `approved`,
`rejected`); email content is never composed in-domain and delivery happens via
an external webhook transport. No interview, invite, reminder, or nudge events
exist.

Bias infrastructure (bias gate, cohorts, AI transparency notice, disputes) is
the constraint: ranking is where disparate impact hides, so every comparative
output must be explainable and audited.

## 2. Deterministic ranking (default path)

New module `packages/hr/src/ranking.ts` — pure functions, no LLM.

- `rankCandidates(role, candidates, weights = { screening: 0.7, scorecard: 0.3 })`
  blends screening score with scorecard overall average. Candidates without
  scorecards rank on screening alone with `unscored: true`.
- Eligibility: `pending_review` and `approved` rank. Rejected, unscreened, and
  disputed candidates are returned separately with `excluded` reasons — never
  silent in either direction.
- Output extends `CandidateComparison` with `rank`, `blendedScore`, and
  `breakdown: { screening, scorecard | null, weights }`. Ties break by earlier
  `screenedAt`.
- `HrService.rankRole(roleId)` + `GET /api/roles/:id/rank`. Unit-tested with
  fixtures; zero inference cost; bias-gate friendly by construction.

## 3. LLM comparative ranking (explicit only)

- `HrService.compareCandidates(roleId, candidateIds[], { reviewer })`: max 10
  candidates, rejects unscreened IDs, audit-logs `candidate.compared` (model +
  prompt version) before returning.
- Never implicit: HTTP route requires an explicit `compare: true` body flag;
  no automatic triggers exist. The deterministic rank is passed as context so
  the model refines rather than invents.
- Versioned `comparison` prompt in the existing `PromptRegistry` (v1: listwise
  ordering + per-candidate rationale referencing role requirements). Each run
  records telemetry usage against the tenant.
- Bias posture v1: audit logging only. Extending the bias gate with comparison
  metrics is an explicit follow-up, not in scope.

## 4. Communication automation (transport abstraction, SMTP first)

- **Templates**: versioned registry mirroring `PromptRegistry` —
  `interview.invite.v1`, `shortlist.notice.v1`, `rejection.notice.v1` — with
  declared merge fields (candidate, role, rank, score, reviewer, company,
  slot). Pure rendering, unit-tested. Templates carry the AI-notice reference
  by default.
- **Triggers**: explicit service calls only, never automatic.
  `inviteToInterview(candidateId, { slots, location, actor })` and
  `sendCandidateEmail({ candidateId, template, fields, actor })` validate
  state (e.g. no invites for rejected candidates), render, and enqueue
  `communication.queued` outbox events.
- **Transport**: `CommunicationTransport { send(message): Promise<Receipt> }`.
  `SmtpTransport` via **nodemailer** (new dependency; raw `node:net` SMTP
  would mean owning TLS quirks). API providers later are new `Transport`
  implementations with no changes to triggers or templates. The existing
  lease-claim outbox dispatcher delivers with retry; failures release the
  claim and audit-log.
- **Interview invites (v1, minimal)**: candidate, role, proposed slots,
  location, status `invited → accepted | declined | cancelled`, single-use
  accept token (sha256-hashed at rest, mirroring the web invite pattern).
  No calendar integration, no full scheduling.
- HTTP: `POST /api/candidates/:id/invite`, `POST /api/communications/send`,
  `GET /api/communications[?candidateId=]`.

## 5. Compliance gating + persistence

- `aiComplianceMode: strict` forces draft mode (`communication.draft` +
  explicit recruiter release). `standard` auto-sends invites but keeps
  rejections as drafts. `off` auto-sends everything. Uses existing
  `TenantSettings` — no new config surface.
- Persistence: `communication_messages` + `interview_invites` tables via the
  hr drizzle runner (new migration file), in-memory store parity, pg-store
  mappers. Audit events for queued/sent/failed/released.

## 6. Additional approved scope (2026-10-06 review)

### 6a. AI-generated document detection

Uploaded resumes/documents carry no provenance signal today (`ingest/resume.ts`
is deterministic text extraction + PII detection only). New
`packages/hr/src/ai-detection.ts`: an LLM classifier over the existing
gateway using structured output (`{ aiLikelihood: 0-100, signals: string[] }`)
via a versioned `ai-detection` prompt in `PromptRegistry`.

- Runs at ingest/screening time alongside PII detection; result stored on the
  candidate enrichment record, surfaced as a flag in ranking breakdowns and
  the ATS scorecard panel (§6b).
- **Flag only, never auto-reject**: a high likelihood score routes to
  `needs_review` with the signals attached; it must not change a
  recommendation on its own. Human decides, per the AI-notice posture.
- Audit-logged (`candidate.ai_screen` action) with model + prompt version;
  telemetry-tracked like comparison runs.

### 6b. ATS scorecard in Candidate view and Compare view

- **Candidate detail view** gains an "ATS Scorecard" panel: screening score +
  recommendation + strengths/flags, blended rank position (once §2 ships),
  scorecard-average from reviewers, and the AI-detection flag (§6a).
- **Compare view** switches from client-side screening-score sort to the
  server `GET /api/roles/:id/rank` feed (§2), adding per-candidate columns
  for rank, blended score, scorecard average, recommendation, and AI-detection
  flag. LLM rationales (§3) render inline when a comparison run exists.
- **Role title, not role ID**: resolve every rendered role reference through
  the existing role map with title display and ID fallback
  (`dashboard.ts` currently renders bare `roleId` in at least two views).
  Candidate API payloads include `roleTitle` alongside `roleId` so views never
  resolve IDs client-side.

## 7. Explicitly out of scope (follow-ups)

- Calendar integration and full interview scheduling.
- ATS/CRM write-back (separate connector workstream).
- Bias-gate metric extensions for comparison outputs.
- Recruiter review/draft UX (deferred until compliance requires it).

## 8. Verification plan

- Deterministic ranking: fixture unit tests (blends, flags, exclusions, ties).
- LLM compare: fake-provider tests (cap, guards, audit event, rationale shape).
- Templates: render tests incl. AI-notice presence; state guards (rejected →
  no invite).
- Transport: stub-transport dispatch tests (retry/release/audit); nodemailer
  SMTP impl covered by construction tests, no live server in CI.
- HTTP: fastify.inject tests per new route incl. 403/404/409 paths.
- AI detection: fake-provider classification tests (flag-only, no
  recommendation change, audit event); dashboard: scorecard panel render,
  compare-view server feed, role-title resolution with ID fallback.
- Gates: `pnpm build`, `typecheck`, `lint`, `test`, `qa:smoke` extended with
  rank/compare/invite/send checks.
