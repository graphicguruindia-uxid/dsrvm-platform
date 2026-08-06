import type { LlmGateway } from "./gateway.js";
import { tryParseJson, validateJson } from "./structured.js";
import type { CompletionRequest, JsonSchema } from "./types.js";

export type EvalAssert =
  | { kind: "contains"; value: string }
  | { kind: "not_contains"; value: string }
  | { kind: "exact"; value: string }
  | { kind: "json_schema"; schema: JsonSchema };

export interface EvalCase {
  id: string;
  request: CompletionRequest;
  asserts?: EvalAssert[];
}

export interface EvalCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface EvalCaseResult {
  caseId: string;
  passed: boolean;
  checks: EvalCheck[];
  output: string;
}

export interface EvalSummary {
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  results: EvalCaseResult[];
}

export async function runEvals(
  gateway: LlmGateway,
  cases: readonly EvalCase[],
): Promise<EvalSummary> {
  const started = Date.now();
  const results: EvalCaseResult[] = [];

  for (const evalCase of cases) {
    const checks: EvalCheck[] = [];
    let output = "";
    let passed = true;

    try {
      const response = await gateway.complete(evalCase.request);
      output = response.text;

      const nonEmpty = output.trim().length > 0;
      checks.push({ name: "non_empty", passed: nonEmpty });
      if (!nonEmpty) passed = false;

      for (const assert of evalCase.asserts ?? []) {
        const check = runAssert(assert, output);
        checks.push(check);
        if (!check.passed) passed = false;
      }
    } catch (error) {
      passed = false;
      checks.push({
        name: "no_error",
        passed: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }

    results.push({ caseId: evalCase.id, passed, checks, output });
  }

  const passedCount = results.filter((result) => result.passed).length;
  return {
    total: results.length,
    passed: passedCount,
    failed: results.length - passedCount,
    durationMs: Date.now() - started,
    results,
  };
}

function runAssert(assert: EvalAssert, output: string): EvalCheck {
  switch (assert.kind) {
    case "contains":
      return {
        name: `contains "${assert.value}"`,
        passed: output.includes(assert.value),
      };
    case "not_contains":
      return {
        name: `not_contains "${assert.value}"`,
        passed: !output.includes(assert.value),
      };
    case "exact":
      return {
        name: `exact "${assert.value}"`,
        passed: output.trim() === assert.value,
      };
    case "json_schema": {
      const parsed = tryParseJson(output);
      const ok = parsed !== null && validateJson(parsed, assert.schema);
      return {
        name: "json_schema",
        passed: ok,
        detail: ok ? undefined : "output did not match the json schema",
      };
    }
  }
}
