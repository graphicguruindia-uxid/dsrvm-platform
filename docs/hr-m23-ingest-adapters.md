# HR Automation M2.3 — Ingest Adapters

Owner: CTO (0a60ddf9) | Status: Done | Date: 2026-08-04
Linked: DSRA-11 (parent DSRA-6)

## What shipped

`packages/hr` (`@dsrvm/hr` v0.2.0) now has a real candidate-intake layer that
feeds the existing pipeline (`createCandidate -> AI screen -> human review ->
outbox action`). The `CandidateIngestor` adapters normalise and dedupe external
data before it enters the domain, so the pilot can import actual ATS exports,
application emails, and resume files instead of demo seeds.

### 1. ATS / CSV importer (`src/ingest/csv.ts`)
- Dependency-free CSV parser (quoted fields, escaped quotes, `\r\n`).
- Auto header mapping for common ATS columns (`Full Name`, `Email Address`,
  `Resume/CV Text`, `Candidate ID`, `Applicant ID`, …), case-insensitive.
- Explicit `mapping` override for arbitrary column names.
- Row-level error collection (`missing email/name/resume`) with 1-based row
  numbers, so a bad batch never silently drops candidates.

### 2. Email-to-candidate (`src/ingest/email.ts`)
- RFC822-lite parser: `From:` (display name + angle-bracket address), `Subject:`,
  and body separated by a blank line.
- Extracts candidate `name` + `email` from the `From:` header; body becomes the
  resume text (after normalisation); optional `defaultRoleId`.

### 3. Resume text extraction + PII hygiene (`src/ingest/resume.ts`)
- Normalisation: strips HTML tags, markdown syntax and link targets, collapses
  whitespace, trims, truncates to `maxLength` (default 20k chars).
- PII detection returns categories (`email`, `phone`, `national_insurance`,
  `postcode`) so downstream GDPR controls can flag or redact before storage —
  screening still runs on the cleaned text.

### 4. `CandidateIngestor` service (`src/ingest/service.ts`)
- `importCsv(text, {mapping})` and `importEmail({raw, defaultRoleId})` parse +
  create candidates in one call.
- Dedupe by email (case-insensitive) against existing candidates and within the
  batch; skips duplicates, reports `imported/skipped/errors`.
- `withDefaultRoleId()` lets the API layer apply a per-request role.

## API wiring (`apps/hr-automation`)

New endpoint:

```
POST /api/candidates/import
{ "csv": "name,email,resume\nAda,ada@example.com,TypeScript\n...", "defaultRoleId": "..." }
{ "email": "From: Ada <ada@example.com>\nSubject: Application\n\nresume body", "defaultRoleId": "..." }
```

- `201 { result: { parsed, imported, skipped, errors } }`
- `400` when neither `csv` nor `email` is provided.
- Emits `pipeline.candidate.imported` counter for telemetry.

## Verification

- `packages/hr`: 33/33 tests (16 new ingest tests), lint/typecheck/build green.
- `apps/hr-automation`: 11/11 tests (2 new import-endpoint tests).
- Monorepo `turbo run lint typecheck test build`: 40/40 tasks green.
- Live smoke on :3001: health ok, role created, CSV import of 2 candidates
  landed in the pipeline, candidate list = 2.

## Notes / follow-ups

- PDF/docx binary resume extraction is intentionally out of scope for v0
  (text-first); add per-format extractors behind the `extractResumeText` seam.
- Column mapping lives client-side; an ATS-specific preset library
  (Greenhouse/Workable CSV variants) is a cheap follow-up once we see real files.
- PII detection is advisory — wire it to redaction at the store layer in the
  M3.2 GDPR pass.
