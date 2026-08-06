import { describe, expect, it } from "vitest";
import { createWebReferenceService, createWebStore } from "./index.js";
import { PERMISSIONS, can } from "./rbac.js";

const NOW = () => new Date("2026-08-04T00:00:00.000Z");

async function setup() {
  const store = createWebStore(NOW);
  const service = createWebReferenceService(store, NOW);
  const acme = await service.bootstrap({
    name: "Acme",
    host: "acme.dsrvm.app",
  });
  const beta = await service.bootstrap({
    name: "Beta",
    host: "beta.dsrvm.app",
  });
  const owner = await service.auth.login({
    tenantId: acme.id,
    email: `owner@acme.dsrvm.app`,
    password: "change-me-now",
  });
  return { store, service, acme, beta, owner };
}

describe("tenants (multi-tenancy)", () => {
  it("resolves tenants from white-label hosts", async () => {
    const { service, acme, beta } = await setup();
    expect((await service.tenants.resolveFromHost("acme.dsrvm.app"))?.id).toBe(
      acme.id,
    );
    expect((await service.tenants.resolveFromHost("beta.dsrvm.app"))?.id).toBe(
      beta.id,
    );
    expect(await service.tenants.resolveFromHost("unknown.app")).toBeNull();
    expect(
      (await service.tenants.resolveFromHost("acme.dsrvm.app:3000"))?.id,
    ).toBe(acme.id);
  });

  it("rejects duplicate hosts and supports reassignment", async () => {
    const { service, acme } = await setup();
    await expect(
      service.tenants.create({ name: "Squatter", hosts: ["acme.dsrvm.app"] }),
    ).rejects.toThrow("already assigned");
    const moved = await service.tenants.setHosts(acme.id, ["acme.com"]);
    expect(moved.hosts).toEqual(["acme.com"]);
    expect(await service.tenants.resolveFromHost("acme.dsrvm.app")).toBeNull();
    expect((await service.tenants.resolveFromHost("acme.com"))?.id).toBe(
      acme.id,
    );
  });
});

describe("auth + RBAC", () => {
  it("signs up, logs in, authenticates and logs out", async () => {
    const { service, acme } = await setup();
    const signup = await service.auth.signup({
      tenantId: acme.id,
      email: "editor@acme.dsrvm.app",
      password: "s3cret!",
      name: "Editor",
      role: "editor",
    });
    expect(signup.user.role).toBe("editor");
    expect(signup.token).toBeTruthy();

    const session = await service.auth.authenticate(signup.token);
    expect(session?.userId).toBe(signup.user.id);
    expect((await service.auth.getUser(session!))?.name).toBe("Editor");

    await service.auth.logout(signup.token);
    expect(await service.auth.authenticate(signup.token)).toBeNull();
  });

  it("isolates emails per tenant", async () => {
    const { service, acme, beta } = await setup();
    await service.auth.signup({
      tenantId: acme.id,
      email: "same@x.com",
      password: "a",
      name: "A",
    });
    const second = await service.auth.signup({
      tenantId: beta.id,
      email: "same@x.com",
      password: "a",
      name: "B",
    });
    expect(second.user.id).toBeTruthy();
    await expect(
      service.auth.signup({
        tenantId: acme.id,
        email: "same@x.com",
        password: "a",
        name: "A",
      }),
    ).rejects.toThrow("already exists");
  });

  it("rejects bad credentials", async () => {
    const { service, acme } = await setup();
    await expect(
      service.auth.login({
        tenantId: acme.id,
        email: "owner@acme.dsrvm.app",
        password: "wrong",
      }),
    ).rejects.toThrow("invalid credentials");
  });

  it("enforces the role matrix", async () => {
    const { service, acme, owner } = await setup();
    const viewer = (
      await service.auth.signup({
        tenantId: acme.id,
        email: "viewer@acme.dsrvm.app",
        password: "x",
        name: "V",
        role: "viewer",
      })
    ).user;
    expect(can(owner.user, PERMISSIONS.cmsEdit)).toBe(true);
    expect(can(viewer, PERMISSIONS.cmsEdit)).toBe(false);
    expect(can(viewer, PERMISSIONS.cmsView)).toBe(true);
  });
});

