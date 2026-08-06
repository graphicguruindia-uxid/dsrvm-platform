import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { createWebReferenceService } from "../index.js";
import type { WebStore } from "../store.js";
import { createPgWebStore, type WebDatabase } from "./pg-store.js";

const AT = "2026-08-04T00:00:00.000Z";

const DDL = `
CREATE TABLE tenants (
  id text PRIMARY KEY,
  name text NOT NULL,
  hosts jsonb NOT NULL,
  plan text NOT NULL,
  created_at text NOT NULL
);
CREATE TABLE users (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  name text NOT NULL,
  role text NOT NULL,
  created_at text NOT NULL
);
CREATE INDEX users_tenant_idx ON users (tenant_id);
CREATE UNIQUE INDEX users_tenant_email_idx ON users (tenant_id, email);
CREATE TABLE sessions (
  token text PRIMARY KEY,
  user_id text NOT NULL,
  tenant_id text NOT NULL,
  role text NOT NULL,
  expires_at text NOT NULL,
  created_at text NOT NULL
);
CREATE INDEX sessions_tenant_idx ON sessions (tenant_id);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE TABLE content_items (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  slug text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  status text NOT NULL,
  published_at text,
  updated_by text NOT NULL,
  updated_at text NOT NULL,
  created_at text NOT NULL
);
CREATE INDEX content_tenant_idx ON content_items (tenant_id);
CREATE UNIQUE INDEX content_tenant_slug_idx ON content_items (tenant_id, slug);
CREATE TABLE usage_records (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  task text NOT NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL,
  output_tokens integer NOT NULL,
  est_cost_usd double precision NOT NULL,
  at text NOT NULL
);
CREATE INDEX usage_tenant_idx ON usage_records (tenant_id);
CREATE INDEX usage_at_idx ON usage_records (at);
`;

async function createTestDb(): Promise<{
  store: WebStore;
  db: WebDatabase;
  pg: PGlite;
}> {
  const pg = new PGlite();
  await pg.exec(DDL);
  const db = drizzle(pg) as unknown as WebDatabase;
  return { store: createPgWebStore(db), db, pg };
}

