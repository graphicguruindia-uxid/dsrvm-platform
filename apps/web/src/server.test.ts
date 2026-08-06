import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { createWebReferenceApp } from "./app.js";
import { seedReference } from "./seed.js";
import type { SsoProviderConfig } from "@dsrvm/web";

const NOW = () => new Date("2026-08-04T00:00:00.000Z");

const HS_SECRET = "test-client-secret";
const WEBHOOK_SECRET = "test-webhook-secret";

function b64url(data: string): string {
  return Buffer.from(data).toString("base64url");
}

function signWebhook(body: string, atMs = Date.now()): string {
  const timestamp = Math.floor(atMs / 1000);
  const digest = createHmac("sha256", WEBHOOK_SECRET)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

function signHs256(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  secret = HS_SECRET,
): string {
  const input = `${b64url(JSON.stringify(header))}.${b64url(
    JSON.stringify(payload),
  )}`;
  const sig = createHmac("sha256", secret).update(input).digest("base64url");
  return `${input}.${sig}`;
}

function demoOidc(): SsoProviderConfig {
  return {
    provider: "oidc",
    name: "google",
    clientId: "client-123",
    clientSecret: HS_SECRET,
    issuer: "https://accounts.google.com",
    redirectUri: "https://acme.dsrvm.app/api/auth/sso/google/callback",
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    grant: "implicit",
    defaultRole: "viewer",
  };
}

function build() {
  return createWebReferenceApp({
    now: NOW,
    ssoProviders: [demoOidc()],
    billingWebhookSecret: WEBHOOK_SECRET,
  });
}

async function createTenantAndLogin(app: ReturnType<typeof build>) {
  const tenantRes = await app.server.inject({
    method: "POST",
    url: "/api/tenants",
    payload: { name: "Acme", host: "acme.dsrvm.app" },
  });
  expect(tenantRes.statusCode).toBe(201);
  const tenant = tenantRes.json().tenant;

  const loginRes = await app.server.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      tenantId: tenant.id,
      email: "owner@acme.dsrvm.app",
      password: "change-me-now",
    },
  });
  expect(loginRes.statusCode).toBe(200);
  return { app, tenant, token: loginRes.json().token as string };
}

