import Fastify, { type FastifyInstance } from "fastify";
import type { HrService } from "@dsrvm/hr";
import type { CandidateIngestor } from "@dsrvm/hr";
import type { TelemetryReport } from "@dsrvm/telemetry";
import { candidateAiNotice, CandidateNoticeNotDisclosedError } from "@dsrvm/hr";
import { dashboardHtml } from "./dashboard.js";

export interface ReviewerTelemetry {
  counter(name: string, by?: number, tags?: Record<string, string>): void;
  report(): TelemetryReport;
}

export interface ReviewerServerOptions {
  telemetry?: ReviewerTelemetry;
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

  server.get("/health", async () => ({ status: "ok" }));

  server.get("/", async (_request, reply) => {
    reply.type("text/html; charset=utf-8");
    return dashboardHtml();
  });

  server.get("/api/roles", async () => ({ roles: await hr.listRoles() }));

  server.post<{
    Body: { title?: string; requirements?: string[]; niceToHave?: string[] };
  }>("/api/roles", async (request, reply) => {
    const { title, requirements, niceToHave } = request.body ?? {};
    if (!title) {
      return reply.code(400).send({ error: "title is required" });
    }
    const role = await hr.createRole({
      title,
      requirements: requirements ?? [],
      niceToHave: niceToHave ?? [],
    });
    return reply.code(201).send({ role });
  });

  server.get<{ Querystring: { status?: string } }>(
    "/api/candidates",
    async (request) => {
      const status = request.query?.status;
      const candidates = await hr.listCandidates(status);
      return { candidates };
    },
  );

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
      return reply
        .code(400)
        .send({ error: "roleId, name, email, resumeText are required" });
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
      return reply.code(404).send({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  server.post<{
    Body: {
      csv?: string;
      email?: string;
      mapping?: Record<string, string>;
      defaultRoleId?: string;
    };
  }>("/api/candidates/import", async (request, reply) => {
    if (!ingestor) {
      return reply.code(404).send({ error: "ingest not configured" });
    }
    const { csv, email, mapping, defaultRoleId } = request.body ?? {};
    const baseIngestor =
      defaultRoleId || ingestor.defaultRoleId
        ? ingestor.withDefaultRoleId(defaultRoleId ?? ingestor.defaultRoleId)
        : ingestor;
    try {
      const result = csv
        ? await baseIngestor.importCsv(csv, { mapping })
        : email
          ? await baseIngestor.importEmail({ raw: email, defaultRoleId })
          : null;
      if (!result) {
        return reply
          .code(400)
          .send({ error: "provide csv or email in the request body" });
      }
      telemetry?.counter("pipeline.candidate.imported", result.imported);
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
    const { id } = request.params;
    const { approved, reviewer, note } = request.body ?? {};
    if (typeof approved !== "boolean") {
      return reply.code(400).send({ error: "approved (boolean) is required" });
    }
    if (!reviewer) {
      return reply.code(400).send({ error: "reviewer is required" });
    }
    try {
      const candidate = await hr.reviewCandidate(id, {
        approved,
        reviewer,
        note: note ?? undefined,
      });
      telemetry?.counter("pipeline.candidate.reviewed", 1, {
        outcome: approved ? "approved" : "rejected",
      });
      return { candidate };
    } catch (error) {
      if (error instanceof CandidateNoticeNotDisclosedError) {
        return reply.code(400).send({
          error: error.message,
        });
      }
      return reply.code(409).send({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  server.post<{
    Params: { id: string };
    Body: { note?: string };
  }>("/api/candidates/:id/dispute", async (request, reply) => {
    try {
      const candidate = await hr.raiseDispute(request.params.id, {
        note: request.body?.note ?? undefined,
      });
      return { candidate };
    } catch (error) {
      return reply.code(404).send({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  server.post<{ Params: { id: string } }>(
    "/api/candidates/:id/dispute/resolve",
    async (request, reply) => {
      try {
        const candidate = await hr.resolveDispute(request.params.id);
        return { candidate };
      } catch (error) {
        return reply.code(409).send({
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

  return { server, hr };
}
