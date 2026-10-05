import type { AiServiceKind, CmsKind, Tenant, User } from "./types.js";
import type { WebStore } from "./store.js";
import { PERMISSIONS, requirePermission } from "./rbac.js";

export const CMS_REGISTRY: Record<
  CmsKind,
  { label: string; auth: "bearer" | "basic" | "none"; docs: string }
> = {
  sharepoint: {
    label: "Microsoft SharePoint",
    auth: "bearer",
    docs: "SharePoint REST API (/_api/web)",
  },
  sitecore: {
    label: "Sitecore XM / XP Services",
    auth: "bearer",
    docs: "Sitecore Services Client / Layout Service",
  },
  aem: {
    label: "Adobe Experience Manager",
    auth: "basic",
    docs: "AEM Assets / Sling REST",
  },
  umbraco: {
    label: "Umbraco",
    auth: "bearer",
    docs: "Umbraco Management / Delivery API",
  },
  dotnetnuke: {
    label: "DotNetNuke (DNN)",
    auth: "bearer",
    docs: "DNN Services Framework REST",
  },
  wordpress: {
    label: "WordPress",
    auth: "bearer",
    docs: "WordPress REST API (/wp-json/wp/v2)",
  },
  opencms: {
    label: "OpenCms",
    auth: "basic",
    docs: "OpenCms REST / CaaS",
  },
  custom: { label: "Custom REST CMS", auth: "bearer", docs: "Generic REST" },
  none: {
    label: "No external CMS",
    auth: "none",
    docs: "Built-in content only",
  },
};

export const AI_SERVICE_REGISTRY: Record<
  AiServiceKind,
  { label: string; apiKeyEnvVar: string; baseEnvVar?: string }
> = {
  "azure-openai": {
    label: "Azure OpenAI",
    apiKeyEnvVar: "AZURE_OPENAI_API_KEY",
    baseEnvVar: "AZURE_OPENAI_ENDPOINT",
  },
  openai: { label: "OpenAI", apiKeyEnvVar: "OPENAI_API_KEY" },
  gemini: { label: "Google Gemini", apiKeyEnvVar: "GEMINI_API_KEY" },
  copilot: {
    label: "Microsoft Copilot (Azure OpenAI compatible)",
    apiKeyEnvVar: "COPILOT_API_KEY",
    baseEnvVar: "COPILOT_ENDPOINT",
  },
  anthropic: { label: "Anthropic", apiKeyEnvVar: "ANTHROPIC_API_KEY" },
  none: { label: "No AI service", apiKeyEnvVar: "" },
};

export type CmsFetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export interface CmsConnection {
  kind: Exclude<CmsKind, "none">;
  endpoint: string;
  token?: string;
  username?: string;
  password?: string;
}

export interface NormalizedCmsItem {
  externalId: string;
  slug: string;
  title: string;
  body: string;
}

export interface CmsConnector {
  readonly kind: CmsKind;
  listItems(connection: CmsConnection): Promise<NormalizedCmsItem[]>;
  getItem(
    connection: CmsConnection,
    id: string,
  ): Promise<NormalizedCmsItem | null>;
}

export interface AiProviderResolution {
  provider: AiServiceKind;
  model: string;
  baseUrl?: string;
  apiKeyEnvVar: string;
}

function authHeaders(connection: CmsConnection): Record<string, string> {
  const meta = CMS_REGISTRY[connection.kind];
  if (meta.auth === "bearer" && connection.token) {
    return { authorization: `Bearer ${connection.token}` };
  }
  if (
    meta.auth === "basic" &&
    connection.username !== undefined &&
    connection.password !== undefined
  ) {
    const encoded = Buffer.from(
      `${connection.username}:${connection.password}`,
    ).toString("base64");
    return { authorization: `Basic ${encoded}` };
  }
  return {};
}

