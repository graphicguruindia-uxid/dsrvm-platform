import Fastify, { type FastifyInstance } from "fastify";
import type { HrService } from "@dsrvm/hr";
import type { CandidateIngestor } from "@dsrvm/hr";
import type { TelemetryReport } from "@dsrvm/telemetry";
import { candidateAiNotice, CandidateNoticeNotDisclosedError } from "@dsrvm/hr";
import { dashboardHtml } from "./dashboard.js";
import { HR_OPENAPI_SPEC } from "./openapi.js";
import { registerAuth } from "./auth.js";

export interface ReviewerTelemetry {
  counter(name: string, by?: number, tags?: Record<string, string>): void;
  report(): TelemetryReport;
}

export interface ReviewerServerOptions {
  telemetry?: ReviewerTelemetry;
  apiToken?: string;
  kvRunbooks?: {
    get(key: string): Promise<string | null>;
  };
}

export interface ReviewerServer {
  server: FastifyInstance;
  hr: HrService;
}

export function buildReviewerServer(
  hr: HrService,
  options: ReviewerServerOptions = {},
  ingestor?: CandidateIngestor,
): ReviewerServer {
  const server = Fastify({ logger: false });
  const telemetry = options.telemetry;

  registerAuth(server, { token: options.apiToken });

  server.get("/health", async () => ({ status: "ok" }));

  server.get("/openapi.json", async () => HR_OPENAPI_SPEC);

  server.get("/", async (_request, reply) => {
    reply.type("text/html; charset=utf-8");
    return dashboardHtml();
  });

  server.get("/api/roles", async () => ({ roles: await hr.listRoles() }));

  server.post<{
    Body: {
      title?: string;
      requirements?: string[];
      niceToHave?: string[];
    };
  }>("/api/roles", async (request, reply) => {
    const { title, requirements, niceToHave } = request.body ?? {};
    if (!title || !requirements?.length) {
      return reply.code(400).send({
        error: "title and at least one requirement are required",
      });
    }
    const role = await hr.createRole({
      title,
      requirements,
      niceToHave,
    });
    return reply.code(201).send({ role });
  });

  server.get<{
    Querystring: { status?: string };
  }>("/api/candidates", async (request) => {
    const statusFilter = request.query.status;
    let candidates = await hr.listCandidates();
    if (statusFilter) {
      candidates = candidates.filter((c) => c.status === statusFilter);
    }
    return { candidates };
  });

  server.post<{
    Body: {
      roleId?: string;
      name?: string;
      email?: string;
      resumeText?: string;
    };
  }>("/api/candidates", async (request, reply) => {
    const { roleId, name, email, resumeText } = request.body ?? {};
    if (!roleId || !name || !email || !resumeText) {
      return reply.code(400).send({
        error: "roleId, name, email, and resumeText are required",
      });
    }
    try {
      const candidate = await hr.createCandidate({
        roleId,
        name,
        email,
        resumeText,
      });
      const screened = await hr.screenCandidate(candidate.id);
      telemetry?.counter("pipeline.candidate.created");
      telemetry?.counter("pipeline.candidate.screened", 1, {
        recommendation: screened.screening?.recommendation ?? "needs_review",
      });
      return reply.code(201).send({
        candidate: screened,
        notice: candidateAiNotice(),
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("role")) {
        return reply.code(404).send({ error: error.message });
      }
      return reply.code(500).send({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  server.post<{
    Body: {
      csv?: string;
      email?: string;
      defaultRoleId?: string;
    };
  }>("/api/candidates/import", async (request, reply) => {
    if (!ingestor) {
      return reply.code(503).send({ error: "Candidate ingest not available" });
    }
    const { csv, email, defaultRoleId } = request.body ?? {};
    if (!csv && !email) {
      return reply.code(400).send({ error: "csv or email field is required" });
    }
    try {
      if (csv) {
        const result = await ingestor
          .withDefaultRoleId(defaultRoleId)
          .importCsv(csv);
        telemetry?.counter("pipeline.candidates.imported_csv", result.imported);
        return reply.code(201).send({ result });
      }
      const result = await ingestor.importEmail({
        raw: email!,
        defaultRoleId,
      });
      telemetry?.counter("pipeline.candidates.imported_email", result.imported);
      return reply.code(201).send({ result });
    } catch (error) {
      return reply.code(500).send({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  server.get<{ Params: { id: string } }>(
    "/api/candidates/:id",
    async (request, reply) => {
      const candidate = await hr.getCandidate(request.params.id);
      if (!candidate) {
        return reply.code(404).send({ error: "candidate not found" });
      }
      return { candidate };
    },
  );

  server.post<{
    Params: { id: string };
    Body: { approved?: boolean; reviewer?: string; note?: string };
  }>("/api/candidates/:id/review", async (request, reply) => {
    const { approved, reviewer, note } = request.body ?? {};
    if (approved === undefined || !reviewer) {
      return reply
        .code(400)
        .send({ error: "approved and reviewer are required" });
    }
    try {
      const candidate = await hr.reviewCandidate(request.params.id, {
        approved,
        reviewer,
        note,
      });
      telemetry?.counter("pipeline.candidate.reviewed", 1, {
        outcome: approved ? "approved" : "rejected",
      });
      return { candidate };
    } catch (error) {
      if (error instanceof CandidateNoticeNotDisclosedError) {
        return reply.code(400).send({ error: error.message });
      }
      if (error instanceof Error && error.message.includes("not found")) {
        return reply.code(409).send({ error: error.message });
      }
      return reply.code(500).send({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  server.get<{ Params: { id: string } }>(
    "/api/candidates/:id/dispute",
    async (request, reply) => {
      const candidate = await hr.getCandidate(request.params.id);
      if (!candidate) {
        return reply.code(404).send({ error: "candidate not found" });
      }
      return { dispute: candidate.dispute ?? null };
    },
  );

  server.post<{
    Params: { id: string };
    Body: { note?: string };
  }>("/api/candidates/:id/dispute", async (request, reply) => {
    try {
      const candidate = await hr.raiseDispute(request.params.id, {
        note: request.body?.note ?? undefined,
      });
      telemetry?.counter("pipeline.candidate.dispute_raised");
      return candidate;
    } catch (error) {
      return reply.code(500).send({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  server.post<{ Params: { id: string } }>(
    "/api/candidates/:id/dispute/resolve",
    async (request, reply) => {
      try {
        const candidate = await hr.resolveDispute(request.params.id);
        telemetry?.counter("pipeline.candidate.dispute_resolved");
        return candidate;
      } catch (error) {
        return reply.code(500).send({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  server.get("/api/audit", async () => ({ events: await hr.auditLog() }));

  server.post("/api/retention/cleanup", async () => ({
    counts: await hr.retentionCleanup(),
  }));

  server.get("/api/telemetry", async () =>
    telemetry ? telemetry.report() : { telemetry: "disabled" },
  );

  if (options.kvRunbooks) {
    server.get<{ Params: { key: string } }>(
      "/api/runbooks/:key",
      async (request, reply) => {
        const content = await options.kvRunbooks!.get(
          `runbook/${request.params.key}`,
        );
        if (!content) {
          return reply.code(404).send({ error: "runbook not found" });
        }
        return reply.type("text/markdown").send(content);
      },
    );
  }

  return { server, hr };
}
