import {
  createHmac,
  createPublicKey,
  randomBytes,
  timingSafeEqual,
  verify as cryptoVerify,
  type KeyObject,
} from "node:crypto";
import type { AuthService } from "./auth.js";
import type { WebStore } from "./store.js";
import type { User, UserRole } from "./types.js";

const STATE_TTL_MS = 10 * 60 * 1000;
const ROLE_ORDER: UserRole[] = ["owner", "admin", "editor", "viewer"];

export type SsoGrant = "code" | "implicit";

export interface Jwk {
  kid?: string;
  kty?: string;
  n?: string;
  e?: string;
  k?: string;
}

export interface FetchLike {
  (
    url: string,
    init?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    },
  ): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
}

export interface OidcSsoConfig {
  provider: "oidc";
  name: string;
  clientId: string;
  clientSecret?: string;
  issuer: string;
  redirectUri: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  jwks?: Jwk[];
  jwksUri?: string;
  scope?: string;
  grant?: SsoGrant;
  defaultRole?: UserRole;
  roleByGroup?: Record<string, UserRole>;
  fetchFn?: FetchLike;
}

export interface SamlSsoConfig {
  provider: "saml";
  name: string;
  idpSsoUrl: string;
  spEntityId: string;
  acsUrl: string;
  certificate?: string;
  defaultRole?: UserRole;
  roleByGroup?: Record<string, UserRole>;
}

export type SsoProviderConfig = OidcSsoConfig | SamlSsoConfig;

export interface SsoIdentity {
  provider: string;
  subject: string;
  email: string;
  name: string;
  groups: string[];
}

export interface SsoLoginResult {
  redirectUrl: string;
  state: string;
}

export interface SsoCallbackResult {
  user: User;
  token: string;
  created: boolean;
  identity: SsoIdentity;
}

export interface SsoProvider {
  name: string;
  kind: "oidc" | "saml";
  authorizeUrl(input: { state: string; nonce?: string }): Promise<string>;
  extractState(params: Record<string, string | undefined>): string;
  handleCallback(input: {
    params: Record<string, string | undefined>;
    nonce?: string;
  }): Promise<SsoIdentity>;
  roleFor(identity: SsoIdentity): UserRole;
}

export interface SsoService {
  providers(): Array<{ name: string; kind: "oidc" | "saml" }>;
  login(input: { provider: string; tenantId: string }): Promise<SsoLoginResult>;
  handleCallback(input: {
    provider: string;
    params: Record<string, string | undefined>;
  }): Promise<SsoCallbackResult>;
}

export function createSsoProvider(
  name: string,
  config: SsoProviderConfig,
): SsoProvider {
  if (config.provider === "oidc") return createOidcProvider(name, config);
  return createSamlProvider(name, config);
}

export function createSsoService(deps: {
  store: WebStore;
  auth: AuthService;
  providers: SsoProviderConfig[];
  now?: () => Date;
}): SsoService {
  const now = deps.now ?? (() => new Date());
  const providers = new Map<string, SsoProvider>();
  for (const config of deps.providers) {
    const provider = createSsoProvider(config.name, config);
    providers.set(provider.name, provider);
  }
  const states = new Map<
    string,
    { tenantId: string; nonce: string; createdAt: number }
  >();

  function issueState(tenantId: string): { state: string; nonce: string } {
    const state = randomBytes(24).toString("base64url");
    const nonce = randomBytes(16).toString("base64url");
    states.set(state, { tenantId, nonce, createdAt: now().getTime() });
    return { state, nonce };
  }

  function consumeState(state: string): { tenantId: string; nonce: string } {
    const entry = states.get(state);
    if (!entry) {
      throw new Error("invalid or unknown SSO state (replay?)");
    }
    states.delete(state);
    if (now().getTime() - entry.createdAt > STATE_TTL_MS) {
      throw new Error("SSO state expired");
    }
    return { tenantId: entry.tenantId, nonce: entry.nonce };
  }

  return {
    providers() {
      return [...providers.values()].map((p) => ({
        name: p.name,
        kind: p.kind,
      }));
    },

    async login({ provider, tenantId }) {
      const providerInstance = providers.get(provider);
      if (!providerInstance) {
        throw new Error(`unknown SSO provider "${provider}"`);
      }
      if ((await deps.store.getTenant(tenantId)) === null) {
        throw new Error(`tenant "${tenantId}" not found`);
      }
      const { state, nonce } = issueState(tenantId);
      const redirectUrl = await providerInstance.authorizeUrl({ state, nonce });
      return { redirectUrl, state };
    },

    async handleCallback({ provider, params }) {
      const providerInstance = providers.get(provider);
      if (!providerInstance) {
        throw new Error(`unknown SSO provider "${provider}"`);
      }
      const state = providerInstance.extractState(params);
      const { tenantId, nonce } = consumeState(state);
      const identity = await providerInstance.handleCallback({ params, nonce });
      const role = providerInstance.roleFor(identity);
      const result = await deps.auth.ssoLogin({
        tenantId,
        email: identity.email,
        name: identity.name,
        role,
      });
      return { ...result, identity };
    },
  };
}

