# Environment Tasks — CMS & AI Integration Keys

Owner: CTO | Status: Active task list for agents and operators

How this file is used: every `.env` change is raised here first as a
checked task so agents apply values consistently across local, staging,
and production. Never commit real secret values — only track _which_
keys are needed, _where_, and _who_ provides them.

Legend: `[ ]` todo · `[x]` applied everywhere · `(local)` / `(staging)` /
`(prod)` partial rollouts.

## Conventions

- Per-tenant preference (`preferredCMS`, `preferredAIService` on the
  tenant row, set via `PATCH /api/tenants/preferences`) always wins.
- Env keys below are **defaults and credentials**, not tenant choices.
- `AI_API_KEY` is a legacy single-key fallback. Prefer the
  provider-specific key (`AZURE_OPENAI_API_KEY`, `GEMINI_API_KEY`, …).
- Operators may touch only CMS/AI keys (see `permissions: aiIntegrate`,
  `cmsIntegrate`). Database, Cloudflare, and API tokens are
  owner/admin-only.

## CMS defaults

- [ ] `CMS_TYPE` — default CMS when a tenant has no `preferredCMS`
      (sharepoint | sitecore | aem | umbraco | dotnetnuke | wordpress |
      opencms | custom | none). Default: `none`.
- [ ] `CMS_API_ENDPOINT` — base URL of the default CMS REST API.
- [ ] `CMS_API_TOKEN` — bearer token for the default CMS (preferred).
- [ ] `CMS_API_USERNAME` / `CMS_API_PASSWORD` — basic-auth fallback for
      CMS kinds that require it (AEM, OpenCms).

## AI provider defaults and credentials

- [ ] `AI_SERVICE_PROVIDER` — default when a tenant has no
      `preferredAIService`
      (azure-openai | openai | gemini | copilot | anthropic | none).
- [ ] `AI_API_KEY` — legacy fallback key (prefer provider-specific keys).
- [ ] `AZURE_OPENAI_API_KEY` — Azure OpenAI resource key.
- [ ] `AZURE_OPENAI_ENDPOINT` — e.g.
      `https://<resource>.openai.azure.com`.
- [ ] `AZURE_OPENAI_DEPLOYMENT` — deployment name (default `gpt-4o-mini`).
- [ ] `GEMINI_API_KEY` — Google AI Studio / Vertex key for Gemini.
- [ ] `COPILOT_API_KEY` + `COPILOT_ENDPOINT` + `COPILOT_DEPLOYMENT` —
      Copilot via an Azure OpenAI-compatible endpoint.

## Rollout checklist (per environment)

1. Add the key to the secrets vault / hosting provider env config.
2. Restart or redeploy the service so the process picks it up.
3. Verify with `GET /api/integrations/resolved` (shows `cmsConfigured`
   and the resolved AI provider — never secret values).
4. Tick the box above with the environment suffix.

## SSO providers (Azure AD + Google Workspace)

`apps/web` builds its provider list from env via `ssoProvidersFromEnv`
— a provider with missing keys is silently skipped, so unset means
"password + invites only".

- [ ] `SSO_BASE_URL` — public base URL used to build redirect URIs
      (`{base}/api/auth/sso/{azure-ad|google-workspace}/callback`).
      Must match the redirect URIs registered in each IdP.
- [ ] `AZURE_AD_TENANT_ID` — directory (tenant) ID from the Entra
      overview page. Use the GUID, not `common`, for single-tenant apps.
- [ ] `AZURE_AD_CLIENT_ID` — Application (client) ID.
- [ ] `AZURE_AD_CLIENT_SECRET` — client secret value (not the secret ID).
- [ ] `GOOGLE_CLIENT_ID` — OAuth 2.0 client ID (Web application type).
- [ ] `GOOGLE_CLIENT_SECRET` — matching client secret.
- [ ] `GOOGLE_HOSTED_DOMAIN` — Workspace domain (e.g. `acme.com`) to
      restrict sign-in to that org. Omit to allow any Google account.

Verify with `GET /api/auth/sso` (lists enabled providers), then complete
a login and confirm the session via `GET /api/auth/me`. See
`docs/web-sso-adapter.md` for the IdP-side runbooks.

## Audit

All preference changes are recorded in the tenant audit log
(`GET /api/audit`, action `integration.preferences.update`) and are
readable by owner, admin, and operator roles.
