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

## Audit

All preference changes are recorded in the tenant audit log
(`GET /api/audit`, action `integration.preferences.update`) and are
readable by owner, admin, and operator roles.
