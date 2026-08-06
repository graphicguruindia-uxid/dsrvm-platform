import type { WebReferenceService } from "@dsrvm/web";

export interface ReferenceSeedResult {
  tenantIds: string[];
}

export async function seedReference(
  service: WebReferenceService,
): Promise<ReferenceSeedResult> {
  const tenantIds: string[] = [];

  const acme = await service.bootstrap({
    name: "Acme Consulting",
    host: "acme.dsrvm.app",
  });
  const acmeOwner = (
    await service.auth.login({
      tenantId: acme.id,
      email: `owner@acme.dsrvm.app`,
      password: "change-me-now",
    })
  ).user;
  const editor = (
    await service.auth.signup({
      tenantId: acme.id,
      email: "editor@acme.dsrvm.app",
      password: "change-me-now",
      name: "Acme Editor",
      role: "editor",
    })
  ).user;
  const pricing = await service.cms.createItem({
    tenantId: acme.id,
    slug: "pricing",
    title: "Pricing",
    body: "AI delivery that compounds.",
    actor: editor,
  });
  await service.cms.setStatus({
    tenantId: acme.id,
    id: pricing.id,
    status: "published",
    actor: acmeOwner,
  });
  await service.billing.recordUsage({
    tenantId: acme.id,
    task: "screening",
    model: "gpt-4o-mini",
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
  });
  tenantIds.push(acme.id);

  const beta = await service.bootstrap({
    name: "Beta Retail",
    host: "beta.dsrvm.app",
  });
  const betaOwner = (
    await service.auth.login({
      tenantId: beta.id,
      email: `owner@beta.dsrvm.app`,
      password: "change-me-now",
    })
  ).user;
  await service.cms.createItem({
    tenantId: beta.id,
    slug: "catalog",
    title: "Catalog",
    body: "Products, 100% white-label.",
    actor: betaOwner,
  });
  tenantIds.push(beta.id);

  return { tenantIds };
}
