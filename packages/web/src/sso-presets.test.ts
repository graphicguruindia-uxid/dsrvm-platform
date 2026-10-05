import { describe, expect, it } from "vitest";
import {
  azureAdOidcPreset,
  googleWorkspaceOidcPreset,
  ssoProvidersFromEnv,
} from "./sso-presets.js";
import { createSsoProvider } from "./sso.js";

describe("SSO deployment presets", () => {
  it("builds an Azure AD OIDC config with the v2.0 issuer", () => {
    const config = azureAdOidcPreset({
      tenantId: "tenant-123",
      clientId: "client-123",
      clientSecret: "secret",
      redirectUri: "https://app.dsrvm.app/api/auth/sso/azure-ad/callback",
      roleByGroup: { "group-admin-id": "admin" },
    });
    expect(config.provider).toBe("oidc");
    expect(config.name).toBe("azure-ad");
    expect(config.issuer).toBe(
      "https://login.microsoftonline.com/tenant-123/v2.0",
    );
    expect(config.grant).toBe("code");
    expect(config.defaultRole).toBe("viewer");
    expect(config.roleByGroup).toEqual({ "group-admin-id": "admin" });
  });

  it("rejects an empty Azure tenant id", () => {
    expect(() =>
      azureAdOidcPreset({
        tenantId: "  ",
        clientId: "c",
        redirectUri: "https://app/cb",
      }),
    ).toThrow("tenantId is required");
  });

  it("builds a Google Workspace config with hosted-domain restriction", () => {
    const config = googleWorkspaceOidcPreset({
      clientId: "client-123",
      redirectUri:
        "https://app.dsrvm.app/api/auth/sso/google-workspace/callback",
      hostedDomain: "acme.com",
    });
    expect(config.name).toBe("google-workspace");
    expect(config.issuer).toBe("https://accounts.google.com");
    expect(config.grant).toBe("code");
    expect(config.extraAuthorizeParams).toEqual({ hd: "acme.com" });
  });

  it("omits the hd param when no hosted domain is set", () => {
    const config = googleWorkspaceOidcPreset({
      clientId: "client-123",
      redirectUri:
        "https://app.dsrvm.app/api/auth/sso/google-workspace/callback",
    });
    expect(config.extraAuthorizeParams).toBeUndefined();
  });

  it("sends the hd param on the authorize URL", async () => {
    const config = googleWorkspaceOidcPreset({
      clientId: "client-123",
      clientSecret: "secret",
      redirectUri: "https://app/cb",
      hostedDomain: "acme.com",
      overrides: {
        authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenEndpoint: "https://oauth2.googleapis.com/token",
      },
    });
    const provider = createSsoProvider("google-workspace", config);
    const url = new URL(
      await provider.authorizeUrl({ state: "s", nonce: "n" }),
    );
    expect(url.searchParams.get("hd")).toBe("acme.com");
    expect(url.searchParams.get("response_type")).toBe("code");
  });
});

describe("ssoProvidersFromEnv", () => {
  const base = { SSO_BASE_URL: "https://app.dsrvm.app" };

  it("returns no providers when nothing is configured", () => {
    expect(ssoProvidersFromEnv({})).toEqual([]);
  });

  it("requires SSO_BASE_URL before enabling providers", () => {
    expect(
      ssoProvidersFromEnv({
        AZURE_AD_TENANT_ID: "t",
        AZURE_AD_CLIENT_ID: "c",
      }),
    ).toEqual([]);
  });

  it("enables Azure AD when tenant, client, and base URL are set", () => {
    const providers = ssoProvidersFromEnv({
      ...base,
      AZURE_AD_TENANT_ID: "tenant-123",
      AZURE_AD_CLIENT_ID: "client-123",
      AZURE_AD_CLIENT_SECRET: "secret",
    });
    expect(providers.map((p) => p.name)).toEqual(["azure-ad"]);
    const azure = providers[0]!;
    expect(azure.provider).toBe("oidc");
    if (azure.provider === "oidc") {
      expect(azure.redirectUri).toBe(
        "https://app.dsrvm.app/api/auth/sso/azure-ad/callback",
      );
    }
  });

  it("enables Google Workspace with the hosted domain", () => {
    const providers = ssoProvidersFromEnv({
      ...base,
      GOOGLE_CLIENT_ID: "client-123",
      GOOGLE_HOSTED_DOMAIN: "acme.com",
    });
    expect(providers.map((p) => p.name)).toEqual(["google-workspace"]);
    const google = providers[0]!;
    if (google.provider === "oidc") {
      expect(google.extraAuthorizeParams).toEqual({ hd: "acme.com" });
    }
  });

  it("enables both providers together", () => {
    const providers = ssoProvidersFromEnv({
      ...base,
      AZURE_AD_TENANT_ID: "t",
      AZURE_AD_CLIENT_ID: "c",
      GOOGLE_CLIENT_ID: "g",
    });
    expect(providers.map((p) => p.name)).toEqual([
      "azure-ad",
      "google-workspace",
    ]);
  });
});
