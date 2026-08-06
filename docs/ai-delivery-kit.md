# DSRVM AI Delivery Kit v0

Owner: CTO (0a60ddf9) | Status: v0.2.0 | Date: 2026-08-04
Linked: DSRA-5, M1.2 of `tech-roadmap.md`

## Purpose

The reusable AI foundation every client engagement and product uses. Keeps LLM
engineering disciplined: provider-agnostic calls, structured outputs, prompt
versioning, and a regression eval harness.

## Modules (in `packages/ai`)

| Module | File | What it does |
|---|---|---|
| Gateway | `src/gateway.ts` | `createGateway(providers)` - routing, active provider switch, per-call timeout, retries with backoff, `preferProvider` override |
| Provider abstraction | `src/provider.ts` | `LlmProvider` interface (`complete(request, signal)`) |
| Anthropic provider | `src/providers/anthropic.ts` | `/v1/messages`, `ANTHROPIC_API_KEY`, JSON-mode via system instruction |
| OpenAI provider | `src/providers/openai.ts` | `/v1/chat/completions`, `OPENAI_API_KEY`, native `response_format` (json + json_schema) |
| Fake provider | `src/providers/fake.ts` | deterministic echo/fixed output for tests and local dev |
| Structured output | `src/structured.ts` | `generateStructured` - JSON schema-typed extraction with retry-on-invalid; `tryParseJson` (tolerates fences), `validateJson` |
| Prompt versioning | `src/prompts.ts` | `definePrompt` / `renderPrompt` (guards missing vars) / `PromptRegistry` (latest or pinned version) |
| Eval harness | `src/evals.ts` | `runEvals` - per-case asserts (`contains`, `not_contains`, `exact`, `json_schema`), pass/fail summary, duration |

## Usage

```ts
import {
  createGateway,
  createAnthropicProvider,
  createFakeProvider,
  generateStructured,
  runEvals,
} from "@dsrvm/ai";

// Prefer the real provider; fall back to a fake in tests.
const gateway = createGateway(
  [createAnthropicProvider(), createFakeProvider({ name: "fake" })],
  { activeProvider: process.env.LLM_PROVIDER ?? "anthropic" },
);

const reply = await gateway.complete({
  messages: [{ role: "user", content: "Summarise this JD" }],
  model: "claude-sonnet-4-5",
});

// Structured extraction (candidate screening example)
const { data } = await generateStructured<{ score: number; reasons: string[] }>(
  gateway,
  [{ role: "user", content: "Score this candidate" }],
  {
    type: "object",
    properties: {
      score: { type: "number" },
      reasons: { type: "array", items: { type: "string" } },
    },
    required: ["score", "reasons"],
  },
);

// Regression evals
const summary = await runEvals(gateway, [
  {
    id: "screen-001",
    request: { messages: [{ role: "user", content: "..." }] },
    asserts: [{ kind: "contains", value: "qualified" }],
  },
]);
```

## Configuration

| Env var | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic provider credential |
| `OPENAI_API_KEY` | OpenAI provider credential |
| `LLM_PROVIDER` | Default active provider name (app code) |

## Definition of Done

- Every task that calls an LLM is covered by an eval case in the harness.
- Structured output uses a schema with a required-field list; no free-text parsing
  in product code.
- Prompts are registered and versioned; changing a prompt bumps the version and
  adds a regression eval.

## Next (follow-ups)

- Wire usage/cost capture (tokens already returned in `CompletionResponse.usage`)
  into telemetry (DSRA-8).
- Model evals per client engagement as the first paying implementation lands.
