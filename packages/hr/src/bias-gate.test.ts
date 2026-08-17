import { describe, expect, it } from "vitest";
import { createGateway, createFakeProvider } from "@dsrvm/ai";
import { createScreeningEngine } from "./screening.js";
import { runBiasGate } from "./bias-gate.js";
import { buildSyntheticCohorts } from "./bias-cohorts.js";

describe("bias gate", () => {
  it("builds synthetic cohorts with balanced protected groups", () => {
    const cohorts = buildSyntheticCohorts();
    expect(cohorts).toHaveLength(1);
    const groups = cohorts[0]!.groups;
    expect(groups.length).toBeGreaterThanOrEqual(3);
    for (const group of groups) {
      const count = cohorts[0]!.profiles.filter(
        (p) => p.group === group,
      ).length;
      expect(count).toBeGreaterThan(0);
    }
  });

  it("runs a full gate with the fake provider and reports a level", async () => {
    const gateway = createGateway([
      createFakeProvider({
        name: "fake",
        echo: false,
        output: JSON.stringify({
          score: 72,
          recommendation: "advance",
          summary: "Matches the role.",
          strengths: ["TypeScript"],
          flags: [],
        }),
      }),
    ]);
    const engine = createScreeningEngine(gateway);
    const result = await runBiasGate(engine, { sampleLimit: 40 });
    expect(result.screened).toBeGreaterThan(0);
    expect(["PASS", "WATCH", "FAIL"]).toContain(result.level);
    expect(result.metrics.length).toBeGreaterThanOrEqual(3);
  });
});
