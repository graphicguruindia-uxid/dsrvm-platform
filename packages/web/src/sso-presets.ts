import type { FetchLike, OidcSsoConfig, SsoProviderConfig } from "./sso.js";
import type { UserRole } from "./types.js";

export interface AzureAdPresetOptions {
  /** Azure AD directory (tenant) ID, or `common`/`organizations`/`consumers`. */
  tenantId: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scope?: string;
  defaultRole?: UserRole;
  /** Map Azure group object IDs to app roles (highest-precedence wins). */
  roleByGroup?: Record<string, UserRole>;
  fetchFn?: FetchLike;
  /** Escape hatch for tests / non-standard endpoints (issuer/redirect stay preset-owned). */
  overrides?: Partial<OidcSsoConfig>;
}

export interface GoogleWorkspacePresetOptions {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  /**
   * Google Workspace domain to restrict sign-in to (sent as the `hd`
   * authorize param). Omit to allow any Google account.
   */
  hostedDomain?: string;
  scope?: string;
  defaultRole?: UserRole;
  roleByGroup?: Record<string, UserRole>;
  fetchFn?: FetchLike;
  /** Escape hatch for tests / non-standard endpoints (issuer/redirect stay preset-owned). */
  overrides?: Partial<OidcSsoConfig>;
}

/**
 * Azure AD (Microsoft Entra ID) via OpenID Connect, authorization-code grant
 * with RS256 discovery. Email resolves from the `preferred_username` claim
 * (usually the UPN); Azure group object IDs arrive in `groups` for
 * `roleByGroup` mapping. Requires the "Group assignments" claim enabled on
 * the app registration for group-driven roles.
 */
export function azureAdOidcPreset(
  options: AzureAdPresetOptions,
): OidcSsoConfig {
  const tenant = options.tenantId.trim();
  if (!tenant) {
    throw new Error("azureAdOidcPreset: tenantId is required");
  }
  const config: OidcSsoConfig = {
    provider: "oidc",
    name: "azure-ad",
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    issuer: `https://login.microsoftonline.com/${tenant}/v2.0`,
    redirectUri: options.redirectUri,
    scope: options.scope ?? "openid profile email",
    grant: "code",
    defaultRole: options.defaultRole ?? "viewer",
    roleByGroup: options.roleByGroup,
    fetchFn: options.fetchFn,
    ...options.overrides,
  };
  // Preset-owned identity: overrides may tune endpoints/keys, never these.
  config.provider = "oidc";
  config.name = "azure-ad";
  config.issuer = `https://login.microsoftonline.com/${tenant}/v2.0`;
  config.redirectUri = options.redirectUri;
  return config;
}

/**
 * Google Workspace via OpenID Connect, authorization-code grant with RS256
 * discovery. When `hostedDomain` is set, sign-in is restricted to that
 * Workspace org via the `hd` param.
 */
export function googleWorkspaceOidcPreset(
  options: GoogleWorkspacePresetOptions,
): OidcSsoConfig {
  const config: OidcSsoConfig = {
    provider: "oidc",
    name: "google-workspace",
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    issuer: "https://accounts.google.com",
    redirectUri: options.redirectUri,
    scope: options.scope ?? "openid email profile",
    grant: "code",
    defaultRole: options.defaultRole ?? "viewer",
    roleByGroup: options.roleByGroup,
    fetchFn: options.fetchFn,
    ...(options.hostedDomain
      ? { extraAuthorizeParams: { hd: options.hostedDomain } }
      : {}),
    ...options.overrides,
  };
  // Preset-owned identity: overrides may tune endpoints/keys, never these.
  config.provider = "oidc";
  config.name = "google-workspace";
  config.issuer = "https://accounts.google.com";
  config.redirectUri = options.redirectUri;
  return config;
}

function callbackUrl(base: string, provider: string): string {
  return `${base.replace(/\/+$/, "")}/api/auth/sso/${provider}/callback`;
}

/**
 * Builds the app-level SSO provider list from environment. Each provider is
 * enabled only when its required keys are present; an empty array means
 * "password + invites only". Env keys (see docs/env-tasks.md):
 *
 * - AZURE_AD_TENANT_ID, AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET
 * - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_HOSTED_DOMAIN
 * - SSO_BASE_URL (default redirectUri base, e.g. https://app.dsrvm.app)
 */
export function ssoProvidersFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SsoProviderConfig[] {
  const providers: SsoProviderConfig[] = [];
  const base = env.SSO_BASE_URL;

  const azureTenant = env.AZURE_AD_TENANT_ID;
  const azureClient = env.AZURE_AD_CLIENT_ID;
  if (azureTenant && azureClient && base) {
    providers.push(
      azureAdOidcPreset({
        tenantId: azureTenant,
        clientId: azureClient,
        clientSecret: env.AZURE_AD_CLIENT_SECRET,
        redirectUri: callbackUrl(base, "azure-ad"),
      }),
    );
  }

  const googleClient = env.GOOGLE_CLIENT_ID;
  if (googleClient && base) {
    providers.push(
      googleWorkspaceOidcPreset({
        clientId: googleClient,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        redirectUri: callbackUrl(base, "google-workspace"),
        hostedDomain: env.GOOGLE_HOSTED_DOMAIN,
      }),
    );
  }

  return providers;
}
