import Fastify, { type FastifyInstance } from "fastify";
import type {
  BillingEvent,
  Permission,
  Session,
  Tenant,
  User,
  WebReferenceService,
} from "@dsrvm/web";
import { PERMISSIONS, can } from "@dsrvm/web";
import { dashboardHtml } from "./dashboard.js";

export interface WebReferenceServer {
  server: FastifyInstance;
  service: WebReferenceService;
}

export function buildWebReferenceServer(
  service: WebReferenceService,
): WebReferenceServer {
  const server = Fastify({ logger: false });

  server.get("/health", async () => ({ status: "ok" }));

  server.get("/", async (_request, reply) => {
    reply.type("text/html; charset=utf-8");
    return dashboardHtml();
  });

  server.post<{ Body: { name?: string; host?: string } }>(
    "/api/tenants",
    async (request, reply) => {
      const { name, host } = request.body ?? {};
      if (!name || !host) {
        return reply.code(400).send({ error: "name and host are required" });
      }
      try {
        const { tenant, ownerEmail, inviteToken } = await service.bootstrap({
          name,
          host,
        });
        return reply.code(201).send({
          tenant,
          ownerEmail,
          inviteToken,
          note: "no default password is set. Claim the owner account by accepting the invite token via POST /api/invites/accept.",
        });
      } catch (error) {
        return reply.code(409).send({ error: message(error) });
      }
    },
  );

  server.get("/api/tenants", async (request, reply) => {
    const auth = await tryAuth(service, request.headers.authorization);
    if (!auth)
      return reply.code(401).send({ error: "authentication required" });
    try {
      requirePerm(auth.user, PERMISSIONS.consoleAccess);
      return { tenants: await service.tenants.list() };
    } catch (error) {
      return reply.code(403).send({ error: message(error) });
    }
  });

  server.post<{
    Body: {
      tenantId?: string;
      email?: string;
      password?: string;
      name?: string;
      role?: string;
      inviteToken?: string;
    };
  }>("/api/auth/signup", async (request, reply) => {
    const { tenantId, email, password, name, role, inviteToken } =
      request.body ?? {};
    if (!tenantId || !email || !password || !name) {
      return reply
        .code(400)
        .send({ error: "tenantId, email, password, name are required" });
    }
    try {
      const { user, token } = await service.auth.signup({
        tenantId,
        email,
        password,
        name,
        role: (role as User["role"]) ?? "viewer",
        inviteToken,
      });
      return reply.code(201).send({ user, token });
    } catch (error) {
      const msg = message(error);
      const code = /invite|owner/i.test(msg) ? 403 : 409;
      return reply.code(code).send({ error: msg });
    }
  });

  server.post<{
    Body: { email?: string; role?: string };
  }>("/api/invites", async (request, reply) => {
    const auth = await tryAuth(service, request.headers.authorization);
    if (!auth)
      return reply.code(401).send({ error: "authentication required" });
    const { email, role } = request.body ?? {};
    if (!email || !role) {
      return reply.code(400).send({ error: "email and role are required" });
    }
    if (role === "owner") {
      return reply.code(403).send({
        error: "owner role is never invitable (single owner per tenant)",
      });
    }
    if (!["admin", "operator", "editor", "viewer"].includes(role)) {
      return reply.code(400).send({ error: `cannot invite role "${role}"` });
    }
    try {
      const result = await service.invites.create({
        tenantId: auth.session.tenantId,
        email,
        role: role as User["role"],
        actor: auth.user,
      });
      return reply.code(201).send(result);
    } catch (error) {
      const msg = message(error);
      const code = msg.startsWith("forbidden") ? 403 : 409;
      return reply.code(code).send({ error: msg });
    }
  });

  server.get("/api/invites", async (request, reply) => {
    const auth = await tryAuth(service, request.headers.authorization);
    if (!auth)
      return reply.code(401).send({ error: "authentication required" });
    try {
      return {
        invites: await service.invites.list({
          tenantId: auth.session.tenantId,
          actor: auth.user,
        }),
      };
    } catch (error) {
      return reply.code(403).send({ error: message(error) });
    }
  });

  server.post<{
    Body: { token?: string; name?: string; password?: string };
  }>("/api/invites/accept", async (request, reply) => {
    const { token, name, password } = request.body ?? {};
    if (!token || !name || !password) {
      return reply
        .code(400)
        .send({ error: "token, name, password are required" });
    }
    try {
      const { user, sessionToken } = await service.invites.accept({
        token,
        name,
        password,
      });
      return reply
        .code(201)
        .send({ user: publicUser(user), token: sessionToken });
    } catch (error) {
      return reply.code(400).send({ error: message(error) });
    }
  });

  server.delete<{ Params: { id: string } }>(
    "/api/invites/:id",
    async (request, reply) => {
      const auth = await tryAuth(service, request.headers.authorization);
      if (!auth)
        return reply.code(401).send({ error: "authentication required" });
      try {
        await service.invites.revoke({
          tenantId: auth.session.tenantId,
          id: request.params.id,
          actor: auth.user,
        });
        return { ok: true };
      } catch (error) {
        const msg = message(error);
        const code = msg.startsWith("forbidden") ? 403 : 404;
        return reply.code(code).send({ error: msg });
      }
    },
  );

  server.post<{
    Body: { tenantId?: string; email?: string; password?: string };
  }>("/api/auth/login", async (request, reply) => {
    const { tenantId, email, password } = request.body ?? {};
    if (!tenantId || !email || !password) {
      return reply
        .code(400)
        .send({ error: "tenantId, email, password are required" });
    }
    try {
      const { user, token } = await service.auth.login({
        tenantId,
        email,
        password,
      });
      return { user, token };
    } catch {
      return reply.code(401).send({ error: "invalid credentials" });
    }
  });

  server.post("/api/auth/logout", async (request, reply) => {
    const auth = await tryAuth(service, request.headers.authorization);
    if (!auth)
      return reply.code(401).send({ error: "authentication required" });
    await service.auth.logout(auth.session.token);
    return { ok: true };
  });

  server.get("/api/auth/me", async (request, reply) => {
    const auth = await tryAuth(service, request.headers.authorization);
    if (!auth)
      return reply.code(401).send({ error: "authentication required" });
    return { user: auth.user, session: publicSession(auth.session) };
  });

  server.get("/api/auth/sso", async () => {
    return { providers: service.sso.providers() };
  });

  server.get<{
    Querystring: { tenantId?: string };
    Params: { provider: string };
  }>("/api/auth/sso/:provider/login", async (request, reply) => {
    const { tenantId } = request.query;
    if (!tenantId) {
      return reply.code(400).send({ error: "tenantId is required" });
    }
    try {
      const result = await service.sso.login({
        provider: request.params.provider,
        tenantId,
      });
      return { redirectUrl: result.redirectUrl, state: result.state };
    } catch (error) {
      return reply.code(400).send({ error: message(error) });
    }
  });

  server.get<{
    Querystring: Record<string, string | undefined>;
    Params: { provider: string };
  }>("/api/auth/sso/:provider/callback", async (request, reply) => {
    return ssoCallback(service, request.params.provider, request.query, reply);
  });

  server.post<{
    Body: Record<string, string | undefined>;
    Params: { provider: string };
  }>("/api/auth/sso/:provider/callback", async (request, reply) => {
    return ssoCallback(service, request.params.provider, request.body, reply);
  });

  server.get("/api/content", async (request, reply) => {
    const auth = await tryAuth(service, request.headers.authorization);
    if (!auth)
      return reply.code(401).send({ error: "authentication required" });
    try {
      requirePerm(auth.user, PERMISSIONS.cmsView);
      return {
        tenantId: auth.session.tenantId,
        items: await service.cms.list(auth.session.tenantId),
      };
    } catch (error) {
      return reply.code(403).send({ error: message(error) });
    }
  });

  server.post<{
    Body: { slug?: string; title?: string; body?: string };
  }>("/api/content", async (request, reply) => {
    const auth = await tryAuth(service, request.headers.authorization);
    if (!auth)
      return reply.code(401).send({ error: "authentication required" });
    const { slug, title, body } = request.body ?? {};
    if (!slug || !title || !body) {
      return reply.code(400).send({ error: "slug, title, body are required" });
    }
    try {
      const item = await service.cms.createItem({
        tenantId: auth.session.tenantId,
        slug,
        title,
        body,
        actor: auth.user,
      });
      return reply.code(201).send({ item });
    } catch (error) {
      return reply.code(409).send({ error: message(error) });
    }
  });

  server.patch<{
    Params: { id: string };
    Body: { status?: string };
  }>("/api/content/:id/status", async (request, reply) => {
    const auth = await tryAuth(service, request.headers.authorization);
    if (!auth)
      return reply.code(401).send({ error: "authentication required" });
    const { status } = request.body ?? {};
    if (!status) return reply.code(400).send({ error: "status is required" });
    try {
      const item = await service.cms.setStatus({
        tenantId: auth.session.tenantId,
        id: request.params.id,
        status: status as "draft" | "published" | "archived",
        actor: auth.user,
      });
      return { item };
    } catch (error) {
      return reply.code(409).send({ error: message(error) });
    }
  });

  server.post<{
    Body: {
      task?: string;
      model?: string;
      inputTokens?: number;
      outputTokens?: number;
    };
  }>("/api/usage", async (request, reply) => {
    const auth = await tryAuth(service, request.headers.authorization);
    if (!auth)
      return reply.code(401).send({ error: "authentication required" });
    const { task, model, inputTokens, outputTokens } = request.body ?? {};
    if (!task || !model) {
      return reply.code(400).send({ error: "task and model are required" });
    }
    const record = await service.billing.recordUsage({
      tenantId: auth.session.tenantId,
      task,
      model,
      inputTokens,
      outputTokens,
    });
    return reply.code(201).send({ record });
  });

  server.get("/api/billing/plans", async () => {
    return { plans: service.billing.plans() };
  });

  server.get("/api/billing/portal", async (request, reply) => {
    const auth = await tryAuth(service, request.headers.authorization);
    if (!auth)
      return reply.code(401).send({ error: "authentication required" });
    try {
      requirePerm(auth.user, PERMISSIONS.billingView);
      const tenantId = auth.session.tenantId;
      const [tenant, statement, usageReport, flags] = await Promise.all([
        service.tenants.get(tenantId),
        service.billing.statement(tenantId),
        service.billing.usageReport(tenantId),
        service.billingWebhook?.flags(tenantId) ?? Promise.resolve([]),
      ]);
      return { tenant, statement, usageReport, flags };
    } catch (error) {
      return reply.code(403).send({ error: message(error) });
    }
  });

  server.patch<{ Body: { plan?: string } }>(
    "/api/billing/plan",
    async (request, reply) => {
      const auth = await tryAuth(service, request.headers.authorization);
      if (!auth)
        return reply.code(401).send({ error: "authentication required" });
      const { plan } = request.body ?? {};
      if (!plan) return reply.code(400).send({ error: "plan is required" });
      if (!["starter", "growth", "enterprise"].includes(plan)) {
        return reply.code(400).send({ error: `unknown plan "${plan}"` });
      }
      try {
        requirePerm(auth.user, PERMISSIONS.billingManage);
        const tenant = await service.billing.setPlan({
          tenantId: auth.session.tenantId,
          plan: plan as "starter" | "growth" | "enterprise",
        });
        return { tenant };
      } catch (error) {
        return reply.code(403).send({ error: message(error) });
      }
    },
  );

  server.patch<{
    Body: { preferredCMS?: string; preferredAIService?: string };
  }>("/api/tenants/preferences", async (request, reply) => {
    const auth = await tryAuth(service, request.headers.authorization);
    if (!auth)
      return reply.code(401).send({ error: "authentication required" });
    const { preferredCMS, preferredAIService } = request.body ?? {};
    if (preferredCMS === undefined && preferredAIService === undefined) {
      return reply
        .code(400)
        .send({ error: "preferredCMS or preferredAIService is required" });
    }
    try {
      const tenant = await service.integrations.setPreferences({
        tenantId: auth.session.tenantId,
        actor: auth.user,
        preferredCMS: preferredCMS as import("@dsrvm/web").CmsKind | undefined,
        preferredAIService: preferredAIService as
          import("@dsrvm/web").AiServiceKind | undefined,
      });
      return { tenant };
    } catch (error) {
      const msg = message(error);
      const code = msg.startsWith("forbidden") ? 403 : 400;
      return reply.code(code).send({ error: msg });
    }
  });

  server.delete("/api/tenants", async (request, reply) => {
    const auth = await tryAuth(service, request.headers.authorization);
    if (!auth)
      return reply.code(401).send({ error: "authentication required" });
    try {
      await service.deleteTenant({
        tenantId: auth.session.tenantId,
        actorId: auth.user.id,
      });
      return { ok: true };
    } catch (error) {
      const msg = message(error);
      const code = msg.startsWith("forbidden") ? 403 : 400;
      return reply.code(code).send({ error: msg });
    }
  });

  server.get("/api/integrations/registry", async (request, reply) => {
    const auth = await tryAuth(service, request.headers.authorization);
    if (!auth)
      return reply.code(401).send({ error: "authentication required" });
    return service.integrations.registry();
  });

  server.get("/api/integrations/resolved", async (request, reply) => {
    const auth = await tryAuth(service, request.headers.authorization);
    if (!auth)
      return reply.code(401).send({ error: "authentication required" });
    try {
      requirePerm(auth.user, PERMISSIONS.cmsView);
      const tenantId = auth.session.tenantId;
      const tenant = await service.tenants.get(tenantId);
      const connection = await service.integrations.connectionFor(tenantId);
      const ai = await service.integrations.aiFor(tenantId);
      return {
        tenantId,
        preferredCMS: tenant?.preferredCMS ?? "none",
        preferredAIService: tenant?.preferredAIService ?? "none",
        // Never expose secrets: only whether a connection is configured.
        cmsConfigured: connection !== null,
        cmsKind: connection?.kind ?? null,
        ai,
      };
    } catch (error) {
      return reply.code(403).send({ error: message(error) });
    }
  });

  server.get("/api/audit", async (request, reply) => {
    const auth = await tryAuth(service, request.headers.authorization);
    if (!auth)
      return reply.code(401).send({ error: "authentication required" });
    try {
      return {
        events: await service.audit.list({
          tenantId: auth.session.tenantId,
          actor: auth.user,
        }),
      };
    } catch (error) {
      return reply.code(403).send({ error: message(error) });
    }
  });

  server.get("/api/reports/overview", async (request, reply) => {
    const auth = await tryAuth(service, request.headers.authorization);
    if (!auth)
      return reply.code(401).send({ error: "authentication required" });
    try {
      return await service.admin.tenantOverview(
        auth.user,
        auth.session.tenantId,
      );
    } catch (error) {
      return reply.code(403).send({ error: message(error) });
    }
  });

  server.register(async function billingWebhookPlugin(instance) {
    instance.addContentTypeParser(
      "application/json",
      { parseAs: "string" },
      (_request, body, done) => done(null, body),
    );
    instance.post<{ Body: string }>(
      "/api/billing/webhooks",
      async (request, reply) => {
        if (!service.billingWebhook) {
          return reply
            .code(503)
            .send({ error: "billing webhooks are not configured" });
        }
        const signature = request.headers["x-billing-signature"];
        if (typeof signature !== "string" || !signature) {
          return reply
            .code(401)
            .send({ error: "missing x-billing-signature header" });
        }
        const body =
          typeof request.body === "string"
            ? request.body
            : JSON.stringify(request.body);
        if (!service.billingWebhook.verify(signature, body)) {
          return reply.code(401).send({ error: "invalid webhook signature" });
        }
        let event: BillingEvent;
        try {
          event = JSON.parse(body) as BillingEvent;
        } catch {
          return reply.code(400).send({ error: "invalid JSON payload" });
        }
        if (
          typeof event.id !== "string" ||
          typeof event.type !== "string" ||
          typeof event.data !== "object" ||
          event.data === null
        ) {
          return reply
            .code(400)
            .send({ error: "event requires id, type, and data" });
        }
        try {
          const result = await service.billingWebhook.handleEvent(event);
          return { received: true, ...result };
        } catch (error) {
          return reply.code(400).send({ error: message(error) });
        }
      },
    );
  });

  server.get("/api/admin/overview", async (request, reply) => {
    const auth = await tryAuth(service, request.headers.authorization);
    if (!auth)
      return reply.code(401).send({ error: "authentication required" });
    try {
      return await service.admin.overview(auth.user);
    } catch (error) {
      return reply.code(403).send({ error: message(error) });
    }
  });

  server.get("/api/tenant", async (request, reply) => {
    const tenant = await resolveRequestTenant(service, request.headers.host);
    if (!tenant) return reply.code(404).send({ error: "no tenant for host" });
    return { tenant };
  });

  return { server, service };
}