describe("CMS", () => {
  it("creates and publishes content within tenant scope", async () => {
    const { service, acme, owner } = await setup();
    const item = await service.cms.createItem({
      tenantId: acme.id,
      slug: "pricing",
      title: "Pricing",
      body: "Trusted AI delivery.",
      actor: owner.user,
    });
    expect(item.status).toBe("draft");
    expect(await service.cms.getBySlug(acme.id, "pricing")).toBeNull();

    const published = await service.cms.setStatus({
      tenantId: acme.id,
      id: item.id,
      status: "published",
      actor: owner.user,
    });
    expect(published.publishedAt).toBe(NOW().toISOString());
    expect((await service.cms.getBySlug(acme.id, "pricing"))?.title).toBe(
      "Pricing",
    );
  });

  it("rejects cross-tenant reads/writes and duplicate slugs", async () => {
    const { service, acme, beta, owner } = await setup();
    await service.cms.createItem({
      tenantId: acme.id,
      slug: "pricing",
      title: "Pricing",
      body: "a",
      actor: owner.user,
    });
    await expect(
      service.cms.createItem({
        tenantId: acme.id,
        slug: "pricing",
        title: "Pricing",
        body: "b",
        actor: owner.user,
      }),
    ).rejects.toThrow("already exists");

    const betaOwner = (
      await service.auth.login({
        tenantId: beta.id,
        email: `owner@beta.dsrvm.app`,
        password: "change-me-now",
      })
    ).user;
    await expect(
      service.cms.createItem({
        tenantId: beta.id,
        slug: "x",
        title: "X",
        body: "x",
        actor: owner.user,
      }),
    ).rejects.toThrow("cross-tenant");
    await expect(
      service.cms.setStatus({
        tenantId: acme.id,
        id: "missing",
        status: "published",
        actor: betaOwner,
      }),
    ).rejects.toThrow("cross-tenant");
  });
});

