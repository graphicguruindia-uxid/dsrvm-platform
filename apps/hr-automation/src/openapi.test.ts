import { describe, expect, it } from "vitest";
import { HR_OPENAPI_SPEC } from "./openapi.js";

describe("HR OpenAPI spec", () => {
  it("documents GET /api/roles/{id}/rank with RoleRank schemas", () => {
    const spec = HR_OPENAPI_SPEC as unknown as {
      paths: Record<
        string,
        {
          get?: {
            operationId?: string;
            responses?: Record<string, unknown>;
          };
        }
      >;
      components: { schemas: Record<string, unknown> };
    };
    const rankPath = spec.paths["/api/roles/{id}/rank"];
    expect(rankPath?.get?.operationId).toBe("rankRole");
    expect(rankPath?.get?.responses?.["200"]).toBeDefined();
    expect(rankPath?.get?.responses?.["404"]).toBeDefined();
    expect(spec.components.schemas.RoleRank).toBeDefined();
    expect(spec.components.schemas.RankedCandidate).toBeDefined();
  });
});