async function tryAuth(
  service: WebReferenceService,
  authorization?: string,
): Promise<{ session: Session; user: User } | null> {
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const session = await service.auth.authenticate(token);
  if (!session) return null;
  const user = await service.auth.getUser(session);
  return user ? { session, user } : null;
}

function requirePerm(user: User, permission: Permission): void {
  if (!can(user, permission)) {
    throw new Error(
      `forbidden: user "${user.email}" (${user.role}) lacks "${permission}"`,
    );
  }
}

async function resolveRequestTenant(
  service: WebReferenceService,
  host?: string,
): Promise<Tenant | null> {
  if (!host) return null;
  return service.tenants.resolveFromHost(host);
}

function publicSession(session: Session) {
  return {
    userId: session.userId,
    tenantId: session.tenantId,
    role: session.role,
    expiresAt: session.expiresAt,
  };
}

async function ssoCallback(
  service: WebReferenceService,
  provider: string,
  params: Record<string, string | undefined>,
  reply: { code(statusCode: number): { send(body: unknown): unknown } },
) {
  try {
    const result = await service.sso.handleCallback({ provider, params });
    return reply.code(200).send({
      user: publicUser(result.user),
      token: result.token,
      created: result.created,
      identity: {
        provider: result.identity.provider,
        subject: result.identity.subject,
        email: result.identity.email,
        name: result.identity.name,
        groups: result.identity.groups,
      },
    });
  } catch (error) {
    return reply.code(401).send({ error: message(error) });
  }
}

function publicUser(user: User) {
  return {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