describe("billing hooks", () => {
  it("meters AI usage per tenant with cost from the pricing table", async () => {
    const { service, acme, beta } = await setup();
    await service.billing.recordUsage({
      tenantId: acme.id,
      task: "screening",
      model: "gpt-4o-mini",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    await service.billing.recordUsage({
      tenantId: beta.id,
      task: "screening",
      model: "gpt-4o-mini",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(await service.billing.usage(acme.id)).toHaveLength(1);
    expect((await service.billing.usage(acme.id))[0]!.estCostUsd).toBeCloseTo(
      0.75,
    );
    expect(await service.billing.remainingAiBudgetUsd(acme.id)).toBeCloseTo(
      500 - 0.75,
    );
    expect(await service.billing.usage()).toHaveLength(2);
  });

  it("exposes plan limits by tenant plan", async () => {
    const { service, acme } = await setup();
    expect((await service.billing.planLimits(acme.id)).seats).toBe(25);
  });

  it("lists the plan catalog and applies plan changes", async () => {
    const { service, acme } = await setup();
    const plans = service.billing.plans();
    expect(plans.map((p) => p.plan)).toEqual([
      "starter",
      "growth",
      "enterprise",
    ]);
    expect(plans.map((p) => p.priceUsd)).toEqual([0, 299, 1499]);
    const upgraded = await service.billing.setPlan({
      tenantId: acme.id,
      plan: "enterprise",
    });
    expect(upgraded.plan).toBe("enterprise");
    expect((await service.billing.planLimits(acme.id)).seats).toBe(Infinity);
    await expect(
      service.billing.setPlan({ tenantId: acme.id, plan: "platinum" as never }),
    ).rejects.toThrow("unknown plan");
  });

  it("builds a usage report and a statement for the month", async () => {
    const { service, acme } = await setup();
    await service.billing.recordUsage({
      tenantId: acme.id,
      task: "screening",
      model: "gpt-4o-mini",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    await service.billing.recordUsage({
      tenantId: acme.id,
      task: "summary",
      model: "gpt-4o-mini",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    const report = await service.billing.usageReport(acme.id);
    expect(report.period).toBe("2026-08");
    expect(report.totalRecords).toBe(2);
    expect(report.totalUsd).toBeCloseTo(1.5);
    expect(report.byTask.map((t) => t.task).sort()).toEqual([
      "screening",
      "summary",
    ]);
    expect(report.byModel[0]).toMatchObject({ model: "gpt-4o-mini" });

    const statement = await service.billing.statement(acme.id);
    expect(statement.plan).toBe("growth");
    expect(statement.planFeeUsd).toBe(299);
    expect(statement.usageCostUsd).toBeCloseTo(1.5);
    expect(statement.totalUsd).toBeCloseTo(300.5);
    expect(statement.remainingAiBudgetUsd).toBeCloseTo(498.5);
  });
});

describe("billing webhook seam", () => {
  async function webhookSetup() {
    const store = createWebStore(NOW);
    const service = createWebReferenceService(store, {
      now: NOW,
      billingWebhookSecret: "test-webhook-secret",
    });
    const acme = await service.bootstrap({
      name: "Acme",
      host: "acme.dsrvm.app",
    });
    return { store, service, acme, webhook: service.billingWebhook! };
  }

  function subscriptionUpdated(tenantId: string, plan: string, id = "evt_1") {
    return {
      id,
      type: "customer.subscription.updated",
      createdAt: NOW().toISOString(),
      data: { tenantId, plan },
    };
  }

  function paymentFailed(tenantId: string, id = "evt_2") {
    return {
      id,
      type: "invoice.payment_failed",
      createdAt: NOW().toISOString(),
      data: { tenantId },
    };
  }

  it("signs and verifies Stripe-style HMAC signatures", async () => {
    const { webhook } = await webhookSetup();
    const body = JSON.stringify(subscriptionUpdated("t1", "growth"));
    const signature = webhook.sign(body);
    expect(signature).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
    expect(webhook.verify(signature, body)).toBe(true);
    expect(webhook.verify(signature, body.replace("growth", "starter"))).toBe(
      false,
    );
    expect(webhook.verify(signature.replace("v1=", "v1=deadbeef"), body)).toBe(
      false,
    );
    const stale = webhook.sign(body, NOW().getTime() - 10 * 60 * 1000 - 1);
    expect(webhook.verify(stale, body, NOW().getTime())).toBe(false);
  });

  it("applies plan upgrades from verified subscription events", async () => {
    const { service, acme, webhook } = await webhookSetup();
    const result = await webhook.handleEvent(
      subscriptionUpdated(acme.id, "enterprise"),
    );
    expect(result).toEqual({ handled: true, replayed: false });
    expect((await service.tenants.get(acme.id))?.plan).toBe("enterprise");
  });

  it("records payment failure flags per tenant", async () => {
    const { acme, webhook } = await webhookSetup();
    await webhook.handleEvent(paymentFailed(acme.id));
    const flags = await webhook.flags(acme.id);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({
      tenantId: acme.id,
      reason: "invoice.payment_failed",
    });
    expect(await webhook.flags("other-tenant")).toEqual([]);
  });

  it("ignores unknown event types and replays dedupe by event id", async () => {
    const { service, acme, webhook } = await webhookSetup();
    const ignored = await webhook.handleEvent({
      id: "evt_other",
      type: "customer.updated",
      createdAt: NOW().toISOString(),
      data: { tenantId: acme.id },
    });
    expect(ignored).toEqual({ handled: false, replayed: false });
    expect((await service.tenants.get(acme.id))?.plan).toBe("growth");

    const first = await webhook.handleEvent(
      subscriptionUpdated(acme.id, "starter", "evt_repeat"),
    );
    const second = await webhook.handleEvent(
      subscriptionUpdated(acme.id, "enterprise", "evt_repeat"),
    );
    expect(first).toEqual({ handled: true, replayed: false });
    expect(second).toEqual({ handled: false, replayed: true });
    expect((await service.tenants.get(acme.id))?.plan).toBe("starter");
  });

  it("rejects malformed webhook events", async () => {
    const { acme, webhook } = await webhookSetup();
    await expect(
      webhook.handleEvent({
        ...subscriptionUpdated(acme.id, "growth"),
        data: {},
      }),
    ).rejects.toThrow("requires data.tenantId");
    await expect(
      webhook.handleEvent(subscriptionUpdated(acme.id, "platinum")),
    ).rejects.toThrow("unknown plan");
    await expect(
      webhook.handleEvent(paymentFailed("ghost-tenant")),
    ).rejects.toThrow("not found");
  });
});

describe("admin console skeleton", () => {
  it("gives owners a tenant-scoped overview and denies viewers", async () => {
    const { service, acme, owner, beta } = await setup();
    await service.cms.createItem({
      tenantId: acme.id,
      slug: "pricing",
      title: "Pricing",
      body: "x",
      actor: owner.user,
    });
    const overview = await service.admin.overview(owner.user);
    expect(overview.tenants).toBe(2);
    expect(overview.perTenant.find((t) => t.tenantId === acme.id)?.users).toBe(
      1,
    );
    expect(
      overview.perTenant.find((t) => t.tenantId === beta.id)?.monthUsageUsd,
    ).toBe(0);

    const viewer = (
      await service.auth.signup({
        tenantId: acme.id,
        email: "viewer@acme.dsrvm.app",
        password: "x",
        name: "V",
        role: "viewer",
      })
    ).user;
    await expect(service.admin.overview(viewer)).rejects.toThrow("forbidden");
  });
});
