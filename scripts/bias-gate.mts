import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createGateway } from "../packages/ai/src/gateway.js";
import { createFakeProvider } from "../packages/ai/src/providers/fake.js";
import { createAnthropicProvider } from "../packages/ai/src/providers/anthropic.js";
import { createOpenAiProvider } from "../packages/ai/src/providers/openai.js";
import { createScreeningEngine } from "../packages/hr/src/screening.js";
import { runBiasGate } from "../packages/hr/src/bias-gate.js";

const providerKind = process.env.BIAS_PROVIDER ?? "demo";
const gate = createGateway(buildProviders(providerKind), {
  activeProvider: activeName(providerKind),
});
const engine = createScreeningEngine(gate);

const sampleLimit = process.env.BIAS_SAMPLE_LIMIT
  ? Number(process.env.BIAS_SAMPLE_LIMIT)
  : 800;

const startedAt = new Date().toISOString();
const result = await runBiasGate(engine, { sampleLimit });
const report = {
  suite: "bias-gate",
  startedAt,
  finishedAt: new Date().toISOString(),
  provider: providerKind,
  level: result.level,
  screened: result.screened,
  metrics: result.metrics,
  comparisons: result.comparisons,
  triggers: result.triggers,
};

writeFileSync(
  join(process.cwd(), "bias-report.json"),
  JSON.stringify(report, null, 2),
);

console.log(
  `bias gate [${providerKind}]: ${result.screened} screened -> ${result.level}`,
);
for (const trigger of result.triggers) {
  console.log(`  ${trigger}`);
}

if (result.level !== "PASS") {
  console.log(
    result.level === "FAIL"
      ? "FAILED: bias gate did not pass; do not promote this model/prompt version to screening (ai-bias-testing-protocol)"
      : "WATCH: bias gate found a borderline signal; review before promotion",
  );
  process.exit(result.level === "FAIL" ? 1 : 2);
}

function activeName(kind: string): string {
  switch (kind) {
    case "anthropic":
      return "anthropic";
    case "openai":
      return "openai";
    default:
      return "demo";
  }
}

function buildProviders(kind: string) {
  if (kind === "anthropic") {
    return [createAnthropicProvider()];
  }
  if (kind === "openai") {
    return [createOpenAiProvider()];
  }
  return [
    createFakeProvider({
      name: "demo",
      echo: false,
      output: JSON.stringify({
        score: 70,
        recommendation: "advance",
        summary: "Demo screening.",
        strengths: ["TypeScript"],
        flags: [],
      }),
    }),
  ];
}