describe("PgWebStore persistence (pglite)", () => {
  const instances: PGlite[] = [];
  let pg: PGlite;
  let store: WebStore;

  beforeEach(async () => {
    ({ store, pg } = await createTestDb());
    instances.push(pg);
  });

  afterAll(async () => {
    for (const instance of instances) {
      await instance.close();
    }
  });

  it("runs the full web flow (bootstrap, auth, CMS, billing) through real Postgres", async () => {
    const service = createWebReferenceService(store, () => new Date(AT));

    const acme = await service.bootstrap({
      name: "Acme Consulting",
      host: "acme.dsrvm.app",
    });
    expect(acme.hosts).toEqual(["acme.dsrvm.app"]);

    const resolved = await service.tenants.resolveFromHost("acme.dsrvm.app");
    expect(resolved?.id).toBe(acme.id);
    expect(await service.tenants.resolveFromHost("other.app")).toBeNull();

    const owner = await service.auth.login({
      tenantId: acme.id,
      email: `owner@acme.dsrvm.app`,
      password: "change-me-now",
    });
    expect(owner.user.role).toBe("owner");

    const item = await service.cms.createItem({
      tenantId: acme.id,
      slug: "pricing",
      title: "Pricing",
      body: "AI delivery that compounds.",
      actor: owner.user,
    });
    const published = await service.cms.setStatus({
      tenantId: acme.id,
      id: item.id,
      status: "published",
      actor: owner.user,
    });
    expect(published.status).toBe("published");
    expect(published.publishedAt).toBe(AT);

    await service.billing.recordUsage({
      tenantId: acme.id,
      task: "screening",
      model: "gpt-4o-mini",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(await service.billing.monthUsageUsd(acme.id)).toBeCloseTo(0.75);

    const overview = await service.admin.overview(owner.user);
    expect(overview.tenants).toBe(1);
    expect(overview.users).toBe(1);
    expect(overview.contentItems).toBe(1);
    expect(overview.usageRecords).toBe(1);
    expect(overview.monthUsageUsd).toBeCloseTo(0.75);
  });

  it("enforces tenant/email uniqueness and cross-tenant content isolation", async () => {
    const service = createWebReferenceService(store, () => new Date(AT));
    const acme = await service.bootstrap({
      name: "Acme",
      host: "acme.dsrvm.app",
    });
    const beta = await service.bootstrap({
      name: "Beta",
      host: "beta.dsrvm.app",
    });

    await service.auth.signup({
      tenantId: acme.id,
      email: "same@x.com",
      password: "a",
      name: "A",
    });
    await service.auth.signup({
      tenantId: beta.id,
      email: "same@x.com",
      password: "a",
      name: "B",
    });
    await expect(
      service.auth.signup({
        tenantId: acme.id,
        email: "same@x.com",
        password: "a",
        name: "A",
      }),
    ).rejects.toThrow("already exists");

    const acmeOwner = await service.auth.login({
      tenantId: acme.id,
      email: "owner@acme.dsrvm.app",
      password: "change-me-now",
    });
    const betaOwner = await service.auth.login({
      tenantId: beta.id,
      email: "owner@beta.dsrvm.app",
      password: "change-me-now",
    });

    await service.cms.createItem({
      tenantId: acme.id,
      slug: "pricing",
      title: "Pricing",
      body: "x",
      actor: acmeOwner.user,
    });
    expect(await service.cms.list(acme.id)).toHaveLength(1);
    expect(await service.cms.list(beta.id)).toHaveLength(0);
    expect(await service.cms.getBySlug(acme.id, "pricing")).toBeNull();
    expect(await service.cms.getBySlug(beta.id, "pricing")).toBeNull();

    await service.cms.setStatus({
      tenantId: acme.id,
      id: (await service.cms.list(acme.id))[0]!.id,
      status: "published",
      actor: acmeOwner.user,
    });
    expect((await service.cms.getBySlug(acme.id, "pricing"))?.title).toBe(
      "Pricing",
    );
    expect(await service.cms.getBySlug(beta.id, "pricing")).toBeNull();

    await expect(
      service.cms.createItem({
        tenantId: acme.id,
        slug: "pricing",
        title: "Pricing",
        body: "b",
        actor: acmeOwner.user,
      }),
    ).rejects.toThrow("already exists");

    await expect(
      service.cms.createItem({
        tenantId: beta.id,
        slug: "x",
        title: "X",
        body: "x",
        actor: acmeOwner.user,
      }),
    ).rejects.toThrow("cross-tenant");
    await expect(
      service.cms.setStatus({
        tenantId: acme.id,
        id: "missing",
        status: "published",
        actor: betaOwner.user,
      }),
    ).rejects.toThrow("cross-tenant");
  });

  it("persists across store instances (survives reconnect)", async () => {
    const service = createWebReferenceService(store, () => new Date(AT));
    const acme = await service.bootstrap({
      name: "Acme",
      host: "acme.dsrvm.app",
    });
    const owner = await service.auth.login({
      tenantId: acme.id,
      email: "owner@acme.dsrvm.app",
      password: "change-me-now",
    });
    await service.cms.createItem({
      tenantId: acme.id,
      slug: "pricing",
      title: "Pricing",
      body: "x",
      actor: owner.user,
    });

    const secondStore = createPgWebStore(drizzle(pg) as unknown as WebDatabase);
    const tenants = await secondStore.listTenants();
    expect(tenants.some((t) => t.name === "Acme")).toBe(true);
    const users = await secondStore.getUsersByTenant(acme.id);
    expect(users).toHaveLength(1);
    const content = await secondStore.listContentByTenant(acme.id);
    expect(content).toHaveLength(1);
    expect(content[0]?.slug).toBe("pricing");
  });

  it("round-trips usage records and resolves hosts after reassignment", async () => {
    const service = createWebReferenceService(store, () => new Date(AT));
    const acme = await service.bootstrap({
      name: "Acme",
      host: "acme.dsrvm.app",
    });
    const moved = await service.tenants.setHosts(acme.id, ["acme.com"]);
    expect(moved.hosts).toEqual(["acme.com"]);
    expect(await service.tenants.resolveFromHost("acme.dsrvm.app")).toBeNull();
    expect((await service.tenants.resolveFromHost("acme.com"))?.id).toBe(
      acme.id,
    );

    await service.billing.recordUsage({
      tenantId: acme.id,
      task: "screening",
      model: "gpt-4o-mini",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    const usage = await service.billing.usage(acme.id);
    expect(usage).toHaveLength(1);
    expect(usage[0]?.estCostUsd).toBeCloseTo(0.75);
    expect(usage[0]?.at).toBe(AT);
  });
});
