import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import cors from "@fastify/cors";
import type {
  AiComplianceMode,
  DataResidency,
  HrService,
  PolicyCategory,
  UpdatePolicyInput,
  UserRole,
} from "@dsrvm/hr";
import type { CandidateIngestor } from "@dsrvm/hr";
import type { TelemetryReport } from "@dsrvm/telemetry";
import {
  candidateAiNotice,
  CandidateNoticeNotDisclosedError,
  detectPii,
  extractCandidateMeta,
  normalizeBudgetCurrency,
  recommendRoles,
  tenantContext,
} from "@dsrvm/hr";
import { extractDocumentText } from "./documents.js";
import { dashboardHtml } from "./dashboard.js";
import { HR_OPENAPI_SPEC } from "./openapi.js";
import { registerAuth } from "./auth.js";
import type { OutboxDispatcher } from "@dsrvm/hr";

export interface ReviewerTelemetry {
  counter(name: string, by?: number, tags?: Record<string, string>): void;
  report(): TelemetryReport;
}

export interface ReviewerServerOptions {
  telemetry?: ReviewerTelemetry;
  apiToken?: string;
  dispatcher?: OutboxDispatcher;
  kvRunbooks?: {
    get(key: string): Promise<string | null>;
  };
}

export interface ReviewerServer {
  server: FastifyInstance;
  hr: HrService;
}

function sanitize(str: unknown): string {
  if (typeof str !== "string") return "";
  return str
    .replace(/<[^>]*>/g, "")
    .trim()
    .slice(0, 50000);
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const BUDGET_CURRENCY_ALLOWLIST = ["USD", "EUR", "GBP", "INR"] as const;

interface RoleBody {
  title?: string;
  requirements?: string[];
  niceToHave?: string[];
  skills?: string[] | string;
  experienceMinYears?: unknown;
  experienceMaxYears?: unknown;
  budgetMin?: unknown;
  budgetMax?: unknown;
  budgetCurrency?: unknown;
}

interface NormalizedRoleBody {
  title?: string;
  requirements?: string[];
  niceToHave?: string[];
  skills?: string[];
  experienceMinYears?: number;
  experienceMaxYears?: number;
  budgetMin?: number;
  budgetMax?: number;
  budgetCurrency?: string;
}

function sanitizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(sanitize).filter(Boolean);
}

function normalizeSkillsInput(
  value: unknown,
): { ok: true; value?: string[] } | { ok: false; error: string } {
  if (value === undefined || value === null)
    return { ok: true, value: undefined };
  const raw: string[] = [];
  if (typeof value === "string") {
    raw.push(...value.split(","));
  } else if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") raw.push(...item.split(","));
    }
  } else {
    return {
      ok: false,
      error: "skills must be an array of strings or a comma-separated string",
    };
  }
  const seen = new Set<string>();
  const skills: string[] = [];
  for (const item of raw) {
    const skill = sanitize(item);
    if (!skill) continue;
    const key = skill.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    skills.push(skill);
    if (skills.length >= 30) break;
  }
  return { ok: true, value: skills };
}

function toOptionalInt(
  value: unknown,
): { ok: true; value?: number } | { ok: false } {
  if (value === undefined || value === null)
    return { ok: true, value: undefined };
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 60) return { ok: false };
  return { ok: true, value: n };
}

function toOptionalNumber(
  value: unknown,
): { ok: true; value?: number } | { ok: false } {
  if (value === undefined || value === null)
    return { ok: true, value: undefined };
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return { ok: false };
  return { ok: true, value: n };
}

function redactPii(obj: unknown): unknown {
  if (typeof obj !== "object" || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(redactPii);
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" && /@/.test(v)) {
      result[k] = "***@***";
    } else if (typeof v === "object" && v !== null) {
      result[k] = redactPii(v);
    } else {
      result[k] = v;
    }
  }
  return result;
}

