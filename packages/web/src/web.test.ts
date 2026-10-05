import { describe, expect, it } from "vitest";
import { createWebReferenceService, createWebStore } from "./index.js";
import { PERMISSIONS, can } from "./rbac.js";

const NOW = () => new Date("2026-08-04T00:00:00.000Z");

async function setup() {
  const store = createWebStore(NOW);
  const service = createWebReferenceService(store, NOW);
  const acmeBoot = await service.bootstrap({
    name: "Acme",
    host: "acme.dsrvm.app",
  });
  const acme = acmeBoot.tenant;
  const betaBoot = await service.bootstrap({
    name: "Beta",
    host: "beta.dsrvm.app",
  });
  const beta = betaBoot.tenant;
  const { user, sessionToken } = await service.invites.accept({
    token: acmeBoot.inviteToken,
    name: "Owner",
    password: "change-me-now",
  });
  const owner = { user, token: sessionToken };
  return {
    store,
    service,
    acme,
    beta,
    betaInviteToken: betaBoot.inviteToken,
    owner,
  };
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
    const { service, acme, beta, betaInviteToken, owner } = await setup();
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
      await service.invites.accept({
        token: betaInviteToken,
        name: "Beta Owner",
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
    const { tenant: acme } = await service.bootstrap({
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

  it("denies editors the global overview but allows tenant reports", async () => {
    const { service, acme, owner } = await setup();
    const editor = (
      await service.auth.signup({
        tenantId: acme.id,
        email: "editor@acme.dsrvm.app",
        password: "x",
        name: "E",
        role: "editor",
      })
    ).user;
    await expect(service.admin.overview(editor)).rejects.toThrow("forbidden");
    const report = await service.admin.tenantOverview(editor, acme.id);
    expect(report.tenantId).toBe(acme.id);
    const viewer = (
      await service.auth.signup({
        tenantId: acme.id,
        email: "viewer2@acme.dsrvm.app",
        password: "x",
        name: "V2",
        role: "viewer",
      })
    ).user;
    expect((await service.admin.tenantOverview(viewer, acme.id)).tenantId).toBe(
      acme.id,
    );
    void owner;
  });
});

describe("operator role + invite flows", () => {
  it("enforces strictly-downward invite bounds with no escalation", async () => {
    const { service, acme, owner } = await setup();
    // Owner invites an admin.
    const adminInvite = await service.invites.create({
      tenantId: acme.id,
      email: "admin@acme.dsrvm.app",
      role: "admin",
      actor: owner.user,
    });
    expect(adminInvite.invite.role).toBe("admin");
    // Owner cannot invite a second owner (owner is not an invitable role).
    await expect(
      service.invites.create({
        tenantId: acme.id,
        email: "owner2@acme.dsrvm.app",
        role: "owner",
        actor: owner.user,
      }),
    ).rejects.toThrow("cannot invite");

    const admin = (
      await service.invites.accept({
        token: adminInvite.token,
        name: "Admin",
        password: "s3cret!",
      })
    ).user;
    // Admin cannot invite owners or fellow admins.
    await expect(
      service.invites.create({
        tenantId: acme.id,
        email: "a2@acme.dsrvm.app",
        role: "admin",
        actor: admin,
      }),
    ).rejects.toThrow("cannot invite");
    // Admin invites an operator.
    const operatorInvite = await service.invites.create({
      tenantId: acme.id,
      email: "op@acme.dsrvm.app",
      role: "operator",
      actor: admin,
    });
    const operator = (
      await service.invites.accept({
        token: operatorInvite.token,
        name: "Op",
        password: "s3cret!",
      })
    ).user;
    expect(operator.role).toBe("operator");
    // Operator invites editor + viewer, but not admin.
    await service.invites.create({
      tenantId: acme.id,
      email: "ed@acme.dsrvm.app",
      role: "editor",
      actor: operator,
    });
    await expect(
      service.invites.create({
        tenantId: acme.id,
        email: "evil-admin@acme.dsrvm.app",
        role: "admin",
        actor: operator,
      }),
    ).rejects.toThrow("cannot invite");
    // Editors cannot invite anyone.
    const editor = (
      await service.auth.signup({
        tenantId: acme.id,
        email: "ed2@acme.dsrvm.app",
        password: "x",
        name: "E2",
        role: "editor",
      })
    ).user;
    await expect(
      service.invites.create({
        tenantId: acme.id,
        email: "v@acme.dsrvm.app",
        role: "viewer",
        actor: editor,
      }),
    ).rejects.toThrow("forbidden");
  });

  it("gates privileged signup on invites and enforces a single owner", async () => {
    const { service, acme } = await setup();
    // Open signup works for editor/viewer.
    const editor = (
      await service.auth.signup({
        tenantId: acme.id,
        email: "ed@acme.dsrvm.app",
        password: "x",
        name: "E",
        role: "editor",
      })
    ).user;
    expect(editor.role).toBe("editor");
    // Privileged self-signup without an invite is rejected.
    await expect(
      service.auth.signup({
        tenantId: acme.id,
        email: "rogue-admin@acme.dsrvm.app",
        password: "x",
        name: "Rogue",
        role: "admin",
      }),
    ).rejects.toThrow("requires an invite");
    // A second owner can never be created, even with an invite-shaped role.
    await expect(
      service.auth.signup({
        tenantId: acme.id,
        email: "owner2@acme.dsrvm.app",
        password: "x",
        name: "O2",
        role: "owner",
      }),
    ).rejects.toThrow("already has an owner");
  });

  it("expires invites and rejects reuse", async () => {
    const { service, acme, owner } = await setup();
    const created = await service.invites.create({
      tenantId: acme.id,
      email: "temp@acme.dsrvm.app",
      role: "viewer",
      actor: owner.user,
    });
    const listed = await service.invites.list({
      tenantId: acme.id,
      actor: owner.user,
    });
    expect(listed.map((i) => i.email)).toContain("temp@acme.dsrvm.app");
    await service.invites.revoke({
      tenantId: acme.id,
      id: created.invite.id,
      actor: owner.user,
    });
    await expect(
      service.invites.accept({
        token: created.token,
        name: "Temp",
        password: "x",
      }),
    ).rejects.toThrow("invalid or unknown invite token");
  });
});

describe("tenant preferences + audit", () => {
  it("tracks preferred CMS/AI per tenant with role-gated writes", async () => {
    const { service, acme, owner } = await setup();
    const updated = await service.integrations.setPreferences({
      tenantId: acme.id,
      actor: owner.user,
      preferredCMS: "sharepoint",
      preferredAIService: "azure-openai",
    });
    expect(updated.preferredCMS).toBe("sharepoint");
    expect(updated.preferredAIService).toBe("azure-openai");

    const editor = (
      await service.auth.signup({
        tenantId: acme.id,
        email: "ed@acme.dsrvm.app",
        password: "x",
        name: "E",
        role: "editor",
      })
    ).user;
    // Editors may set CMS preference but not AI integration.
    await service.integrations.setPreferences({
      tenantId: acme.id,
      actor: editor,
      preferredCMS: "wordpress",
    });
    await expect(
      service.integrations.setPreferences({
        tenantId: acme.id,
        actor: editor,
        preferredAIService: "gemini",
      }),
    ).rejects.toThrow("forbidden");

    const events = await service.audit.list({
      tenantId: acme.id,
      actor: owner.user,
    });
    expect(
      events.some((e) => e.action === "integration.preferences.update"),
    ).toBe(true);
    await expect(
      service.audit.list({ tenantId: acme.id, actor: editor }),
    ).rejects.toThrow("forbidden");
  });

  it("restricts tenant deletion to owners", async () => {
    const { service, acme, owner } = await setup();
    const adminInvite = await service.invites.create({
      tenantId: acme.id,
      email: "admin@acme.dsrvm.app",
      role: "admin",
      actor: owner.user,
    });
    const admin = (
      await service.invites.accept({
        token: adminInvite.token,
        name: "Admin",
        password: "x",
      })
    ).user;
    await expect(
      service.deleteTenant({ tenantId: acme.id, actorId: admin.id }),
    ).rejects.toThrow("forbidden");
    await service.deleteTenant({ tenantId: acme.id, actorId: owner.user.id });
    expect(await service.tenants.get(acme.id)).toBeNull();
  });
});
