import { describe, expect, it } from "vitest";
import type { RoleProfile } from "../types.js";
import { extractCandidateMeta, recommendRoles } from "./candidate-draft.js";

function makeRole(overrides: Partial<RoleProfile> = {}): RoleProfile {
  return {
    id: "role-1",
    title: "Frontend Engineer",
    requirements: ["react", "typescript"],
    niceToHave: ["graphql"],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("extractCandidateMeta", () => {
  it("returns empty extraction for empty text", () => {
    const result = extractCandidateMeta("");
    expect(result.name).toBe("");
    expect(result.email).toBe("");
    expect(result.resumeText).toBe("");
  });

  it("extracts email and name from a resume", () => {
    const result = extractCandidateMeta(
      [
        "Jane Cooper",
        "Senior Engineer",
        "jane.cooper@example.com",
        "+44 7700 900123",
        "Built React SPAs",
      ].join("\n"),
    );
    expect(result.email).toBe("jane.cooper@example.com");
    expect(result.name).toBe("Jane Cooper");
  });

  it("lowercases the email", () => {
    const result = extractCandidateMeta("John Smith\nJOHN.SMITH@Example.COM");
    expect(result.email).toBe("john.smith@example.com");
  });

  it("returns empty name when no plausible name line exists", () => {
    const result = extractCandidateMeta("experience with react and typescript");
    expect(result.name).toBe("");
    expect(result.email).toBe("");
  });

  it("does not treat a line with digits or @ as a name", () => {
    const result = extractCandidateMeta(
      "123 Road Lane\nJane Doe\njane@example.com",
    );
    expect(result.name).toBe("Jane Doe");
    expect(result.email).toBe("jane@example.com");
  });

  it("accepts at most 4 capitalized words as a name", () => {
    const result = extractCandidateMeta(
      "John Michael Paul Jones\nContact: jane@example.com",
    );
    expect(result.name).toBe("John Michael Paul Jones");
  });

  it("strips html/markdown noise before extraction", () => {
    const result = extractCandidateMeta(
      "<h1>Jane Cooper</h1>\n<p>jane@example.com</p>",
    );
    expect(result.name).toBe("Jane Cooper");
    expect(result.email).toBe("jane@example.com");
  });
});

describe("recommendRoles", () => {
  it("returns empty array when no roles are given", () => {
    expect(recommendRoles("react typescript", [])).toEqual([]);
  });

  it("scores requirement matches higher than nice-to-have matches", () => {
    const frontend = makeRole({
      id: "fe",
      title: "Frontend Engineer",
      requirements: ["react", "typescript"],
      niceToHave: ["graphql"],
    });
    const backend = makeRole({
      id: "be",
      title: "Backend Engineer",
      requirements: ["node", "postgres"],
      niceToHave: ["graphql"],
    });
    const results = recommendRoles(
      "We need react and typescript plus graphql",
      [backend, frontend],
    );
    expect(results[0]!.roleId).toBe("fe");
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
  });

  it("returns results sorted by score descending", () => {
    const roles = [
      makeRole({
        id: "a",
        title: "AAA",
        requirements: ["zzz"],
        niceToHave: [],
      }),
      makeRole({
        id: "b",
        title: "BBB",
        requirements: ["react"],
        niceToHave: [],
      }),
      makeRole({
        id: "c",
        title: "CCC",
        requirements: ["react", "typescript"],
        niceToHave: [],
      }),
    ];
    const results = recommendRoles(
      "react and typescript and react typescript react typescript",
      roles,
    );
    const scores = results.map((r) => r.score);
    expect([...scores].sort((x, y) => y - x)).toEqual(scores);
    expect(results[0]!.roleId).toBe("c");
  });

  it("caps score at 100", () => {
    const manyHits = makeRole({
      id: "m",
      title: "React Engineer",
      requirements: [
        "react",
        "react",
        "react",
        "react",
        "react",
        "react",
        "react",
        "react",
        "react",
        "react",
      ],
      niceToHave: [],
    });
    const results = recommendRoles("react", [manyHits]);
    expect(results[0]!.score).toBeLessThanOrEqual(100);
  });

  it("includes reasons for title and requirement matches", () => {
    const role = makeRole({ requirements: ["react"], niceToHave: ["graphql"] });
    const results = recommendRoles("Frontend Engineer react graphql", [role]);
    expect(results[0]!.reasons.length).toBeGreaterThan(0);
    expect(results[0]!.reasons.some((r) => r.includes("react"))).toBe(true);
  });

  it("breaks ties by title alphabetically", () => {
    const b = makeRole({
      id: "b",
      title: "Beta Engineer",
      requirements: [],
      niceToHave: [],
    });
    const a = makeRole({
      id: "a",
      title: "Alpha Engineer",
      requirements: [],
      niceToHave: [],
    });
    const results = recommendRoles("nothing relevant", [b, a]);
    expect(results[0]!.title).toBe("Alpha Engineer");
  });
});