export async function buildReviewerServer(
  hr: HrService,
  options: ReviewerServerOptions = {},
  ingestor?: CandidateIngestor,
): Promise<ReviewerServer> {
  const server = Fastify({ logger: false });
  const telemetry = options.telemetry;

  const parseRoleBody = (
    body: RoleBody | undefined,
  ): { ok: true; value: NormalizedRoleBody } | { ok: false; error: string } => {
    const source = body ?? {};
    const title =
      source.title === undefined ? undefined : sanitize(source.title);
    const requirements =
      source.requirements === undefined
        ? undefined
        : sanitizeList(source.requirements);
    const niceToHave =
      source.niceToHave === undefined
        ? undefined
        : sanitizeList(source.niceToHave);
    const skills = normalizeSkillsInput(source.skills);
    if (skills.ok === false) return skills;
    const experienceMinYears = toOptionalInt(source.experienceMinYears);
    if (!experienceMinYears.ok) {
      return {
        ok: false,
        error: "experienceMinYears must be an integer between 0 and 60",
      };
    }
    const experienceMaxYears = toOptionalInt(source.experienceMaxYears);
    if (!experienceMaxYears.ok) {
      return {
        ok: false,
        error: "experienceMaxYears must be an integer between 0 and 60",
      };
    }
    const budgetMin = toOptionalNumber(source.budgetMin);
    if (!budgetMin.ok) {
      return {
        ok: false,
        error: "budgetMin must be a non-negative number",
      };
    }
    const budgetMax = toOptionalNumber(source.budgetMax);
    if (!budgetMax.ok) {
      return {
        ok: false,
        error: "budgetMax must be a non-negative number",
      };
    }
    const currency =
      source.budgetCurrency === undefined
        ? undefined
        : normalizeBudgetCurrency(source.budgetCurrency);
    if (currency !== undefined) {
      if (
        !(BUDGET_CURRENCY_ALLOWLIST as readonly string[]).includes(currency)
      ) {
        return {
          ok: false,
          error: `budgetCurrency must be one of ${BUDGET_CURRENCY_ALLOWLIST.join(", ")}`,
        };
      }
      if (currency === "") {
        return {
          ok: false,
          error: "budgetCurrency must be a non-empty currency code",
        };
      }
    }
    return {
      ok: true,
      value: {
        title,
        requirements,
        niceToHave,
        skills: skills.value,
        experienceMinYears: experienceMinYears.value,
        experienceMaxYears: experienceMaxYears.value,
        budgetMin: budgetMin.value,
        budgetMax: budgetMax.value,
        budgetCurrency: currency,
      },
    };
  };

  server.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      if (!body || (typeof body === "string" && body.trim() === "")) {
        return done(null, undefined);
      }
      try {
        done(null, JSON.parse(body as string));
      } catch (e) {
        done(e as Error, undefined);
      }
    },
  );

  await server.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  });
  await server.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  registerAuth(server, { token: options.apiToken });

  server.addHook("onRoute", (routeOptions) => {
    const originalHandler = routeOptions.handler;
    routeOptions.handler = async function wrappedHandler(
      request: any,
      reply: any,
    ) {
      const rawTenantId = request.headers["x-tenant-id"];
      const tid = typeof rawTenantId === "string" ? rawTenantId : undefined;
      return tenantContext.run(tid, () =>
        (originalHandler as Function).call(this, request, reply),
      );
    };
  });

  server.get("/api/tenants", async () => {
    return { tenants: await hr.listTenants() };
  });

  server.post<{ Body: { name?: string } }>(
    "/api/tenants",
    async (request, reply) => {
      const { name } = request.body ?? {};
      if (!name) {
        return reply.code(400).send({ error: "name is required" });
      }
      const tenant = await hr.createTenant({ name });
      return reply.code(201).send({ tenant });
    },
  );

  server.get<{ Params: { id: string } }>(
    "/api/tenants/:id",
    async (request, reply) => {
      const tenant = await hr.getTenant(request.params.id);
      if (!tenant) {
        return reply.code(404).send({ error: "tenant not found" });
      }
      return { tenant };
    },
  );

  server.get<{ Params: { id: string } }>(
    "/api/tenants/:id/settings",
    async (request, reply) => {
      try {
        const settings = await hr.getTenantSettings(request.params.id);
        return { settings };
      } catch (error) {
        if (error instanceof Error && error.message.includes("not found")) {
          return reply.code(404).send({ error: error.message });
        }
        return reply.code(400).send({
          error: error instanceof Error ? error.message : "invalid settings",
        });
      }
    },
  );

  server.put<{
    Params: { id: string };
    Body: {
      workflowStages?: unknown;
      dataResidency?: unknown;
      aiComplianceMode?: unknown;
    };
  }>("/api/tenants/:id/settings", async (request, reply) => {
    const body = request.body ?? {};
    const input: {
      workflowStages?: string[];
      dataResidency?: DataResidency;
      aiComplianceMode?: AiComplianceMode;
    } = {};
    if (body.workflowStages !== undefined) {
      if (!Array.isArray(body.workflowStages)) {
        return reply.code(400).send({
          error: "workflowStages must be an array of stage names",
        });
      }
      input.workflowStages = body.workflowStages.map((stage) =>
        sanitize(stage),
      );
    }
    if (body.dataResidency !== undefined) {
      input.dataResidency = sanitize(
        body.dataResidency,
      ).toUpperCase() as DataResidency;
    }
    if (body.aiComplianceMode !== undefined) {
      input.aiComplianceMode = sanitize(
        body.aiComplianceMode,
      ).toLowerCase() as AiComplianceMode;
    }
    try {
      const tenant = await hr.updateTenantSettings(request.params.id, input);
      return { tenant };
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        return reply.code(404).send({ error: error.message });
      }
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "invalid settings",
      });
    }
  });

  server.get("/api/user-access", async () => {
    return { users: await hr.listUserAccess() };
  });

  server.post<{ Body: { email?: unknown; role?: unknown } }>(
    "/api/user-access",
    async (request, reply) => {
      const body = request.body ?? {};
      try {
        const user = await hr.createUserAccess({
          email: sanitize(body.email),
          role: sanitize(body.role) as UserRole,
        });
        return reply.code(201).send({ user });
      } catch (error) {
        return reply.code(400).send({
          error: error instanceof Error ? error.message : "invalid user access",
        });
      }
    },
  );

  server.put<{
    Params: { id: string };
    Body: { role?: unknown };
  }>("/api/user-access/:id", async (request, reply) => {
    const body = request.body ?? {};
    try {
      const user = await hr.updateUserAccess(request.params.id, {
        role: sanitize(body.role) as UserRole,
      });
      return { user };
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        return reply.code(404).send({ error: error.message });
      }
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "invalid user access",
      });
    }
  });

  server.delete<{ Params: { id: string } }>(
    "/api/user-access/:id",
    async (request, reply) => {
      try {
        await hr.deleteUserAccess(request.params.id);
        return reply.code(204).send();
      } catch (error) {
        if (error instanceof Error && error.message.includes("not found")) {
          return reply.code(404).send({ error: error.message });
        }
        return reply.code(400).send({
          error: error instanceof Error ? error.message : "invalid user access",
        });
      }
    },
  );

  server.get("/api/me/access", async () => {
    return { role: await hr.getUserRole() };
  });

  server.get("/api/policies", async () => {
    return { policies: await hr.listPolicies() };
  });

  server.post<{
    Body: { title?: unknown; category?: unknown; content?: unknown };
  }>("/api/policies", async (request, reply) => {
    const body = request.body ?? {};
    try {
      const policy = await hr.createPolicy({
        title: sanitize(body.title),
        category: sanitize(body.category) as PolicyCategory,
        content: sanitize(body.content),
      });
      return reply.code(201).send({ policy });
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "invalid policy",
      });
    }
  });

  server.put<{
    Params: { id: string };
    Body: {
      title?: unknown;
      category?: unknown;
      content?: unknown;
      active?: unknown;
    };
  }>("/api/policies/:id", async (request, reply) => {
    const body = request.body ?? {};
    const input: {
      title?: string;
      category?: string;
      content?: string;
      active?: boolean;
    } = {};
    if (body.title !== undefined) input.title = sanitize(body.title);
    if (body.category !== undefined) {
      input.category = sanitize(body.category);
    }
    if (body.content !== undefined) input.content = sanitize(body.content);
    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") {
        return reply.code(400).send({ error: "active must be a boolean" });
      }
      input.active = body.active;
    }
    try {
      const policy = await hr.updatePolicy(
        request.params.id,
        input as UpdatePolicyInput,
      );
      return { policy };
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        return reply.code(404).send({ error: error.message });
      }
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "invalid policy",
      });
    }
  });

  server.delete<{ Params: { id: string } }>(
    "/api/policies/:id",
    async (request, reply) => {
      try {
        await hr.deletePolicy(request.params.id);
        return reply.code(204).send();
      } catch (error) {
        if (error instanceof Error && error.message.includes("not found")) {
          return reply.code(404).send({ error: error.message });
        }
        return reply.code(400).send({
          error: error instanceof Error ? error.message : "invalid policy",
        });
      }
    },
  );

  server.get("/api/compliance/dashboard", async () => {
    return { compliance: await hr.complianceCheck() };
  });

  server.get("/health", async () => ({ status: "ok" }));

  server.get("/api/auth/status", async () => {
    const { authStatus } = await import("./auth.js");
    return authStatus();
  });

  server.get("/openapi.json", async () => HR_OPENAPI_SPEC);

  server.get("/", async (_request, reply) => {
    reply.type("text/html; charset=utf-8");
    return dashboardHtml();
  });

  server.get("/api/roles", async () => ({ roles: await hr.listRoles() }));

  server.get<{ Params: { id: string } }>(
    "/api/roles/:id/rank",
    async (request, reply) => {
      try {
        return await hr.rankRole(request.params.id);
      } catch (error) {
        if (error instanceof Error && error.message.includes("not found")) {
          return reply.code(404).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  server.post<{
    Body: {
      title?: string;
      requirements?: string[];
      niceToHave?: string[];
      skills?: string[] | string;
      experienceMinYears?: unknown;
      experienceMaxYears?: unknown;
      budgetMin?: unknown;
      budgetMax?: unknown;
      budgetCurrency?: unknown;
    };
  }>("/api/roles", async (request, reply) => {
    const parsed = parseRoleBody(request.body);
    if (!parsed.ok) {
      return reply.code(400).send({ error: parsed.error });
    }
    const { value } = parsed;
    if (!value.title || !value.requirements?.length) {
      return reply.code(400).send({
        error: "title and at least one requirement are required",
      });
    }
    const safeTitle = sanitize(value.title).slice(0, 100);
    if (!safeTitle) {
      return reply.code(400).send({ error: "title is required" });
    }
    const safeReqs = sanitizeList(value.requirements).slice(0, 50);
    const safeNice = value.niceToHave
      ? sanitizeList(value.niceToHave).slice(0, 50)
      : [];
    try {
      const role = await hr.createRole({
        title: safeTitle,
        requirements: safeReqs,
        niceToHave: safeNice,
        ...(value.skills !== undefined ? { skills: value.skills } : {}),
        ...(value.experienceMinYears !== undefined
          ? { experienceMinYears: value.experienceMinYears }
          : {}),
        ...(value.experienceMaxYears !== undefined
          ? { experienceMaxYears: value.experienceMaxYears }
          : {}),
        ...(value.budgetMin !== undefined
          ? { budgetMin: value.budgetMin }
          : {}),
        ...(value.budgetMax !== undefined
          ? { budgetMax: value.budgetMax }
          : {}),
        ...(value.budgetCurrency !== undefined
          ? { budgetCurrency: value.budgetCurrency }
          : {}),
      });
      return reply.code(201).send({ role });
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "invalid role",
      });
    }
  });

  server.put<{
    Params: { id: string };
    Body: {
      title?: string;
      requirements?: string[];
      niceToHave?: string[];
      skills?: string[] | string;
      experienceMinYears?: unknown;
      experienceMaxYears?: unknown;
      budgetMin?: unknown;
      budgetMax?: unknown;
      budgetCurrency?: unknown;
    };
  }>("/api/roles/:id", async (request, reply) => {
    const parsed = parseRoleBody(request.body);
    if (!parsed.ok) {
      return reply.code(400).send({ error: parsed.error });
    }
    const { value } = parsed;
    const input: {
      title?: string;
      requirements?: string[];
      niceToHave?: string[];
      skills?: string[];
      experienceMinYears?: number;
      experienceMaxYears?: number;
      budgetMin?: number;
      budgetMax?: number;
      budgetCurrency?: string;
    } = {};
    if (value.title !== undefined) {
      const safeTitle = sanitize(value.title).slice(0, 100);
      if (!safeTitle) {
        return reply.code(400).send({ error: "title is required" });
      }
      input.title = safeTitle;
    }
    if (value.requirements !== undefined) {
      input.requirements = sanitizeList(value.requirements).slice(0, 50);
    }
    if (value.niceToHave !== undefined) {
      input.niceToHave = sanitizeList(value.niceToHave).slice(0, 50);
    }
    if (value.skills !== undefined) input.skills = value.skills;
    if (value.experienceMinYears !== undefined) {
      input.experienceMinYears = value.experienceMinYears;
    }
    if (value.experienceMaxYears !== undefined) {
      input.experienceMaxYears = value.experienceMaxYears;
    }
    if (value.budgetMin !== undefined) input.budgetMin = value.budgetMin;
    if (value.budgetMax !== undefined) input.budgetMax = value.budgetMax;
    if (value.budgetCurrency !== undefined) {
      input.budgetCurrency = value.budgetCurrency;
    }
    try {
      const role = await hr.updateRole(request.params.id, input);
      return { role };
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        return reply.code(404).send({ error: error.message });
      }
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "invalid role",
      });
    }
  });

  server.get<{
    Querystring: {
      status?: string;
      limit?: string;
      offset?: string;
      q?: string;
    };
  }>("/api/candidates", async (request) => {
    const statusFilter = request.query.status;
    const q = request.query.q?.trim().toLowerCase();
    let candidates = await hr.listCandidates();
    const roles = await hr.listRoles();
    const titles = new Map(roles.map((r) => [r.id, r.title]));
    const withTitles = (list: typeof candidates) =>
      list.map((c) => ({
        ...c,
        roleTitle: titles.get(c.roleId) ?? c.roleId,
      }));
    if (statusFilter) {
      candidates = candidates.filter((c) => c.status === statusFilter);
    }
    if (q) {
      candidates = candidates.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q),
      );
    }
    const total = candidates.length;
    const hasPaging =
      request.query.limit !== undefined || request.query.offset !== undefined;
    let page = candidates;
    if (hasPaging) {
      const limit = Math.max(
        1,
        Math.min(200, parseInt(request.query.limit ?? "25", 10) || 25),
      );
      const offset = Math.max(
        0,
        parseInt(request.query.offset ?? "0", 10) || 0,
      );
      page = candidates.slice(offset, offset + limit);
    }
    return { candidates: withTitles(page), total };
  });

  server.post<{ Body: { text?: string } }>(
    "/api/candidates/draft",
    async (request, reply) => {
      const raw =
        typeof request.body?.text === "string" ? request.body.text : "";
      if (!raw.trim()) {
        return reply
          .code(400)
          .send({ error: "text (resume/CV content) is required" });
      }
      const roles = await hr.listRoles();
      const extraction = extractCandidateMeta(raw);
      const recommendations = recommendRoles(extraction.resumeText, roles);
      await hr.logAiEvent(null, "ai.candidate_parsed", {
        source: "text",
        detectedName: Boolean(extraction.name),
        detectedEmail: Boolean(extraction.email),
        topRoleId: recommendations[0]?.roleId ?? null,
        topScore: recommendations[0]?.score ?? 0,
      });
      return {
        extraction,
        pii: detectPii(raw),
        recommendations: recommendations.slice(0, 5),
      };
    },
  );

  server.post<{ Body: { filename?: string; contentBase64?: string } }>(
    "/api/candidates/extract",
    async (request, reply) => {
      const filename = sanitize(request.body?.filename);
      const contentBase64 = request.body?.contentBase64;
      if (!filename || typeof contentBase64 !== "string" || !contentBase64) {
        return reply
          .code(400)
          .send({ error: "filename and contentBase64 are required" });
      }
      let documentText: string;
      try {
        documentText = await extractDocumentText(filename, contentBase64);
      } catch (error) {
        return reply.code(400).send({
          error:
            error instanceof Error ? error.message : "document parse failed",
        });
      }
      if (!documentText.trim()) {
        return reply
          .code(422)
          .send({ error: "no text could be extracted from the document" });
      }
      const roles = await hr.listRoles();
      const extraction = extractCandidateMeta(documentText);
      const recommendations = recommendRoles(extraction.resumeText, roles);
      await hr.logAiEvent(null, "ai.document_extracted", {
        filename,
        detectedName: Boolean(extraction.name),
        detectedEmail: Boolean(extraction.email),
        piiKinds: detectPii(documentText),
        topRoleId: recommendations[0]?.roleId ?? null,
        topScore: recommendations[0]?.score ?? 0,
      });
      return {
        text: documentText,
        extraction,
        pii: detectPii(documentText),
        recommendations: recommendations.slice(0, 5),
      };
    },
  );

  server.post<{
    Body: { ids?: string[]; approved?: boolean; reviewer?: string };
  }>("/api/candidates/batch/review", async (request, reply) => {
    const ids = Array.isArray(request.body?.ids) ? request.body.ids : [];
    if (ids.length === 0 || ids.length > 100) {
      return reply
        .code(400)
        .send({ error: "ids must be an array of 1-100 candidate ids" });
    }
    const reviewer = sanitize(request.body?.reviewer) || "dashboard";
    const approved = request.body?.approved ?? false;
    const results: Array<{
      id: string;
      ok: boolean;
      status?: string;
      error?: string;
    }> = [];
    for (const id of ids) {
      try {
        const outcome = await hr.reviewCandidate(id, {
          approved,
          reviewer,
          note: "batch review via dashboard",
        });
        results.push({ id, ok: true, status: outcome.candidate.status });
      } catch (error) {
        results.push({
          id,
          ok: false,
          error: error instanceof Error ? error.message : "unknown error",
        });
      }
    }
    const done = results.filter((r) => r.ok).length;
    await hr.logAiEvent(null, "hr.batch_reviewed", {
      requested: ids.length,
      done,
      failed: results.length - done,
      approved,
    });
    return { done, failed: results.length - done, results };
  });

  server.post<{ Body: { ids?: string[] } }>(
    "/api/candidates/batch/delete",
    async (request, reply) => {
      const ids = Array.isArray(request.body?.ids) ? request.body.ids : [];
      if (ids.length === 0 || ids.length > 100) {
        return reply
          .code(400)
          .send({ error: "ids must be an array of 1-100 candidate ids" });
      }
      const results: Array<{ id: string; ok: boolean; error?: string }> = [];
      for (const id of ids) {
        try {
          await hr.deleteCandidate(id);
          results.push({ id, ok: true });
        } catch (error) {
          results.push({
            id,
            ok: false,
            error: error instanceof Error ? error.message : "unknown error",
          });
        }
      }
      const done = results.filter((r) => r.ok).length;
      await hr.logAiEvent(null, "hr.batch_deleted", {
        requested: ids.length,
        done,
        failed: results.length - done,
      });
      return { done, failed: results.length - done, results };
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
      return reply.code(400).send({
        error: "roleId, name, email, and resumeText are required",
      });
    }
    const safeName = sanitize(name).slice(0, 200);
    const safeEmail = String(email).trim().toLowerCase();
    const safeResume = sanitize(resumeText).slice(0, 50000);
    if (!safeName || !validateEmail(safeEmail) || !safeResume) {
      return reply.code(400).send({
        error: "Invalid input: name, valid email, and resumeText required",
      });
    }
    try {
      const candidate = await hr.createCandidate({
        roleId,
        name: safeName,
        email: safeEmail,
        resumeText: safeResume,
      });
      telemetry?.counter("pipeline.candidate.created");
      telemetry?.counter("pipeline.candidate.screened", 1, {
        recommendation: candidate.screening?.recommendation ?? "needs_review",
      });
      return reply.code(201).send({
        candidate,
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
      const roles = await hr.listRoles();
      const titles = new Map(roles.map((r) => [r.id, r.title]));
      return {
        candidate: {
          ...candidate,
          roleTitle: titles.get(candidate.roleId) ?? candidate.roleId,
        },
      };
    },
  );

  server.delete<{ Params: { id: string } }>(
    "/api/candidates/:id",
    async (request, reply) => {
      try {
        await hr.deleteCandidate(request.params.id);
        return { ok: true };
      } catch (error) {
        if (error instanceof Error && error.message.includes("not found")) {
          return reply.code(404).send({ error: error.message });
        }
        return reply.code(500).send({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  server.post<{ Params: { id: string } }>(
    "/api/candidates/:id/screen",
    async (request, reply) => {
      try {
        const candidate = await hr.screenCandidate(request.params.id);
        telemetry?.counter("pipeline.candidate.rescreened");
        return { candidate };
      } catch (error) {
        if (error instanceof Error && error.message.includes("not found")) {
          return reply.code(404).send({ error: error.message });
        }
        return reply.code(500).send({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  server.post<{ Params: { id: string } }>(
    "/api/candidates/:id/notice",
    async (request, reply) => {
      try {
        const candidate = await hr.discloseAiNotice(request.params.id);
        return { candidate, notice: candidateAiNotice() };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes("not found")) {
          return reply.code(404).send({ error: msg });
        }
        if (msg.includes("already disclosed")) {
          return reply.code(409).send({ error: msg });
        }
        return reply.code(500).send({ error: msg });
      }
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
      const outcome = await hr.reviewCandidate(request.params.id, {
        approved,
        reviewer,
        note,
      });
      telemetry?.counter("pipeline.candidate.reviewed", 1, {
        outcome: approved ? "approved" : "rejected",
      });
      return outcome;
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

  server.get("/api/audit", async () => ({
    events: (await hr.auditLog()).map((e) => ({
      ...e,
      detail: redactPii(e.detail),
    })),
  }));

  server.get("/api/outbox", async () => ({ events: await hr.pendingOutbox() }));

  server.post("/api/outbox/dispatch", async () => {
    if (!options.dispatcher) {
      return { dispatched: 0 };
    }
    const dispatched = await options.dispatcher.poll();
    return { dispatched };
  });

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

  server.get("/api/metrics", async () => ({
    metrics: await hr.getCapacityMetrics(),
  }));

  server.get("/api/pipeline/summary", async () => hr.getPipelineSummary());

  server.get("/api/stats", async () => {
    const [candidates, metrics, outbox] = await Promise.all([
      hr.listCandidates(),
      hr.getCapacityMetrics(),
      hr.pendingOutbox(),
    ]);

    const byStatus = {
      pending_screening: 0,
      pending_review: 0,
      approved: 0,
      rejected: 0,
    };
    let scoreSum = 0;
    let scoreCount = 0;
    for (const candidate of candidates) {
      if (candidate.status in byStatus) {
        byStatus[candidate.status as keyof typeof byStatus]++;
      }
      if (candidate.screening) {
        scoreSum += candidate.screening.score;
        scoreCount++;
      }
    }

    return {
      total: candidates.length,
      byStatus,
      avgScore: scoreCount ? scoreSum / scoreCount : null,
      disputes: {
        raised: metrics.overall.disputeCount,
        resolved: candidates.filter((c) => c.dispute?.resolvedAt).length,
      },
      pendingOutbox: outbox.length,
    };
  });

  server.get("/api/ai-usage", async () => {
    const events = await hr.auditLog();
    const byType: Record<string, number> = {};
    let total = 0;
    for (const event of events) {
      if (event.action.includes("screen") || event.action.includes("ai")) {
        byType[event.action] = (byType[event.action] ?? 0) + 1;
        total++;
      }
    }
    return { usage: { byType, total } };
  });

  server.get("/api/scorecards", async () => ({
    scorecards: await hr.listScorecards(),
  }));

  server.post<{
    Body: {
      candidateId: string;
      reviewerName: string;
      answers: { questionId: string; score: number; comment?: string }[];
    };
  }>("/api/scorecards", async (request, reply) => {
    try {
      const { candidateId, reviewerName, answers } = request.body ?? {};
      if (!candidateId || !reviewerName || !answers?.length) {
        return reply.code(400).send({
          error: "candidateId, reviewerName, and answers are required",
        });
      }
      const scorecard = await hr.createScorecard(
        candidateId,
        "system",
        reviewerName,
        answers,
      );
      return reply.code(201).send({ scorecard });
    } catch (error) {
      return reply.code(500).send({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  server.patch<{
    Params: { id: string };
    Body: {
      reviewerName?: string;
      answers?: { questionId: string; score: number; comment?: string }[];
    };
  }>("/api/scorecards/:id", async (request, reply) => {
    const body = request.body ?? {};
    const input: {
      reviewerName?: string;
      answers?: { questionId: string; score: number; comment?: string }[];
    } = {};
    if (body.reviewerName !== undefined) {
      const safeName = sanitize(body.reviewerName).slice(0, 200);
      if (!safeName) {
        return reply.code(400).send({ error: "reviewerName must be a string" });
      }
      input.reviewerName = safeName;
    }
    if (body.answers !== undefined) {
      if (!Array.isArray(body.answers) || body.answers.length === 0) {
        return reply
          .code(400)
          .send({ error: "answers must be a non-empty array" });
      }
      input.answers = body.answers;
    }
    try {
      const scorecard = await hr.updateScorecard(request.params.id, input);
      return { scorecard };
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        return reply.code(404).send({ error: error.message });
      }
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "invalid scorecard",
      });
    }
  });

  server.get<{ Params: { id: string } }>(
    "/api/candidates/:id/scorecards",
    async (request, reply) => {
      try {
        const scorecards = await hr.getScorecardsByCandidate(request.params.id);
        return { scorecards };
      } catch (error) {
        return reply.code(500).send({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  server.get("/api/csv/export", async (_request, reply) => {
    const csv = await hr.exportCandidatesToCsv();
    return reply
      .header("Content-Type", "text/csv")
      .header("Content-Disposition", "attachment; filename=candidates.csv")
      .send(csv);
  });

  server.post<{ Body: { csv: string } }>(
    "/api/csv/import",
    async (request, reply) => {
      try {
        const result = await hr.importCandidatesFromCsv(
          request.body?.csv ?? "",
        );
        return reply.code(200).send(result);
      } catch (error) {
        return reply.code(500).send({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  return { server, hr };
}
