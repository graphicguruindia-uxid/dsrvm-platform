import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { createWebReferenceService } from "../index.js";
import { createPgWebStore, type WebDatabase } from "./pg-store.js";

const AT = "2026-08-04T00:00:00.000Z";

function migrationFiles(): string[] {
  const dir = fileURLToPath(new URL("../../drizzle", import.meta.url));
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => path.join(dir, f));
}

async function applyMigrations(pg: PGlite): Promise<string[]> {
  const applied: string[] = [];
  for (const file of migrationFiles()) {
    const sql = fs.readFileSync(file, "utf8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await pg.exec(statement);
    }
    applied.push(path.basename(file));
  }
  return applied;
}

describe("web drizzle migrations", () => {
  const instances: PGlite[] = [];

  afterAll(async () => {
    for (const instance of instances) {
      await instance.close();
    }
  });

  it("applies every migration file and runs the full flow on the migrated schema", async () => {
    const pg = new PGlite();
    instances.push(pg);
    const applied = await applyMigrations(pg);
    expect(applied.length).toBeGreaterThan(0);

    const store = createPgWebStore(drizzle(pg) as unknown as WebDatabase);
    const service = createWebReferenceService(store, () => new Date(AT));

    const boot = await service.bootstrap({
      name: "Acme",
      host: "acme.dsrvm.app",
      preferredCMS: "wordpress",
      preferredAIService: "gemini",
    });
    expect(boot.tenant.preferredCMS).toBe("wordpress");
    expect(boot.tenant.preferredAIService).toBe("gemini");

    const owner = await service.invites.accept({
      token: boot.inviteToken,
      name: "Owner",
      password: "change-me-now",
    });
    expect(owner.user.role).toBe("owner");

    const events = await service.audit.list({
      tenantId: boot.tenant.id,
      actor: owner.user,
    });
    expect(events.some((e) => e.action === "tenant.create")).toBe(true);

    const item = await service.cms.createItem({
      tenantId: boot.tenant.id,
      slug: "pricing",
      title: "Pricing",
      body: "x",
      actor: owner.user,
    });
    expect(item.id).toBeTruthy();
    expect(await store.listInvitesByTenant(boot.tenant.id)).toHaveLength(0);
  });
});