function joinUrl(endpoint: string, path: string): string {
  const base = endpoint.replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function kindPaths(kind: CmsKind): {
  list: string;
  item: (id: string) => string;
} {
  switch (kind) {
    case "sharepoint":
      return {
        list: "/_api/web/lists/getbytitle('Pages')/items?$select=Id,Title",
        item: (id) => `/_api/web/lists/getbytitle('Pages')/items(${id})`,
      };
    case "wordpress":
      return {
        list: "/wp-json/wp/v2/pages?per_page=100&_fields=id,slug,title,content",
        item: (id) => `/wp-json/wp/v2/pages/${id}`,
      };
    case "sitecore":
      return {
        list: "/sitecore/api/layout/render/jss?item=/&sc_lang=en",
        item: (id) =>
          `/sitecore/api/layout/render/jss?item=${encodeURIComponent(id)}&sc_lang=en`,
      };
    default:
      return {
        list: "/api/content",
        item: (id) => `/api/content/${encodeURIComponent(id)}`,
      };
  }
}

function normalize(kind: CmsKind, raw: unknown): NormalizedCmsItem | null {
  const record = raw as Record<string, unknown>;
  if (!record || typeof record !== "object") return null;
  if (kind === "wordpress") {
    const id = String(record.id ?? "");
    if (!id) return null;
    const title = record.title as { rendered?: string } | string | undefined;
    const content = record.content as
      { rendered?: string } | string | undefined;
    return {
      externalId: id,
      slug: String(record.slug ?? id),
      title: typeof title === "string" ? title : (title?.rendered ?? id),
      body: typeof content === "string" ? content : (content?.rendered ?? ""),
    };
  }
  if (kind === "sharepoint") {
    const id = String(record.Id ?? record.id ?? "");
    if (!id) return null;
    return {
      externalId: id,
      slug: String(record.Title ?? id)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-"),
      title: String(record.Title ?? id),
      body: String(record.Body ?? record.Description ?? ""),
    };
  }
  const id = String(record.id ?? record.Id ?? record.itemId ?? "");
  if (!id) return null;
  return {
    externalId: id,
    slug: String(record.slug ?? record.name ?? record.Title ?? id),
    title: String(record.title ?? record.name ?? record.Title ?? id),
    body: String(record.body ?? record.content ?? record.Description ?? ""),
  };
}

export function createRestCmsConnector(kind: CmsKind): CmsConnector {
  const fetchFn = (globalThis as { fetch?: CmsFetchLike }).fetch as
    CmsFetchLike | undefined;
  if (!fetchFn) {
    throw new Error("CMS connectors require a fetch implementation (Node 18+)");
  }
  const paths = kindPaths(kind);
  return {
    kind,
    async listItems(connection) {
      const response = await fetchFn(joinUrl(connection.endpoint, paths.list), {
        headers: { accept: "application/json", ...authHeaders(connection) },
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          `CMS ${kind} list failed: HTTP ${response.status} ${detail.slice(0, 200)}`,
        );
      }
      const data = (await response.json()) as unknown;
      const rows = Array.isArray(data)
        ? data
        : Array.isArray((data as { value?: unknown }).value)
          ? ((data as { value: unknown[] }).value ?? [])
          : Array.isArray((data as { items?: unknown }).items)
            ? ((data as { items: unknown[] }).items ?? [])
            : [];
      return rows
        .map((row) => normalize(kind, row))
        .filter((row): row is NormalizedCmsItem => row !== null);
    },
    async getItem(connection, id) {
      const response = await fetchFn(
        joinUrl(connection.endpoint, paths.item(id)),
        {
          headers: { accept: "application/json", ...authHeaders(connection) },
        },
      );
      if (!response.ok) return null;
      return normalize(kind, await response.json());
    },
  };
}

export function connectorFor(kind: CmsKind): CmsConnector | null {
  if (kind === "none") return null;
  return createRestCmsConnector(kind);
}

export function resolveAiProvider(
  tenant: Tenant,
  env: NodeJS.ProcessEnv = process.env,
): AiProviderResolution | null {
  const preferred = tenant.preferredAIService;
  const fromEnv =
    (env.AI_SERVICE_PROVIDER as AiServiceKind | undefined) ?? "none";
  const provider: AiServiceKind =
    preferred !== "none" ? preferred : fromEnv !== undefined ? fromEnv : "none";
  if (provider === "none") return null;
  const registry = AI_SERVICE_REGISTRY[provider];
  const baseUrl =
    registry.baseEnvVar && env[registry.baseEnvVar]
      ? String(env[registry.baseEnvVar])
      : undefined;
  return {
    provider,
    model: defaultModelFor(provider),
    baseUrl,
    apiKeyEnvVar: registry.apiKeyEnvVar,
  };
}

function defaultModelFor(provider: AiServiceKind): string {
  switch (provider) {
    case "azure-openai":
      return process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-4o-mini";
    case "openai":
      return "gpt-4o-mini";
    case "gemini":
      return "gemini-2.0-flash";
    case "copilot":
      return process.env.COPILOT_DEPLOYMENT ?? "gpt-4o-mini";
    case "anthropic":
      return "claude-sonnet-4-5";
    default:
      return "";
  }
}

export interface IntegrationService {
  registry(): {
    cms: typeof CMS_REGISTRY;
    ai: typeof AI_SERVICE_REGISTRY;
  };
  setPreferences(input: {
    tenantId: string;
    actor: User;
    preferredCMS?: CmsKind;
    preferredAIService?: AiServiceKind;
  }): Promise<Tenant>;
  connectionFor(tenantId: string): Promise<CmsConnection | null>;
  aiFor(tenantId: string): Promise<AiProviderResolution | null>;
}

export function createIntegrationService(deps: {
  store: WebStore;
  recordAudit: (input: {
    tenantId: string;
    actorId: string;
    action: string;
    detail?: string;
  }) => Promise<void>;
  env?: NodeJS.ProcessEnv;
}): IntegrationService {
  const env = deps.env ?? process.env;

  function connectionFromEnv(
    kind: Exclude<CmsKind, "none">,
  ): CmsConnection | null {
    const endpoint = env.CMS_API_ENDPOINT;
    if (!endpoint) return null;
    return {
      kind,
      endpoint,
      token: env.CMS_API_TOKEN,
      username: env.CMS_API_USERNAME,
      password: env.CMS_API_PASSWORD,
    };
  }

  return {
    registry() {
      return { cms: CMS_REGISTRY, ai: AI_SERVICE_REGISTRY };
    },

    async setPreferences({
      tenantId,
      actor,
      preferredCMS,
      preferredAIService,
    }) {
      if (preferredCMS !== undefined) {
        requirePermission(actor, PERMISSIONS.cmsIntegrate);
      }
      if (preferredAIService !== undefined) {
        requirePermission(actor, PERMISSIONS.aiIntegrate);
      }
      if (actor.tenantId !== tenantId) {
        throw new Error("cross-tenant write rejected");
      }
      const tenant = await deps.store.getTenant(tenantId);
      if (!tenant) {
        throw new Error(`tenant "${tenantId}" not found`);
      }
      const updated: Tenant = {
        ...tenant,
        preferredCMS: preferredCMS ?? tenant.preferredCMS,
        preferredAIService: preferredAIService ?? tenant.preferredAIService,
      };
      await deps.store.saveTenant(updated);
      await deps.recordAudit({
        tenantId,
        actorId: actor.id,
        action: "integration.preferences.update",
        detail: `cms=${updated.preferredCMS} ai=${updated.preferredAIService}`,
      });
      return updated;
    },

    async connectionFor(tenantId) {
      const tenant = await deps.store.getTenant(tenantId);
      if (!tenant) return null;
      // Per-tenant preference wins; env CMS_TYPE is the default.
      const preferred = tenant.preferredCMS;
      const fallback = (env.CMS_TYPE as CmsKind | undefined) ?? "none";
      const kind: CmsKind = preferred !== "none" ? preferred : fallback;
      if (kind === "none") return null;
      return connectionFromEnv(kind);
    },

    async aiFor(tenantId) {
      const tenant = await deps.store.getTenant(tenantId);
      if (!tenant) {
        throw new Error(`tenant "${tenantId}" not found`);
      }
      return resolveAiProvider(tenant, env);
    },
  };
}
