import { describe, expect, it, vi } from "vitest";
import { createHmac, createSign, generateKeyPairSync } from "node:crypto";
import { createWebReferenceService, createWebStore } from "./index.js";
import type { OidcSsoConfig, SamlSsoConfig, SsoProviderConfig } from "./sso.js";

const NOW = () => new Date("2026-08-04T00:00:00.000Z");

const HS_SECRET = "test-client-secret";

function b64url(data: string | Buffer): string {
  return Buffer.from(data).toString("base64url");
}

function signHs256(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  secret = HS_SECRET,
): string {
  const input = `${b64url(JSON.stringify(header))}.${b64url(
    JSON.stringify(payload),
  )}`;
  const sig = createHmac("sha256", secret).update(input).digest("base64url");
  return `${input}.${sig}`;
}

function signRs256(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  privateKey: string,
): string {
  const input = `${b64url(JSON.stringify(header))}.${b64url(
    JSON.stringify(payload),
  )}`;
  const sig = createSign("RSA-SHA256")
    .update(input)
    .sign(privateKey)
    .toString("base64url");
  return `${input}.${sig}`;
}

function oidcConfig(overrides: Partial<OidcSsoConfig> = {}): OidcSsoConfig {
  return {
    provider: "oidc",
    name: "google",
    clientId: "client-123",
    clientSecret: HS_SECRET,
    issuer: "https://accounts.google.com",
    redirectUri: "https://acme.dsrvm.app/api/auth/sso/google/callback",
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    grant: "implicit",
    defaultRole: "viewer",
    ...overrides,
  };
}

function samlConfig(overrides: Partial<SamlSsoConfig> = {}): SamlSsoConfig {
  return {
    provider: "saml",
    name: "azure",
    idpSsoUrl: "https://login.microsoftonline.com/tenant/saml2",
    spEntityId: "https://acme.dsrvm.app/saml/metadata",
    acsUrl: "https://acme.dsrvm.app/api/auth/sso/azure/callback",
    defaultRole: "viewer",
    ...overrides,
  };
}

async function build(providers: SsoProviderConfig[]) {
  const store = createWebStore(NOW);
  const service = createWebReferenceService(store, {
    now: NOW,
    ssoProviders: providers,
  });
  const tenant = await service.bootstrap({
    name: "Acme Consulting",
    host: "acme.dsrvm.app",
  });
  return { store, service, tenant };
}

async function startOidcLogin(
  service: ReturnType<typeof createWebReferenceService>,
  tenantId: string,
) {
  const result = await service.sso.login({ provider: "google", tenantId });
  const url = new URL(result.redirectUrl);
  return {
    state: url.searchParams.get("state") ?? "",
    nonce: url.searchParams.get("nonce") ?? "",
    code: url.searchParams.get("code"),
    responseType: url.searchParams.get("response_type"),
    clientId: url.searchParams.get("client_id"),
  };
}

function claims(
  overrides: Record<string, unknown> = {},
  expSeconds = Math.floor(Date.now() / 1000) + 3600,
) {
  return {
    iss: "https://accounts.google.com",
    aud: "client-123",
    sub: "google-sub-1",
    email: "alice@acme.dsrvm.app",
    name: "Alice Example",
    nonce: "n",
    iat: Math.floor(Date.now() / 1000) - 60,
    exp: expSeconds,
    ...overrides,
  };
}