function createOidcProvider(name: string, config: OidcSsoConfig): SsoProvider {
  const grant = config.grant ?? "code";
  const scope = config.scope ?? "openid email profile";
  const fetchFn =
    config.fetchFn ??
    ((globalThis as { fetch?: FetchLike }).fetch as FetchLike);
  if (!fetchFn) {
    throw new Error(
      `OIDC provider "${name}" requires a fetch implementation (Node 18+)`,
    );
  }
  const resolved: {
    authorizationEndpoint?: string;
    tokenEndpoint?: string;
    jwks?: Jwk[];
  } = { ...config };

  async function ensureResolved() {
    const hasAuth = Boolean(resolved.authorizationEndpoint);
    const hasToken = grant !== "code" || Boolean(resolved.tokenEndpoint);
    const hasKey = Boolean(resolved.jwks || config.clientSecret);
    if (hasAuth && hasToken && hasKey) return;
    const discovered = await discover(config.issuer, fetchFn);
    resolved.authorizationEndpoint ??= discovered.authorizationEndpoint;
    resolved.tokenEndpoint ??= discovered.tokenEndpoint;
    resolved.jwks ??= discovered.jwks;
  }

  async function authorizeUrl(input: {
    state: string;
    nonce?: string;
  }): Promise<string> {
    await ensureResolved();
    const endpoint = resolved.authorizationEndpoint;
    if (!endpoint) {
      throw new Error(`authorization endpoint not configured for "${name}"`);
    }
    const params = new URLSearchParams({
      response_type: grant === "code" ? "code" : "id_token",
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope,
      state: input.state,
    });
    if (input.nonce) params.set("nonce", input.nonce);
    return `${endpoint}${endpoint.includes("?") ? "&" : "?"}${params.toString()}`;
  }

  async function exchangeCode(code: string): Promise<string> {
    await ensureResolved();
    const endpoint = resolved.tokenEndpoint;
    if (!endpoint) {
      throw new Error(`token endpoint not configured for "${name}"`);
    }
    const form = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
    });
    if (config.clientSecret) form.set("client_secret", config.clientSecret);
    const response = await fetchFn(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: form.toString(),
    });
    if (!response.ok) {
      throw new Error(
        `token exchange failed for "${name}": HTTP ${response.status}`,
      );
    }
    const data = (await response.json()) as Record<string, unknown>;
    const idToken = data.id_token;
    if (typeof idToken !== "string" || !idToken) {
      throw new Error(`token exchange for "${name}" returned no id_token`);
    }
    return idToken;
  }

  function verifyIdToken(idToken: string, expectedNonce?: string): SsoIdentity {
    const { header, payload, signature, signingInput } = parseJwt(idToken);
    const alg = header.alg;
    if (alg !== "HS256" && alg !== "RS256") {
      throw new Error(`unsupported id_token algorithm "${String(alg)}"`);
    }
    const claims = payload as Record<string, unknown>;
    if (claims.iss !== stripTrailingSlash(config.issuer)) {
      throw new Error(`id_token issuer mismatch for "${name}"`);
    }
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audience.includes(config.clientId)) {
      throw new Error(`id_token audience mismatch for "${name}"`);
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    const exp = numberClaim(claims.exp, "exp");
    if (exp <= nowSeconds) throw new Error(`id_token expired for "${name}"`);
    if (claims.nbf !== undefined) {
      const nbf = numberClaim(claims.nbf, "nbf");
      if (nbf > nowSeconds)
        throw new Error(`id_token not yet valid for "${name}"`);
    }
    if (expectedNonce && claims.nonce !== expectedNonce) {
      throw new Error(`id_token nonce mismatch for "${name}"`);
    }
    const subject = String(claims.sub ?? "");
    if (!subject) throw new Error(`id_token missing subject for "${name}"`);

    if (alg === "HS256") {
      if (!config.clientSecret) {
        throw new Error(
          `id_token alg HS256 requires a clientSecret for "${name}"`,
        );
      }
      const expected = createHmac("sha256", config.clientSecret)
        .update(signingInput)
        .digest();
      if (!safeEqual(expected, signature)) {
        throw new Error(`id_token signature verification failed for "${name}"`);
      }
    } else {
      const key = keyFromJwks(resolved.jwks ?? [], header.kid);
      if (
        !cryptoVerify(
          "RSA-SHA256",
          Buffer.from(signingInput, "utf8"),
          key,
          signature,
        )
      ) {
        throw new Error(`id_token signature verification failed for "${name}"`);
      }
    }

    return identityFromClaims(name, claims, config.issuer);
  }

  return {
    name,
    kind: "oidc",
    async authorizeUrl(input) {
      return authorizeUrl(input);
    },
    extractState(params) {
      return params.state ?? "";
    },
    async handleCallback({ params, nonce }) {
      let idToken: string;
      if (params.id_token) {
        idToken = params.id_token;
      } else if (params.code) {
        idToken = await exchangeCode(params.code);
      } else {
        throw new Error(`OIDC callback for "${name}" missing code or id_token`);
      }
      return verifyIdToken(idToken, nonce);
    },
    roleFor(identity) {
      return mapRole(identity.groups, config.roleByGroup, config.defaultRole);
    },
  };
}