describe("web reference server", () => {
  it("exposes health and serves the admin console", async () => {
    const app = build();
    const health = await app.server.inject({ method: "GET", url: "/health" });
    expect(health.json()).toEqual({ status: "ok" });

    const dashboard = await app.server.inject({ method: "GET", url: "/" });
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.headers["content-type"]).toContain("text/html");
    expect(dashboard.body).toContain("Admin Console");
    await app.close();
  });

  it("resolves white-label tenants from the host header", async () => {
    const app = build();
    await app.server.inject({
      method: "POST",
      url: "/api/tenants",
      payload: { name: "Acme", host: "acme.dsrvm.app" },
    });
    const res = await app.server.inject({
      method: "GET",
      url: "/api/tenant",
      headers: { host: "acme.dsrvm.app" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().tenant.name).toBe("Acme");

    const unknown = await app.server.inject({
      method: "GET",
      url: "/api/tenant",
      headers: { host: "unknown.app" },
    });
    expect(unknown.statusCode).toBe(404);
    await app.close();
  });

  it("authenticates and scopes CMS content to the tenant", async () => {
    const { app, tenant, token } = await createTenantAndLogin(build());
    const authHeader = { authorization: `Bearer ${token}` };

    const createRes = await app.server.inject({
      method: "POST",
      url: "/api/content",
      headers: authHeader,
      payload: { slug: "pricing", title: "Pricing", body: "AI delivery." },
    });
    expect(createRes.statusCode).toBe(201);
    const itemId = createRes.json().item.id;

    const publishRes = await app.server.inject({
      method: "PATCH",
      url: `/api/content/${itemId}/status`,
      headers: authHeader,
      payload: { status: "published" },
    });
    expect(publishRes.statusCode).toBe(200);
    expect(publishRes.json().item.status).toBe("published");

    const listRes = await app.server.inject({
      method: "GET",
      url: "/api/content",
      headers: authHeader,
    });
    expect(listRes.json().tenantId).toBe(tenant.id);
    expect(listRes.json().items).toHaveLength(1);

    const me = await app.server.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: authHeader,
    });
    expect(me.json().user.role).toBe("owner");
    await app.close();
  });

  it("denies CMS edits to viewers via RBAC", async () => {
    const { app, tenant, token } = await createTenantAndLogin(build());
    const signupRes = await app.server.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: {
        tenantId: tenant.id,
        email: "viewer@acme.dsrvm.app",
        password: "x",
        name: "Viewer",
        role: "viewer",
      },
    });
    const viewerToken = signupRes.json().token as string;

    const createRes = await app.server.inject({
      method: "POST",
      url: "/api/content",
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: { slug: "x", title: "X", body: "x" },
    });
    expect(createRes.statusCode).toBe(409);
    expect(createRes.json().error).toContain("forbidden");
    await app.close();
  });

  it("records metered usage and shows it in the admin overview", async () => {
    const { app, tenant, token } = await createTenantAndLogin(build());
    const authHeader = { authorization: `Bearer ${token}` };

    const usageRes = await app.server.inject({
      method: "POST",
      url: "/api/usage",
      headers: authHeader,
      payload: {
        task: "screening",
        model: "gpt-4o-mini",
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      },
    });
    expect(usageRes.statusCode).toBe(201);
    expect(usageRes.json().record.estCostUsd).toBeCloseTo(0.75);
    expect(usageRes.json().record.tenantId).toBe(tenant.id);

    const overview = await app.server.inject({
      method: "GET",
      url: "/api/admin/overview",
      headers: authHeader,
    });
    const data = overview.json();
    expect(data.tenants).toBe(1);
    expect(data.monthUsageUsd).toBeCloseTo(0.75);
    expect(data.perTenant[0]?.tenantId).toBe(tenant.id);
    await app.close();
  });

  it("seedReference populates two white-label tenants end-to-end", async () => {
    const app = build();
    const seeded = await seedReference(app.service);
    expect(seeded.tenantIds).toHaveLength(2);

    const acme = await app.service.tenants.resolveFromHost("acme.dsrvm.app");
    const beta = await app.service.tenants.resolveFromHost("beta.dsrvm.app");
    expect(acme?.name).toBe("Acme Consulting");
    expect(beta?.name).toBe("Beta Retail");

    const overview = await app.service.admin.overview(
      (
        await app.service.auth.login({
          tenantId: acme!.id,
          email: `owner@acme.dsrvm.app`,
          password: "change-me-now",
        })
      ).user,
    );
    expect(overview.tenants).toBe(2);
    expect(
      overview.perTenant.find((t) => t.tenantId === acme!.id)?.publishedItems,
    ).toBe(1);
    expect(
      overview.perTenant.find((t) => t.tenantId === acme!.id)?.monthUsageUsd,
    ).toBeCloseTo(0.75);
    await app.close();
  });

  it("exposes SSO providers and completes an OIDC implicit-flow login over HTTP", async () => {
    const app = build();

    const providers = await app.server.inject({
      method: "GET",
      url: "/api/auth/sso",
    });
    expect(providers.json()).toEqual({
      providers: [{ name: "google", kind: "oidc" }],
    });

    const tenantRes = await app.server.inject({
      method: "POST",
      url: "/api/tenants",
      payload: { name: "Acme", host: "acme.dsrvm.app" },
    });
    const tenantId = (tenantRes.json().tenant as { id: string }).id;

    const login = await app.server.inject({
      method: "GET",
      url: `/api/auth/sso/google/login?tenantId=${tenantId}`,
    });
    expect(login.statusCode).toBe(200);
    const redirect = new URL(login.json().redirectUrl as string);
    const state = redirect.searchParams.get("state") ?? "";
    const nonce = redirect.searchParams.get("nonce") ?? "";
    expect(redirect.searchParams.get("response_type")).toBe("id_token");

    const idToken = signHs256(
      { alg: "HS256", typ: "JWT" },
      {
        iss: "https://accounts.google.com",
        aud: "client-123",
        sub: "sso-user-1",
        email: "sso@acme.dsrvm.app",
        name: "SSO User",
        nonce,
        iat: Math.floor(Date.now() / 1000) - 60,
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
    );
    const callback = await app.server.inject({
      method: "GET",
      url: `/api/auth/sso/google/callback?id_token=${encodeURIComponent(idToken)}&state=${state}`,
    });
    expect(callback.statusCode).toBe(200);
    const body = callback.json();
    expect(body.created).toBe(true);
    expect((body.user as { email: string }).email).toBe("sso@acme.dsrvm.app");

    const me = await app.server.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${body.token as string}` },
    });
    expect(me.json().user.role).toBe("viewer");
    expect(me.json().user.name).toBe("SSO User");
    await app.close();
  });

  it("rejects a forged OIDC callback over HTTP", async () => {
    const app = build();
    const tenantRes = await app.server.inject({
      method: "POST",
      url: "/api/tenants",
      payload: { name: "Acme", host: "acme.dsrvm.app" },
    });
    const tenantId = (tenantRes.json().tenant as { id: string }).id;
    const login = await app.server.inject({
      method: "GET",
      url: `/api/auth/sso/google/login?tenantId=${tenantId}`,
    });
    const state = login.json().state as string;

    const forged = signHs256(
      { alg: "HS256", typ: "JWT" },
      {
        iss: "https://accounts.google.com",
        aud: "client-123",
        sub: "hacker",
        email: "hacker@acme.dsrvm.app",
        nonce: "wrong-nonce",
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
    );
    const callback = await app.server.inject({
      method: "GET",
      url: `/api/auth/sso/google/callback?id_token=${encodeURIComponent(forged)}&state=${state}`,
    });
    expect(callback.statusCode).toBe(401);
    await app.close();
  });

  it("exposes the billing portal and lets owners change their plan", async () => {
    const { app, tenant, token } = await createTenantAndLogin(build());
    const authHeader = { authorization: `Bearer ${token}` };

    const plans = await app.server.inject({
      method: "GET",
      url: "/api/billing/plans",
    });
    expect(plans.statusCode).toBe(200);
    expect(plans.json().plans.map((p: { plan: string }) => p.plan)).toEqual([
      "starter",
      "growth",
      "enterprise",
    ]);
    expect(
      plans.json().plans.map((p: { priceUsd: number }) => p.priceUsd),
    ).toEqual([0, 299, 1499]);

    const portal = await app.server.inject({
      method: "GET",
      url: "/api/billing/portal",
      headers: authHeader,
    });
    expect(portal.statusCode).toBe(200);
    expect(portal.json().statement.tenantId).toBe(tenant.id);
    expect(portal.json().statement.plan).toBe("growth");

    const upgrade = await app.server.inject({
      method: "PATCH",
      url: "/api/billing/plan",
      headers: authHeader,
      payload: { plan: "enterprise" },
    });
    expect(upgrade.statusCode).toBe(200);
    expect(upgrade.json().tenant.plan).toBe("enterprise");

    const badPlan = await app.server.inject({
      method: "PATCH",
      url: "/api/billing/plan",
      headers: authHeader,
      payload: { plan: "platinum" },
    });
    expect(badPlan.statusCode).toBe(400);

    const noAuth = await app.server.inject({
      method: "GET",
      url: "/api/billing/portal",
    });
    expect(noAuth.statusCode).toBe(401);
    await app.close();
  });

  it("denies billing management to viewers via RBAC", async () => {
    const { app, tenant, token } = await createTenantAndLogin(build());
    const signupRes = await app.server.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: {
        tenantId: tenant.id,
        email: "viewer@acme.dsrvm.app",
        password: "x",
        name: "Viewer",
        role: "viewer",
      },
    });
    const viewerToken = signupRes.json().token as string;

    const upgrade = await app.server.inject({
      method: "PATCH",
      url: "/api/billing/plan",
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: { plan: "enterprise" },
    });
    expect(upgrade.statusCode).toBe(403);
    expect(upgrade.json().error).toContain("forbidden");

    const portal = await app.server.inject({
      method: "GET",
      url: "/api/billing/portal",
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(portal.statusCode).toBe(403);
    await app.close();
  });

  it("applies verified billing webhook events and rejects forgeries", async () => {
    const { app, tenant } = await createTenantAndLogin(build());
    const body = JSON.stringify({
      id: "evt_sub_1",
      type: "customer.subscription.updated",
      createdAt: NOW().toISOString(),
      data: { tenantId: tenant.id, plan: "enterprise" },
    });

    const missing = await app.server.inject({
      method: "POST",
      url: "/api/billing/webhooks",
      headers: { "content-type": "application/json" },
      payload: body,
    });
    expect(missing.statusCode).toBe(401);

    const forged = await app.server.inject({
      method: "POST",
      url: "/api/billing/webhooks",
      headers: {
        "content-type": "application/json",
        "x-billing-signature": signWebhook(
          body.replace("enterprise", "starter"),
          NOW().getTime(),
        ),
      },
      payload: body,
    });
    expect(forged.statusCode).toBe(401);

    const ok = await app.server.inject({
      method: "POST",
      url: "/api/billing/webhooks",
      headers: {
        "content-type": "application/json",
        "x-billing-signature": signWebhook(body, NOW().getTime()),
      },
      payload: body,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({
      received: true,
      handled: true,
      replayed: false,
    });
    expect((await app.service.tenants.get(tenant.id))?.plan).toBe("enterprise");

    const replay = await app.server.inject({
      method: "POST",
      url: "/api/billing/webhooks",
      headers: {
        "content-type": "application/json",
        "x-billing-signature": signWebhook(body, NOW().getTime()),
      },
      payload: body,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual({
      received: true,
      handled: false,
      replayed: true,
    });

    const stale = await app.server.inject({
      method: "POST",
      url: "/api/billing/webhooks",
      headers: {
        "content-type": "application/json",
        "x-billing-signature": signWebhook(
          body,
          NOW().getTime() - 6 * 60 * 1000,
        ),
      },
      payload: body,
    });
    expect(stale.statusCode).toBe(401);
    await app.close();
  });
});
