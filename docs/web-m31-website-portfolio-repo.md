# Company website portfolio repo — assess, align, plan (DSRA-16)

## Scope

`D:\Downloads\ggindia\dsrvmltd` — the static marketing site for `https://www.dsrvmltd.co.uk`.
Repo: `graphicguruindia-uxid/dsrvmltd` (git, remote already pointing at the CEO-approved org).
Work delivered and pushed as commit `be17233` (`main`).

## Assessment

The site is a hand-authored static HTML/CSS/JS surface: 7 pages (index, services,
case-studies, team, contact, privacy-policy, terms) plus `robots.txt`, `sitemap.xml`,
`CNAME`, `BingSiteAuth.xml`, and local `css/`, `js/`, `images/`, `fonts/` assets. CDN
Bootstrap + Font Awesome. Contact form via EmailJS. Inline JSON-LD (ProfessionalService,
FAQPage, ItemList) plus page-level schema injected by `js/structured-data.js`. No build,
no framework, no package manifest.

Strengths: strong AI/enterprise/ITSM messaging; HR themes already present in case studies
and contact meta; SEO plumbing (robots, sitemap, Bing/Google verification) in place.

Gaps found:
1. **Security — credential committed.** The `CNAME` file carried a plaintext hosting
   control-panel password. Removed from the file and from the pushed commit. The credential
   is still in git history → **must be rotated** at the hosting/registrar account.
2. **Offer alignment.** No HR Automation service anywhere in the visible site and no
   CareerForge reflection (DSRA-15 companion), while the offer explicitly includes HR
   automation.
3. **Deployment not wired.** No Vercel config or deploy documentation; `CNAME` is a
   GitHub-Pages-style file.
4. **No validation harness.** No build/test gate for a "verify green" workflow; links and
   structured data were uncheckable.
5. **Contact routing risk.** EmailJS template recipient is configured to
   `info@graphicguru.in` (per `js/contact.js` setup notes) — should be
   `info@dsrvmltd.co.uk`. Flagged in DEPLOYMENT.md checklist.

## Architecture decision — keep static, do not migrate to @dsrvm/web

Documented in `docs/WEBSITE-DECISION.md` (in the site repo). The company site is a
marketing/portfolio surface; `@dsrvm/web` + `apps/web` (DSRA-7/12/13/14) is the enterprise
product line (Postgres, SSO, billing) for customers. Porting the marketing pages onto that
stack adds cost with no benefit. The two align through seams: offer/messaging, CareerForge
HR reflection, and shared brand assets. Revisit only if the site becomes a CMS-managed
content hub or needs interactive product surfaces (then a subdomain runs the web stack).

## What shipped (commit `be17233`, pushed to origin/main)

- **services.html** — new **HR Automation & CareerForge AI** service section
  (`#hr-automation`), anchor-nav, footer link, ItemList JSON-LD entry (6 services), SEO
  title/meta updated, section alternation preserved.
- **index.html** — HR Automation teaser card on the services grid, OfferCatalog +
  `knowsAbout` JSON-LD extended, heading "Six Services".
- **js/structured-data.js** — Service schema entry for HR Automation aligned to the real
  CareerForge product (resume parsing, UK role gap analysis, ATS compliance, CV/cover
  letter/LinkedIn drafts, employer-side intake + AI screening).
- **sitemap.xml** — added `services.html#hr-automation`, refreshed lastmod for index/services.
- **CNAME** — credential removed (canonical domain only).
- **vercel.json** + **docs/DEPLOYMENT.md** — static Vercel deploy config (security headers,
  long-lived image caching), DNS/CNAME notes, post-deploy checklist.
- **docs/WEBSITE-DECISION.md** — static vs @dsrvm/web decision record.
- **package.json** + **scripts/check-site.mjs** — zero-dependency static-site validation
  (`npm test`): CNAME integrity, no embedded passwords, robots→sitemap, sitemap URLs and
  anchors resolve, all local href/src resolve, inline JSON-LD parses, HR/CareerForge offer
  present.

## Verification

`node scripts/check-site.mjs` → **all 8 checks pass** (7 pages, 13 sitemap URLs).
Files are UTF-8 throughout (no encoding corruption; earlier mojibake was a console artifact).

## Deployment wiring

- Vercel is the target per the DSRA-4 stack decision. Import
  `graphicguruindia-uxid/dsrvmltd` → Framework: *Other* → add `www.dsrvmltd.co.uk` (+ apex)
  in Domains. Steps + DNS records in `docs/DEPLOYMENT.md`.
- DSRA-4 (deploy credentials) is the remaining blocker for actual go-live of the new deploy
  pipeline; the repo itself is deploy-ready and pushed.
- When CareerForge deploys under the `dsrvmltd.co.uk` domain (`/careerforge/` or subdomain),
  point the new service section's CTA at the live product URL.

## Follow-ups

1. Rotate the hosting control-panel credential that was previously committed in `CNAME`.
2. Confirm the live EmailJS dashboard *template* `To Email` field is `info@dsrvmltd.co.uk`
   (code + setup notes now aligned; dashboard setting is the last link).
3. Optional GitHub Action: run `npm test` on PRs (static, no build required).
4. Later: consider a `careerforge` landing surface once the product is deployed.

## Post-release verification (2026-08-06, board localhost)

Board stood up `http://192.168.1.43:8083/` (IIS) for live testing. Verified served bytes
== committed `be17233` (byte-identical); all 7 pages + robots + sitemap return 200; HR
Automation/CareerForge content live (services `#hr-automation`, homepage card, JSON-LD);
all 226 local refs and 13 sitemap URLs resolve 200; `npm test` 8/8.

Follow-up fix pushed as commit `b0f5d2c`: EmailJS setup note in `js/contact.js` pointed the
template `To Email` at `info@graphicguru.in` — corrected to `info@dsrvmltd.co.uk`;
`docs/DEPLOYMENT.md` checklist updated; new `.github/workflows/check-site.yml` runs
`npm test` on PRs/main. Live server picked the JS fix up immediately.