function createSamlProvider(name: string, config: SamlSsoConfig): SsoProvider {
  return {
    name,
    kind: "saml",
    async authorizeUrl(input) {
      const authnRequest = buildAuthnRequest(config);
      const params = new URLSearchParams({
        SAMLRequest: Buffer.from(authnRequest).toString("base64"),
        RelayState: input.state,
      });
      return `${config.idpSsoUrl}${config.idpSsoUrl.includes("?") ? "&" : "?"}${params.toString()}`;
    },
    extractState(params) {
      return params.RelayState ?? "";
    },
    async handleCallback({ params }) {
      const responseB64 = params.SAMLResponse;
      if (!responseB64) {
        throw new Error(`SAML callback for "${name}" missing SAMLResponse`);
      }
      const xml = Buffer.from(normalizeBase64(responseB64), "base64").toString(
        "utf8",
      );
      verifySamlSignature(xml, config.certificate);
      const subject = extractNameId(xml);
      if (!subject) {
        throw new Error(`SAML response for "${name}" has no NameID`);
      }
      const attributes = extractAttributes(xml);
      const email =
        firstAttribute(attributes, ["email", "mail", "EmailAddress"]) ??
        subject;
      const fullName =
        firstAttribute(attributes, [
          "displayName",
          "displayname",
          "name",
          "cn",
        ]) ?? email;
      const groups =
        attributeValues(attributes, ["groups", "memberOf", "role", "roles"]) ??
        [];
      return {
        provider: name,
        subject,
        email: email.trim().toLowerCase(),
        name: fullName,
        groups,
      };
    },
    roleFor(identity) {
      return mapRole(identity.groups, config.roleByGroup, config.defaultRole);
    },
  };
}

