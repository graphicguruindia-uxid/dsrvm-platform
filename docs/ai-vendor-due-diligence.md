# DSRVM Ltd - AI Vendor Due Diligence Register

Owner: AI Governance Officer (b170f5ca) | Status: Baseline v1 | Date: 2026-08-07
Linked: DSRA-20, DSRA-25 | Method: desktop review of provider ToS/privacy positions as of
2026-08-07, mapped to DSRVM data-handling needs. Legal review to follow before production.

## What we are checking

For each provider that can receive DSRVM data, verify: (1) does the provider claim
ownership of customer/proprietary input data; (2) how is input/output data used (training?
retention?); (3) is there a DPA/SCC path; (4) do they meet EU AI Act + GDPR/DPDP baseline;
(5) does the provider's data use align with DSRVM's AUP (Section 2/7).

## Assessment scale

- **Green:** no training on customer data by default, no data ownership claim, DPA/SCC
  available, documented retention.
- **Amber:** uses data for product improvement/training by default or ambiguous; needs
  explicit opt-out / contract amendment / caution before customer PII.
- **Red:** claims broad rights in inputs, no DPA path, or conflicting with AUP - do not
  use for customer/candidate data.

## Register

### 1. OpenAI (GPT models) - Amber/Green (config-dependent)
- **Data ownership:** OpenAI does not claim ownership of customer inputs/outputs; assigns
  all rights to the customer ("Your Content" clause in API terms).
- **Data use for training:** By default, OpenAI does NOT train on API/customer content.
  (Training uses their own datasets, not API customer data.) Zero Data Retention (ZDR) is
  available via API as an opt-in for additional privacy assurance.
- **DPA/SCC:** Standard DPA offered; supports SCCs; EU/UK GDPR alignment. Security
  assessments (SOC 2) published.
- **Action for DSRVM:** Use API terms (not ChatGPT consumer terms) for any customer data;
  enable ZDR for candidate PII processing; execute DPA before production. Do not use
  consumer/ChatGPT accounts for DSRVM work data (AUP 3.2.4).

### 2. Anthropic (Claude models) - Amber/Green (config-dependent)
- **Data ownership:** Anthropic does not claim ownership of user content; customer
  retains rights to inputs/outputs.
- **Data use for training:** Anthropic does NOT train on API customer prompts by default
  (API traffic is not used for training). Consumer products may use data differently -
  keep DSRVM work on API products.
- **DPA/SCC:** DPA available with SCCs; SOC 2; EU AI Act "GPAI" obligations under
  Chapter V are being implemented.
- **Action for DSRVM:** Prefer Anthropic API for production screening; execute DPA;
  confirm no-training clause in writing; avoid consumer product for DSRVM data.

### 3. Google (Gemini / Vertex AI) - Amber
- **Data ownership:** Google Cloud terms give customer ownership of customer data; no
  claim over customer's data.
- **Data use for training:** Google Cloud AI/Vertex does not use customer data to train
  base models by default (unless explicitly enabled). Some AI-assisted products have
  different terms - keep to Vertex/Cloud APIs for DSRVM work data.
- **DPA/SCC:** Standard Cloud DPA + SCCs; strong compliance documentation.
- **Action for DSRVM:** Use Google Cloud (Vertex) path if chosen; verify per-product data
  processing terms; execute Cloud DPA.

### 4. Ollama (local, open-source) - Green
- **Data ownership:** No claim; models run locally, nothing leaves DSRVM infrastructure.
- **Data use:** No training; no retention; no third-party access. Ideal for sensitive or
  PII workloads where third-party submission must be avoided (AUP 2.3).
- **DPA/SCC:** N/A (no external processing).
- **Action for DSRVM:** Prefer Ollama/local for PII-heavy or confidential workloads; it is
  the zero-trust option and matches DSRVM's open-source-first posture (CTO AGENTS.md).

### 5. opencode (coding agent / this agent platform) - Amber
- **Data ownership / processing:** opencode is the agent runtime under which DSRVM agents
  operate; it invokes configured models (opencode/big-pickle etc.) and may send
  prompts/context to model providers. Data handling follows the configured model provider's
  terms plus the opencode platform's own privacy policy. Needs a ToS/privacy review as a
  platform.
- **Action for DSRVM:** Review opencode ToS/privacy (and its listed model providers)
  against AUP 2/7; ensure DSRVM secrets stay out of prompts (AUP 2.2.1); confirm no
  training on DSRVM agent data without consent. (Role per DSRA-20: review Paperclip,
  opencode, ollama, llmstudio terms.)

### 6. llmstudio (LM Studio, local) - Green
- **Data ownership:** Local inference tool; models run on DSRVM machines; no cloud data
  exfiltration by default.
- **Data use:** No training/retention on DSRVM data; local by design.
- **Action for DSRVM:** Suitable for local model experimentation; confirm any update-check
  telemetry does not transmit prompts.

### 7. Paperclip (platform) - Amber
- **Data ownership/processing:** Paperclip is the coordination platform (boards, issues,
  run logs) - stores company issue/comment/run data. Its ToS was flagged in DSRA-20 as a
  review item (does it claim ownership of proprietary input data?). Review Paperclip
  ToS/privacy for data-ownership and retention terms relative to company proprietary data.

## Consolidated findings

| Provider | Data ownership claim on inputs | Training on customer data (default) | DPA/SCC path | Risk to DSRVM data | Recommendation |
|---|---|---|---|---|---|
| OpenAI (API) | No | No | Yes | Low | Use API + ZDR + DPA for PII |
| Anthropic (API) | No | No | Yes | Low | Prefer for screening; DPA |
| Google Cloud/Vertex | No | No | Yes | Low-Med | DPA; per-product check |
| Ollama | No | No | N/A | None | Prefer for sensitive PII |
| opencode | TBD - review | TBD | TBD | Med | ToS review; secret hygiene |
| LM Studio | No | No | N/A | None | Fine for local work |
| Paperclip | TBD - review | TBD | TBD | Med | ToS review (DSRA-20 remit) |

## Open actions

1. Execute DPAs/SCCs with OpenAI/Anthropic (and Google if adopted) before production.
2. Obtain written confirmation (or contract clause) that customer/candidate data is not
   used for model training (AUP 2/7, gap G18).
3. Formal ToS/privacy review of opencode + Paperclip (data ownership of proprietary input)
   as standing DSRA-20 remit items; log conclusions here.
4. Re-review this register on provider ToS change and at least annually.

## Change control

Baseline v1 - 2026-08-07. Next review: 2026-11-01 or on any provider ToS/privacy change.