describe("SSO service", () => {
  it("exposes configured providers", async () => {
    const { service } = await build([oidcConfig(), samlConfig()]);
    expect(service.sso.providers()).toEqual([
      { name: "google", kind: "oidc" },
      { name: "azure", kind: "saml" },
    ]);
  });

  it("rejects unknown providers and missing tenants", async () => {
    const { service } = await build([oidcConfig()]);
    await expect(
      service.sso.login({ provider: "nope", tenantId: "x" }),
    ).rejects.toThrow("unknown SSO provider");
    await expect(
      service.sso.login({ provider: "google", tenantId: "missing" }),
    ).rejects.toThrow("tenant");
  });

  describe("OIDC (implicit grant, HS256)", () => {
    it("issues a redirect and turns a valid id_token into a session", async () => {
      const { service, tenant } = await build([oidcConfig()]);
      const login = await startOidcLogin(service, tenant.id);
      expect(login.responseType).toBe("id_token");
      expect(login.state).toBeTruthy();
      expect(login.nonce).toBeTruthy();

      const token = signHs256(
        { alg: "HS256", typ: "JWT" },
        claims({ nonce: login.nonce }),
      );
      const result = await service.sso.handleCallback({
        provider: "google",
        params: { id_token: token, state: login.state },
      });
      expect(result.created).toBe(true);
      expect(result.identity.email).toBe("alice@acme.dsrvm.app");
      expect(result.user.role).toBe("viewer");
      expect(result.user.passwordHash).toBe("");
      const session = await service.auth.authenticate(result.token);
      expect(session?.userId).toBe(result.user.id);
    });

    it("rejects a nonce mismatch", async () => {
      const { service, tenant } = await build([oidcConfig()]);
      const login = await startOidcLogin(service, tenant.id);
      const token = signHs256(
        { alg: "HS256", typ: "JWT" },
        claims({ nonce: "attacker-nonce" }),
      );
      await expect(
        service.sso.handleCallback({
          provider: "google",
          params: { id_token: token, state: login.state },
        }),
      ).rejects.toThrow("nonce mismatch");
    });

    it("rejects an expired id_token", async () => {
      const { service, tenant } = await build([oidcConfig()]);
      const login = await startOidcLogin(service, tenant.id);
      const token = signHs256(
        { alg: "HS256", typ: "JWT" },
        claims({ nonce: login.nonce }, Math.floor(Date.now() / 1000) - 3600),
      );
      await expect(
        service.sso.handleCallback({
          provider: "google",
          params: { id_token: token, state: login.state },
        }),
      ).rejects.toThrow("expired");
    });

    it("rejects a tampered signature", async () => {
      const { service, tenant } = await build([oidcConfig()]);
      const login = await startOidcLogin(service, tenant.id);
      const token = signHs256(
        { alg: "HS256", typ: "JWT" },
        claims({ nonce: login.nonce }),
        "wrong-secret",
      );
      await expect(
        service.sso.handleCallback({
          provider: "google",
          params: { id_token: token, state: login.state },
        }),
      ).rejects.toThrow("signature");
    });

    it("rejects a wrong issuer and wrong audience", async () => {
      const { service, tenant } = await build([oidcConfig()]);
      const login = await startOidcLogin(service, tenant.id);

      const badIss = signHs256(
        { alg: "HS256", typ: "JWT" },
        claims({ nonce: login.nonce, iss: "https://evil.example" }),
      );
      await expect(
        service.sso.handleCallback({
          provider: "google",
          params: { id_token: badIss, state: login.state },
        }),
      ).rejects.toThrow("issuer mismatch");

      const login2 = await startOidcLogin(service, tenant.id);
      const badAud = signHs256(
        { alg: "HS256", typ: "JWT" },
        claims({ nonce: login2.nonce, aud: "other-client" }),
      );
      await expect(
        service.sso.handleCallback({
          provider: "google",
          params: { id_token: badAud, state: login2.state },
        }),
      ).rejects.toThrow("audience mismatch");
    });

    it("rejects replay of a consumed state", async () => {
      const { service, tenant } = await build([oidcConfig()]);
      const login = await startOidcLogin(service, tenant.id);
      const token = signHs256(
        { alg: "HS256", typ: "JWT" },
        claims({ nonce: login.nonce }),
      );
      await service.sso.handleCallback({
        provider: "google",
        params: { id_token: token, state: login.state },
      });
      await expect(
        service.sso.handleCallback({
          provider: "google",
          params: { id_token: token, state: login.state },
        }),
      ).rejects.toThrow("state");
    });

    it("expires state after ten minutes", async () => {
      let current = Date.parse("2026-08-04T00:00:00.000Z");
      const clock = {
        now: () => new Date(current),
        advance: (ms: number) => {
          current += ms;
        },
      };
      const service = createWebReferenceService(createWebStore(clock.now), {
        now: clock.now,
        ssoProviders: [oidcConfig()],
      });
      const tenant = await service.bootstrap({
        name: "Acme",
        host: "acme.dsrvm.app",
      });
      const login = await service.sso.login({
        provider: "google",
        tenantId: tenant.id,
      });
      const nonce = new URL(login.redirectUrl).searchParams.get("nonce") ?? "";
      const token = signHs256({ alg: "HS256" }, claims({ nonce }));
      clock.advance(11 * 60 * 1000);
      await expect(
        service.sso.handleCallback({
          provider: "google",
          params: { id_token: token, state: login.state },
        }),
      ).rejects.toThrow("expired");
    });

    it("maps groups to a role via roleByGroup", async () => {
      const { service, tenant } = await build([
        oidcConfig({ roleByGroup: { "platform-owners": "admin" } }),
      ]);
      const login = await startOidcLogin(service, tenant.id);
      const token = signHs256(
        { alg: "HS256", typ: "JWT" },
        claims({ nonce: login.nonce, groups: ["platform-owners", "eng"] }),
      );
      const result = await service.sso.handleCallback({
        provider: "google",
        params: { id_token: token, state: login.state },
      });
      expect(result.user.role).toBe("admin");
    });

    it("upserts rather than duplicates on repeated SSO logins", async () => {
      const { service, tenant } = await build([oidcConfig()]);
      const first = await startOidcLogin(service, tenant.id);
      const token1 = signHs256(
        { alg: "HS256", typ: "JWT" },
        claims({ nonce: first.nonce }),
      );
      const r1 = await service.sso.handleCallback({
        provider: "google",
        params: { id_token: token1, state: first.state },
      });
      expect(r1.created).toBe(true);

      const second = await startOidcLogin(service, tenant.id);
      const token2 = signHs256(
        { alg: "HS256", typ: "JWT" },
        claims({ nonce: second.nonce }),
      );
      const r2 = await service.sso.handleCallback({
        provider: "google",
        params: { id_token: token2, state: second.state },
      });
      expect(r2.created).toBe(false);
      expect(r2.user.id).toBe(r1.user.id);
      const users = await service.store.getUsersByTenant(tenant.id);
      expect(
        users.filter((u) => u.email === "alice@acme.dsrvm.app"),
      ).toHaveLength(1);
    });
  });

  describe("OIDC (RS256 via JWKS)", () => {
    it("verifies an RS256 id_token against the configured JWKS", async () => {
      const { privateKey, publicKey } = generateKeyPairSync("rsa", {
        modulusLength: 2048,
      });
      const jwk = publicKey.export({ format: "jwk" });
      const { service, tenant } = await build([
        oidcConfig({
          clientSecret: undefined,
          jwks: [
            {
              kid: "key-1",
              kty: "RSA",
              n: jwk.n as string,
              e: jwk.e as string,
            },
          ],
        }),
      ]);
      const login = await startOidcLogin(service, tenant.id);
      const token = signRs256(
        { alg: "RS256", kid: "key-1", typ: "JWT" },
        claims({ nonce: login.nonce }),
        privateKey.export({ format: "pem", type: "pkcs8" }) as string,
      );
      const result = await service.sso.handleCallback({
        provider: "google",
        params: { id_token: token, state: login.state },
      });
      expect(result.created).toBe(true);
      expect(result.identity.email).toBe("alice@acme.dsrvm.app");
    });

    it("rejects an RS256 token signed by a different key", async () => {
      const keyA = generateKeyPairSync("rsa", { modulusLength: 2048 });
      const keyB = generateKeyPairSync("rsa", { modulusLength: 2048 });
      const jwk = keyA.publicKey.export({ format: "jwk" });
      const { service, tenant } = await build([
        oidcConfig({
          clientSecret: undefined,
          jwks: [
            {
              kid: "key-1",
              kty: "RSA",
              n: jwk.n as string,
              e: jwk.e as string,
            },
          ],
        }),
      ]);
      const login = await startOidcLogin(service, tenant.id);
      const token = signRs256(
        { alg: "RS256", kid: "key-1" },
        claims({ nonce: login.nonce }),
        keyB.privateKey.export({ format: "pem", type: "pkcs8" }) as string,
      );
      await expect(
        service.sso.handleCallback({
          provider: "google",
          params: { id_token: token, state: login.state },
        }),
      ).rejects.toThrow("signature");
    });
  });

  describe("OIDC (authorization code grant)", () => {
    it("exchanges the code at the token endpoint", async () => {
      const mock = vi.fn();
      const service = createWebReferenceService(createWebStore(NOW), {
        now: NOW,
        ssoProviders: [oidcConfig({ grant: "code", fetchFn: mock as never })],
      });
      const tenant = await service.bootstrap({
        name: "Acme",
        host: "acme.dsrvm.app",
      });
      const login = await service.sso.login({
        provider: "google",
        tenantId: tenant.id,
      });
      const url = new URL(login.redirectUrl);
      expect(url.searchParams.get("response_type")).toBe("code");

      const nonce = url.searchParams.get("nonce") ?? "";
      const codeToken = signHs256({ alg: "HS256" }, claims({ nonce }));
      mock.mockImplementation(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ id_token: codeToken }),
      }));
      const cb = await service.sso.handleCallback({
        provider: "google",
        params: { code: "auth-code-1", state: login.state },
      });
      expect(cb.created).toBe(true);
      expect(cb.identity.email).toBe("alice@acme.dsrvm.app");
      expect(mock).toHaveBeenCalledTimes(1);
      const body = mock.mock.calls[0]?.[1]?.body ?? "";
      expect(body).toContain("grant_type=authorization_code");
      expect(body).toContain("code=auth-code-1");
      expect(body).toContain("client_secret=test-client-secret");
    });

    it("fails when the token endpoint rejects the exchange", async () => {
      const fetchFn = vi.fn(async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: "invalid_grant" }),
      })) as never;
      const service = createWebReferenceService(createWebStore(NOW), {
        now: NOW,
        ssoProviders: [oidcConfig({ grant: "code", fetchFn })],
      });
      const tenant = await service.bootstrap({
        name: "Acme",
        host: "acme.dsrvm.app",
      });
      const login = await service.sso.login({
        provider: "google",
        tenantId: tenant.id,
      });
      await expect(
        service.sso.handleCallback({
          provider: "google",
          params: { code: "bad-code", state: login.state },
        }),
      ).rejects.toThrow("token exchange failed");
    });
  });

  describe("SAML", () => {
    function samlXml(input: {
      nameId: string;
      attributes?: Record<string, string[]>;
      signed?: boolean;
      privateKey?: string;
      tamper?: boolean;
    }): string {
      const attrs = Object.entries(input.attributes ?? {}).map(
        ([name, values]) => {
          const inner = values
            .map((v) => `<saml:AttributeValue>${v}</saml:AttributeValue>`)
            .join("");
          return `<saml:Attribute Name="${name}">${inner}</saml:Attribute>`;
        },
      );
      let xml =
        `<?xml version="1.0"?><samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ` +
        `xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">` +
        `<saml:Assertion ID="a1"><saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${input.nameId}</saml:NameID></saml:Subject>` +
        `<saml:AttributeStatement>${attrs.join("")}</saml:AttributeStatement>`;
      if (input.signed && input.privateKey) {
        const signedInfo =
          `<ds:SignedInfo><ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>` +
          `<ds:Reference URI="#a1"><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><ds:DigestValue>dGVzdA==</ds:DigestValue></ds:Reference></ds:SignedInfo>`;
        let sig = createSign("RSA-SHA256")
          .update(signedInfo)
          .sign(input.privateKey)
          .toString("base64");
        if (input.tamper)
          sig = sig.replace(/.$/, sig.endsWith("=") ? "A" : "=");
        xml +=
          `<ds:Signature>${signedInfo}` +
          `<ds:SignatureValue>${sig}</ds:SignatureValue></ds:Signature>`;
      }
      xml += `</saml:Assertion></samlp:Response>`;
      return xml;
    }

    async function samlCallback(
      service: ReturnType<typeof createWebReferenceService>,
      tenantId: string,
      responseB64: string,
      state: string,
    ) {
      return service.sso.handleCallback({
        provider: "azure",
        params: { SAMLResponse: responseB64, RelayState: state },
      });
    }

    it("parses an unsigned SAML response into a session", async () => {
      const { service, tenant } = await build([samlConfig()]);
      const login = await service.sso.login({
        provider: "azure",
        tenantId: tenant.id,
      });
      expect(login.redirectUrl).toContain("SAMLRequest=");
      expect(new URL(login.redirectUrl).searchParams.get("RelayState")).toBe(
        login.state,
      );
      const xml = samlXml({
        nameId: "bob@acme.dsrvm.app",
        attributes: {
          email: ["bob@acme.dsrvm.app"],
          displayName: ["Bob Builder"],
          memberOf: ["platform-owners"],
        },
      });
      const result = await samlCallback(
        service,
        tenant.id,
        Buffer.from(xml).toString("base64"),
        login.state,
      );
      expect(result.created).toBe(true);
      expect(result.identity.email).toBe("bob@acme.dsrvm.app");
      expect(result.identity.name).toBe("Bob Builder");
      expect(result.identity.groups).toEqual(["platform-owners"]);
      expect(result.user.role).toBe("viewer");
    });

    it("applies roleByGroup for SAML users", async () => {
      const { service, tenant } = await build([
        samlConfig({ roleByGroup: { "platform-owners": "admin" } }),
      ]);
      const login = await service.sso.login({
        provider: "azure",
        tenantId: tenant.id,
      });
      const xml = samlXml({
        nameId: "bob@acme.dsrvm.app",
        attributes: {
          email: ["bob@acme.dsrvm.app"],
          memberOf: ["platform-owners"],
        },
      });
      const result = await samlCallback(
        service,
        tenant.id,
        Buffer.from(xml).toString("base64"),
        login.state,
      );
      expect(result.user.role).toBe("admin");
    });

    it("verifies a signed SAML response when a certificate is configured", async () => {
      const { privateKey, publicKey } = generateKeyPairSync("rsa", {
        modulusLength: 2048,
      });
      const cert = publicKey.export({ format: "pem", type: "spki" }) as string;
      const privatePem = privateKey.export({
        format: "pem",
        type: "pkcs8",
      }) as string;
      const { service, tenant } = await build([
        samlConfig({ certificate: cert }),
      ]);
      const login = await service.sso.login({
        provider: "azure",
        tenantId: tenant.id,
      });
      const xml = samlXml({
        nameId: "signed@acme.dsrvm.app",
        attributes: { email: ["signed@acme.dsrvm.app"] },
        signed: true,
        privateKey: privatePem,
      });
      const result = await samlCallback(
        service,
        tenant.id,
        Buffer.from(xml).toString("base64"),
        login.state,
      );
      expect(result.identity.email).toBe("signed@acme.dsrvm.app");
    });

    it("rejects a signed SAML response with a bad signature", async () => {
      const { privateKey, publicKey } = generateKeyPairSync("rsa", {
        modulusLength: 2048,
      });
      const otherKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
      const cert = publicKey.export({ format: "pem", type: "spki" }) as string;
      const { service, tenant } = await build([
        samlConfig({ certificate: cert }),
      ]);
      const login = await service.sso.login({
        provider: "azure",
        tenantId: tenant.id,
      });
      const xml = samlXml({
        nameId: "evil@acme.dsrvm.app",
        signed: true,
        privateKey: otherKey.privateKey.export({
          format: "pem",
          type: "pkcs8",
        }) as string,
      });
      await expect(
        samlCallback(
          service,
          tenant.id,
          Buffer.from(xml).toString("base64"),
          login.state,
        ),
      ).rejects.toThrow("signature");
    });

    it("rejects an unsigned response when a certificate is configured", async () => {
      const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
      const cert = publicKey.export({ format: "pem", type: "spki" }) as string;
      const { service, tenant } = await build([
        samlConfig({ certificate: cert }),
      ]);
      const login = await service.sso.login({
        provider: "azure",
        tenantId: tenant.id,
      });
      const xml = samlXml({ nameId: "unsigned@acme.dsrvm.app" });
      await expect(
        samlCallback(
          service,
          tenant.id,
          Buffer.from(xml).toString("base64"),
          login.state,
        ),
      ).rejects.toThrow("not signed");
    });

    it("rejects a SAML response with no NameID", async () => {
      const { service, tenant } = await build([samlConfig()]);
      const login = await service.sso.login({
        provider: "azure",
        tenantId: tenant.id,
      });
      const xml =
        `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">` +
        `<saml:Assertion><saml:Subject></saml:Subject></saml:Assertion></samlp:Response>`;
      await expect(
        samlCallback(
          service,
          tenant.id,
          Buffer.from(xml).toString("base64"),
          login.state,
        ),
      ).rejects.toThrow("NameID");
    });
  });
});