function identityFromClaims(
  provider: string,
  claims: Record<string, unknown>,
  issuer: string,
): SsoIdentity {
  const subject = String(claims.sub ?? "");
  const email = String(claims.email ?? claims.preferred_username ?? "");
  const groups = Array.isArray(claims.groups)
    ? claims.groups.map(String)
    : Array.isArray(claims.roles)
      ? claims.roles.map(String)
      : [];
  const name = String(claims.name ?? "");
  return {
    provider,
    subject,
    email: (email || `${subject}@${ssoHost(issuer)}`).toLowerCase(),
    name: name || email || subject,
    groups,
  };
}

function mapRole(
  groups: string[],
  roleByGroup?: Record<string, UserRole>,
  defaultRole?: UserRole,
): UserRole {
  if (roleByGroup) {
    const groupSet = new Set(groups);
    let best: UserRole = defaultRole ?? "viewer";
    for (const [group, role] of Object.entries(roleByGroup)) {
      if (
        groupSet.has(group) &&
        ROLE_ORDER.indexOf(role) < ROLE_ORDER.indexOf(best)
      ) {
        best = role;
      }
    }
    return best;
  }
  return defaultRole ?? "viewer";
}

function extractState(
  provider: SsoProvider,
  params: Record<string, string | undefined>,
): string {
  if (provider.kind === "oidc") return params.state ?? "";
  return params.RelayState ?? "";
}

function parseJwt(token: string): {
  header: Record<string, unknown>;
  payload: unknown;
  signature: Buffer;
  signingInput: string;
} {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed JWT");
  const [headerB64, payloadB64, signatureB64] = parts as [
    string,
    string,
    string,
  ];
  const header = JSON.parse(
    base64UrlDecode(headerB64).toString("utf8"),
  ) as Record<string, unknown>;
  const payload = JSON.parse(
    base64UrlDecode(payloadB64).toString("utf8"),
  ) as unknown;
  return {
    header,
    payload,
    signature: base64UrlDecode(signatureB64),
    signingInput: `${headerB64}.${payloadB64}`,
  };
}

function keyFromJwks(jwks: Jwk[], kid?: unknown): KeyObject {
  const keyId = kid === undefined ? undefined : String(kid);
  let jwk: Jwk | undefined;
  if (keyId) {
    jwk = jwks.find((j) => j.kid === keyId);
  }
  if (!jwk) {
    jwk = jwks.find((j) => j.kty === "RSA");
  }
  if (!jwk || jwk.kty !== "RSA" || !jwk.n || !jwk.e) {
    throw new Error("no usable RSA JWK for id_token verification");
  }
  return createPublicKey({
    key: { kty: "RSA", n: jwk.n, e: jwk.e },
    format: "jwk",
  });
}

async function discover(
  issuer: string,
  fetchFn: FetchLike,
): Promise<{
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  jwks?: Jwk[];
}> {
  const base = stripTrailingSlash(issuer);
  const response = await fetchFn(`${base}/.well-known/openid-configuration`);
  if (!response.ok) {
    throw new Error(`OIDC discovery failed: HTTP ${response.status}`);
  }
  const meta = (await response.json()) as Record<string, unknown>;
  const result: {
    authorizationEndpoint?: string;
    tokenEndpoint?: string;
    jwks?: Jwk[];
  } = {};
  if (typeof meta.authorization_endpoint === "string") {
    result.authorizationEndpoint = meta.authorization_endpoint;
  }
  if (typeof meta.token_endpoint === "string") {
    result.tokenEndpoint = meta.token_endpoint;
  }
  if (typeof meta.jwks_uri === "string") {
    const jwksResponse = await fetchFn(meta.jwks_uri);
    if (jwksResponse.ok) {
      const jwksDoc = (await jwksResponse.json()) as { keys?: Jwk[] };
      if (Array.isArray(jwksDoc.keys)) result.jwks = jwksDoc.keys;
    }
  }
  return result;
}

