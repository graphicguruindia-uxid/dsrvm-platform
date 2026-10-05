import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createTenantRegistry, type TenantRegistry } from "./tenant.js";
import { createAuthService, type AuthService } from "./auth.js";
import {
  createSsoService,
  type SsoProviderConfig,
  type SsoService,
} from "./sso.js";
import { createCmsService, type CmsService } from "./cms.js";
import { createBillingService, type BillingHook } from "./billing.js";
import {
  createBillingWebhookService,
  type BillingWebhookService,
} from "./billing-webhook.js";
import { createAdminService, type AdminService } from "./console.js";
import {
  createInviteService,
  type InviteService,
  type PublicInvite,
} from "./invites.js";
import { createAuditService, type AuditService } from "./audit.js";
import {
  createIntegrationService,
  type IntegrationService,
} from "./integrations.js";
import type { WebStore } from "./store.js";
import type { AiServiceKind, CmsKind, Tenant } from "./types.js";
import { PERMISSIONS, requirePermission } from "./rbac.js";

export interface WebReferenceServiceOptions {
  now?: () => Date;
  ssoProviders?: SsoProviderConfig[];
  billingWebhookSecret?: string;
}

export interface BootstrapResult {
  tenant: Tenant;
  ownerEmail: string;
  inviteToken: string;
  invite: PublicInvite;
}

export interface WebReferenceService {
  store: WebStore;
  tenants: TenantRegistry;
  auth: AuthService;
  sso: SsoService;
  cms: CmsService;
  billing: BillingHook;
  billingWebhook: BillingWebhookService | null;
  admin: AdminService;
  invites: InviteService;
  audit: AuditService;
  integrations: IntegrationService;
  bootstrap: (input: {
    name: string;
    host: string;
    preferredCMS?: CmsKind;
    preferredAIService?: AiServiceKind;
  }) => Promise<BootstrapResult>;
  deleteTenant: (input: { tenantId: string; actorId: string }) => Promise<void>;
}

export function createWebReferenceService(
  store: WebStore,
  nowOrOptions?: (() => Date) | WebReferenceServiceOptions,
): WebReferenceService {
  const options: WebReferenceServiceOptions =
    typeof nowOrOptions === "function"
      ? { now: nowOrOptions }
      : (nowOrOptions ?? {});
  const now = options.now ?? (() => new Date());
  const tenants = createTenantRegistry(store);
  const billing = createBillingService(store, now);
  const billingWebhook = options.billingWebhookSecret
    ? createBillingWebhookService({
        secret: options.billingWebhookSecret,
        store,
        billing,
        now,
      })
    : null;
  const auth = createAuthService(store, now);
  const audit = createAuditService(store, now);
  const recordAudit = (input: {
    tenantId: string;
    actorId: string;
    action: string;
    detail?: string;
  }) => audit.record(input).then(() => undefined);
  const invites = createInviteService(store, {
    createUser: (input) =>
      auth.signup({
        tenantId: input.tenantId,
        email: input.email,
        password: input.password,
        name: input.name,
        role: input.role,
        inviteToken: input.inviteToken,
      }),
    recordAudit,
    now,
  });
  const sso = createSsoService({
    store,
    auth,
    providers: options.ssoProviders ?? [],
    now,
  });
  const cms = createCmsService(store, now);
  const admin = createAdminService(store, billing, now);
  const integrations = createIntegrationService({ store, recordAudit });

  return {
    store,
    tenants,
    auth,
    sso,
    cms,
    billing,
    billingWebhook,
    admin,
    invites,
    audit,
    integrations,
    async bootstrap(input) {
      const tenant = await tenants.create({
        name: input.name,
        hosts: [input.host],
        plan: "growth",
        preferredCMS: input.preferredCMS,
        preferredAIService: input.preferredAIService,
      });
      // Secure bootstrap: no default password. The owner claims the tenant
      // by accepting a single-use invite token out of band.
      const token = randomBytes(32).toString("base64url");
      const invite = {
        id: randomUUID(),
        tenantId: tenant.id,
        email: `owner@${input.host}`,
        role: "owner" as const,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(
          now().getTime() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        createdBy: "bootstrap",
        createdAt: now().toISOString(),
      };
      await store.saveInvite(invite);
      await audit.record({
        tenantId: tenant.id,
        actorId: "bootstrap",
        action: "tenant.create",
        detail: `${tenant.name} (${input.host})`,
      });
      const { tokenHash: _tokenHash, ...publicInvite } = invite;
      return {
        tenant,
        ownerEmail: `owner@${input.host}`,
        inviteToken: token,
        invite: publicInvite,
      };
    },
    async deleteTenant({ tenantId, actorId }) {
      const actor = await store.getUser(actorId);
      if (!actor || actor.tenantId !== tenantId) {
        throw new Error("cross-tenant delete rejected");
      }
      requirePermission(actor, PERMISSIONS.tenantDelete);
      await tenants.remove(tenantId);
    },
  };
}
