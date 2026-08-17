import { describe, expect, it } from "vitest";
import {
  assessBiasSuite,
  effectSize,
  mannWhitneyU,
  renderBiasReportMarkdown,
} from "./bias.js";
import type { BiasScore } from "./bias.js";

function score(
  profileId: string,
  group: string,
  scoreValue: number,
  recommendation: "advance" | "reject" = "advance",
): BiasScore {
  return {
    profileId,
    cohortId: "role-1",
    group,
    score: scoreValue,
    recommendation,
  };
}

describe("assessBiasSuite", () => {
  it("PASS when groups are within thresholds", () => {
    const scores: BiasScore[] = [
      ...Array.from({ length: 50 }, (_, i) =>
        score(`a-${i}`, "A", 70 + (i % 5)),
      ),
      ...Array.from({ length: 50 }, (_, i) =>
        score(`b-${i}`, "B", 70 + (i % 5)),
      ),
    ];
    const result = assessBiasSuite(scores);
    expect(result.level).toBe("PASS");
    expect(result.comparisons).toHaveLength(1);
    expect(result.triggers).toHaveLength(0);
  });

  it("FAIL when selection ratio breaches the 4/5ths rule", () => {
    const scores: BiasScore[] = [
      ...Array.from({ length: 50 }, (_, i) => score(`a-${i}`, "A", 90)),
      ...Array.from({ length: 50 }, (_, i) =>
        score(`b-${i}`, "B", 40, "reject"),
      ),
    ];
    const result = assessBiasSuite(scores);
    expect(result.level).toBe("FAIL");
    expect(result.triggers.some((t) => t.includes("4/5ths rule FAIL"))).toBe(
      true,
    );
  });

  it("FAIL when Cohen's d exceeds the fail threshold", () => {
    const scores: BiasScore[] = [
      ...Array.from({ length: 100 }, (_, i) =>
        score(`a-${i}`, "A", 80 + (i % 7)),
      ),
      ...Array.from({ length: 100 }, (_, i) =>
        score(`b-${i}`, "B", 60 + (i % 7)),
      ),
    ];
    const result = assessBiasSuite(scores);
    expect(result.level).toBe("FAIL");
    expect(result.triggers.some((t) => t.includes("Cohen's d FAIL"))).toBe(
      true,
    );
  });

  it("WATCH when only a mild difference is detected", () => {
    const scores: BiasScore[] = [
      ...Array.from({ length: 100 }, (_, i) => score(`a-${i}`, "A", 75)),
      ...Array.from({ length: 100 }, (_, i) => score(`b-${i}`, "B", 72)),
    ];
    const result = assessBiasSuite(scores);
    expect(["PASS", "WATCH"]).toContain(result.level);
  });

  it("flags a significant difference between groups", () => {
    const scores: BiasScore[] = [
      ...Array.from({ length: 40 }, (_, i) => score(`a-${i}`, "A", 78)),
      ...Array.from({ length: 40 }, (_, i) => score(`b-${i}`, "B", 65)),
    ];
    const result = assessBiasSuite(scores);
    expect(result.triggers.some((t) => t.includes("significant"))).toBe(true);
  });

  it("reports a markdown rendering", () => {
    const scores: BiasScore[] = [
      score("a-1", "A", 70),
      score("a-2", "A", 74),
      score("b-1", "B", 70),
      score("b-2", "B", 74),
    ];
    const report = renderBiasReportMarkdown(assessBiasSuite(scores));
    expect(report).toContain("# Bias & disparate-impact test report");
    expect(report).toContain("| A | 2 |");
    expect(report).toContain("| B | 2 |");
  });
});

describe("statistical helpers", () => {
  it("computes Cohen's d for separated groups", () => {
    const d = effectSize([8, 9, 10, 11, 12], [18, 19, 20, 21, 22]);
    expect(Math.abs(d)).toBeGreaterThan(1);
  });

  it("Mann-Whitney U gives small p for separated groups", () => {
    const { pValue } = mannWhitneyU(
      Array.from({ length: 30 }, () => 50),
      Array.from({ length: 30 }, () => 90),
    );
    expect(pValue).toBeLessThan(0.05);
  });

  it("Mann-Whitney U gives large p for identical groups", () => {
    const { pValue } = mannWhitneyU(
      Array.from({ length: 30 }, (_, i) => i),
      Array.from({ length: 30 }, (_, i) => i),
    );
    expect(pValue).toBeGreaterThan(0.5);
  });
});
