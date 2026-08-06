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
import type { WebStore } from "./store.js";
import type { Tenant } from "./types.js";

export interface WebReferenceServiceOptions {
  now?: () => Date;
  ssoProviders?: SsoProviderConfig[];
  billingWebhookSecret?: string;
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
  bootstrap: (input: { name: string; host: string }) => Promise<Tenant>;
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
  const sso = createSsoService({
    store,
    auth,
    providers: options.ssoProviders ?? [],
    now,
  });
  const cms = createCmsService(store, now);
  const admin = createAdminService(store, billing, now);

  return {
    store,
    tenants,
    auth,
    sso,
    cms,
    billing,
    billingWebhook,
    admin,
    async bootstrap(input) {
      const tenant = await tenants.create({
        name: input.name,
        hosts: [input.host],
        plan: "growth",
      });
      await auth.signup({
        tenantId: tenant.id,
        email: `owner@${input.host}`,
        password: "change-me-now",
        name: "Owner",
        role: "owner",
      });
      return tenant;
    },
  };
}
