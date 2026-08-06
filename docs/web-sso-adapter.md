# DSRVM Web Reference Architecture - M3.1 SSO Adapter (OIDC + SAML)

Owner: CTO (0a60ddf9) | Status: v1 (done) | Date: 2026-08-04 | Linked: DSRA-13 (parent DSRA-7)

## Summary

Enterprise web clients sign in with their IdP (Google/Azure/Okta), not passwords. This milestone
adds a pluggable SSO seam to `@dsrvm/web` (v0.3.0) behind the existing auth service, mirroring the
provider-agnostic pattern already used for AI providers in `@dsrvm/ai`.

**Zero runtime dependencies** - JWT (HS256/RS256), JWKS, and SAML XML handling are implemented on
`node:crypto` so the kit stays dependency-light and fully testable offline.

## What was built

### packages/web `src/sso.ts` (new)

- `SsoProviderConfig` - `OidcSsoConfig` | `SamlSsoConfig` (each carries `name`).
- `SsoProvider` abstraction: `authorizeUrl`, `extractState`, `handleCallback`, `roleFor`.
- **OIDC adapter** (`createOidcProvider`):
  - `authorization_code` (default) and `implicit` (`id_token`) grants.
  - Authorize URL builder (client_id, redirect_uri, scope, state, nonce).
  - Token-endpoint exchange (form POST, injected `fetchFn` for tests).
  - id_token verification: `iss`, `aud` (string or array), `exp`, `nbf`, `nonce`, `sub`;
    HS256 via HMAC-SHA256 and RS256 via JWKS (`kid` lookup + fallback to first RSA key);
    optional OIDC discovery (`/.well-known/openid-configuration` + `jwks_uri`).
- **SAML adapter** (`createSamlProvider`):
  - HTTP-Redirect AuthnRequest builder (base64 `SAMLRequest` + `RelayState`).
  - HTTP-POST response parser: NameID + `Attribute`/`AttributeValue` extraction
    (loose namespace regex; maps email/displayName/name/cn and groups/memberOf/role).
  - Optional RSA-SHA256 signature verification over the `SignedInfo` substring when a
    certificate is configured (throws if signature present but invalid, or absent when expected).
- **`SsoService`** (`createSsoService`):
  - Single-use `state` + `nonce` store with 10-minute TTL (replay + expiry protection).
  - `login({provider, tenantId})` -> validate tenant, issue state/nonce, return `redirectUrl`.
  - `handleCallback({provider, params})` -> consume state -> verify identity -> map role
    (`defaultRole` + `roleByGroup`, highest-precedence role wins) -> `auth.ssoLogin` upsert.

### packages/web `src/auth.ts`

- `auth.ssoLogin({tenantId, email, name, role})` - upsert a user by `(tenant, email)`
  (create with empty `passwordHash` on first login, or update role), issue the standard opaque
  7-day session. Returns `{user, token, created}`.

### packages/web `src/service.ts` / `src/index.ts`

- `WebReferenceService.sso` added; `createWebReferenceService(store, options)` now accepts
  `{now?, ssoProviders?}` (the old `(store, now)` signature still works).

### apps/web

- `GET /api/auth/sso` - list configured providers.
- `GET /api/auth/sso/:provider/login?tenantId=...` - returns `{redirectUrl, state}`.
- `GET|POST /api/auth/sso/:provider/callback` - OIDC (query: `code`|`id_token` + `state`)
  and SAML (form: `SAMLResponse` + `RelayState`); returns `{user, token, created, identity}`.
- `createWebReferenceApp({ ssoProviders })` wires the seam (default empty).

## Verification

- `packages/web`: 36 tests pass (21 new SSO tests: HS256 implicit, RS256/JWKS incl. wrong-key
  rejection, code-grant token exchange incl. failure, expired/nonce/issuer/audience/signature
  rejection, state replay + 10-min expiry, group->role mapping, upsert-on-repeat, SAML parse +
  role mapping + signed round-trip + bad-signature/unsigned rejections + missing NameID).
- `apps/web`: 8 tests pass (2 new HTTP tests: full OIDC login-to-session, forged-token 401).
- Monorepo `turbo run lint typecheck test build` - 40/40 tasks green.
- Live smoke on :3210: providers listed; OIDC implicit login -> alice created as `admin`
  (via `groups: platform-owners`); SSO token accepted by `/api/auth/me`; SAML POST callback ->
  bob created as `admin` (via `memberOf: hr-admins`); admin overview unaffected.

## Production notes / limits

- The SAML signature verifier checks the `SignedInfo` *substring* bytes (works for
  straightforward IdPs). Spec-canonical XML (C14N) and encrypted assertions need a full SAML
  library (e.g. `@node-rs/xmldsig`); swap the adapter internals, keep the `SsoProvider` seam.
- SSO provider config is app-level today; per-tenant provider scoping + IdP-initiated (SP/IdP
  metadata exchange) is a follow-up (M3.x).
- `auth.ssoLogin` trusts `email` from the verified identity; configure the IdP to emit verified
  `email`/`email_verified` claims. Role mapping is group-driven (`roleByGroup`).
- HS256 is for demo/self-hosted IdPs only - production should use RS256 with rotated JWKS.