function buildAuthnRequest(config: SamlSsoConfig): string {
  const id = `id-${randomBytes(16).toString("hex")}`;
  const instant = new Date().toISOString();
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ` +
    `xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" AssertionConsumerServiceURL="${escapeXml(config.acsUrl)}" ` +
    `Destination="${escapeXml(config.idpSsoUrl)}" ID="${id}" IssueInstant="${instant}" ` +
    `Version="2.0"><saml:Issuer>${escapeXml(config.spEntityId)}</saml:Issuer>` +
    `<samlp:NameIDPolicy AllowCreate="true" Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"/></samlp:AuthnRequest>`
  );
}

function verifySamlSignature(xml: string, certificate?: string): void {
  if (!certificate) return;
  const signatureBlock = xml.match(
    /<ds:Signature\b[^>]*>([\s\S]*?)<\/ds:Signature>/,
  );
  if (!signatureBlock) {
    throw new Error(
      "SAML response is not signed but a verification certificate is configured",
    );
  }
  const block = signatureBlock[1] ?? "";
  const signedInfo = block.match(
    /<ds:SignedInfo\b[^>]*>([\s\S]*?)<\/ds:SignedInfo>/,
  )?.[1];
  const signatureValue = block.match(
    /<ds:SignatureValue\b[^>]*>([\s\S]*?)<\/ds:SignatureValue>/,
  )?.[1];
  if (!signedInfo || !signatureValue) {
    throw new Error("malformed SAML signature");
  }
  const key = createPublicKey({
    key: certificate.replace(/\\n/g, "\n"),
    format: "pem",
    type: "spki",
  });
  const data = Buffer.from(
    `<ds:SignedInfo>${signedInfo}</ds:SignedInfo>`,
    "utf8",
  );
  const signature = Buffer.from(signatureValue.replace(/\s+/g, ""), "base64");
  if (!cryptoVerify("RSA-SHA256", data, key, signature)) {
    throw new Error("SAML signature verification failed");
  }
}

function extractNameId(xml: string): string | null {
  const element = xml.match(
    /<(?:[A-Za-z0-9_]+:)?NameID\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?NameID\s*>/,
  );
  if (element) {
    const value = element[1]?.trim();
    if (value) return value;
  }
  const attribute = xml.match(
    /<(?:[A-Za-z0-9_]+:)?NameID\b[^>]*\bContent\s*=\s*"([^"]*)"[^>]*\/?>/,
  );
  return attribute ? (attribute[1] ?? null) : null;
}

function extractAttributes(xml: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const attributeRe =
    /<(?:[A-Za-z0-9_]+:)?Attribute\b([^>]*)>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?Attribute\s*>/g;
  let match: RegExpExecArray | null;
  while ((match = attributeRe.exec(xml)) !== null) {
    const attrs = match[1] ?? "";
    const name =
      /\b(?:Name|FriendlyName)\s*=\s*"([^"]*)"/.exec(attrs)?.[1] ?? null;
    if (!name) continue;
    const values = [
      ...(match[2] ?? "").matchAll(
        /<(?:[A-Za-z0-9_]+:)?AttributeValue\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?AttributeValue\s*>/g,
      ),
    ]
      .map((v) => v[1]?.trim())
      .filter((v): v is string => Boolean(v));
    result[name] = values;
  }
  return result;
}

function firstAttribute(
  attributes: Record<string, string[]>,
  keys: string[],
): string | null {
  const values = attributeValues(attributes, keys);
  return values && values.length > 0 ? (values[0] ?? null) : null;
}

function attributeValues(
  attributes: Record<string, string[]>,
  keys: string[],
): string[] | null {
  for (const key of keys) {
    const value = attributes[key];
    if (value && value.length > 0) return value;
  }
  return null;
}

function base64UrlDecode(input: string): Buffer {
  const padded =
    input.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

function normalizeBase64(input: string): string {
  return input.replace(/-/g, "+").replace(/_/g, "/");
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

function numberClaim(value: unknown, name: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed))
    throw new Error(`JWT claim "${name}" is not a number`);
  return parsed;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function ssoHost(issuer: string): string {
  try {
    return new URL(issuer).host;
  } catch {
    return issuer.replace(/[^a-z0-9.-]/gi, "").toLowerCase() || "sso.local";
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
