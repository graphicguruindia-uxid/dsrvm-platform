import { buildServer as buildApiServer } from "../apps/api/src/server.js";
import { createReviewerApp } from "../apps/hr-automation/src/app.js";
import { createWebReferenceApp } from "../apps/web/src/app.js";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    pass++;
    console.log(`  PASS ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  FAIL ${name}${detail !== undefined ? " :: " + JSON.stringify(detail) : ""}`);
  }
}

async function call(server: { inject: (opts: unknown) => Promise<{ statusCode: number; body: string; json: () => unknown }> }, opts: unknown) {
  return server.inject(opts as never);
}

async function main() {
  console.log("=== API app (apps/api) ===");
  {
    const server = buildApiServer();
    const health = await call(server, { method: "GET", url: "/health" });
    check("GET /health -> 200 ok", health.statusCode === 200 && health.json().status === "ok", health.json());
    await server.close();
  }

  console.log("=== HR automation app (apps/hr-automation) ===");
  {
    const app = createReviewerApp({ provider: "demo" });
    const { server } = app;
    const health = await call(server, { method: "GET", url: "/health" });
    check("GET /health -> 200 ok", health.statusCode === 200 && health.json().status === "ok", health.json());

    const dash = await call(server, { method: "GET", url: "/" });
    check("GET / -> 200 dashboard html", dash.statusCode === 200 && String(dash.body).includes("<html"), dash.statusCode);

    const role = await call(server, {
      method: "POST",
      url: "/api/roles",
      payload: { title: "QA Engineer", requirements: ["test automation"], niceToHave: ["vitest"] },
    });
    check("POST /api/roles -> 201", role.statusCode === 201 && !!role.json().role?.id, role.json());

    const badRole = await call(server, { method: "POST", url: "/api/roles", payload: {} });
    check("POST /api/roles (no title) -> 400", badRole.statusCode === 400, badRole.json());

    const cand = await call(server, {
      method: "POST",
      url: "/api/candidates",
      payload: { roleId: role.json().role.id, name: "Jane Tester", email: "jane@example.com", resumeText: "5 years test automation, Playwright, CI" },
    });
    const candJson = cand.json();
    check("POST /api/candidates -> 201 with screening", cand.statusCode === 201 && !!candJson.candidate?.screening, candJson);
    const candidateId = candJson.candidate?.id;

    const badCand = await call(server, { method: "POST", url: "/api/candidates", payload: { roleId: role.json().role.id, name: "X", email: "x@example.com" } });
    check("POST /api/candidates (missing resumeText) -> 400", badCand.statusCode === 400, badCand.json());

    const list = await call(server, { method: "GET", url: "/api/candidates" });
    check("GET /api/candidates -> contains candidate", list.statusCode === 200 && list.json().candidates.some((c: { id: string }) => c.id === candidateId), list.json());

    const get = await call(server, { method: "GET", url: `/api/candidates/${candidateId}` });
    check("GET /api/candidates/:id -> 200", get.statusCode === 200 && get.json().candidate?.id === candidateId, get.json());

    const review = await call(server, {
      method: "POST",
      url: `/api/candidates/${candidateId}/review`,
      payload: { approved: true, reviewer: "qa-automation", note: "looks good" },
    });
    check("POST /api/candidates/:id/review -> 200 approved", review.statusCode === 200 && review.json().candidate?.status === "approved", review.json());

    const badReview = await call(server, { method: "POST", url: `/api/candidates/${candidateId}/review`, payload: { reviewer: "qa" } });
    check("POST review (no approved) -> 400", badReview.statusCode === 400, badReview.json());

    const missingReview = await call(server, {
      method: "POST",
      url: "/api/candidates/does-not-exist/review",
      payload: { approved: true, reviewer: "qa" },
    });
    check("POST review (unknown candidate) -> 409", missingReview.statusCode === 409, missingReview.json());

    const audit = await call(server, { method: "GET", url: "/api/audit" });
    check("GET /api/audit -> has review event", audit.statusCode === 200 && audit.json().events.some((e: { action: string }) => e.action === "candidate.reviewed"), audit.json());

    const telemetry = await call(server, { method: "GET", url: "/api/telemetry" });
    check("GET /api/telemetry -> report", telemetry.statusCode === 200, telemetry.json());

    await app.close();
  }

  console.log("=== Web reference app (apps/web) ===");
  {
    const app = createWebReferenceApp();
    const { server } = app;
    const health = await call(server, { method: "GET", url: "/health" });
    check("GET /health -> 200 ok", health.statusCode === 200 && health.json().status === "ok", health.json());

    const dash = await call(server, { method: "GET", url: "/" });
    check("GET / -> 200 dashboard html", dash.statusCode === 200 && String(dash.body).includes("<html"), dash.statusCode);

    const tenant = await call(server, { method: "POST", url: "/api/tenants", payload: { name: "Acme Consulting", host: "acme.dsrvm.app" } });
    check("POST /api/tenants -> 201", tenant.statusCode === 201 && !!tenant.json().tenant?.id, tenant.json());
    const tenantId = tenant.json().tenant?.id;

    const dup = await call(server, { method: "POST", url: "/api/tenants", payload: { name: "Acme 2", host: "acme.dsrvm.app" } });
    check("POST /api/tenants (dup host) -> 409", dup.statusCode === 409, dup.json());

    const login = await call(server, { method: "POST", url: "/api/auth/login", payload: { tenantId, email: "owner@acme.dsrvm.app", password: "change-me-now" } });
    check("POST /api/auth/login (seeded owner) -> 200 token", login.statusCode === 200 && !!login.json().token, login.json());
    const token = login.json().token;
    const auth = `Bearer ${token}`;

    const badLogin = await call(server, { method: "POST", url: "/api/auth/login", payload: { tenantId, email: "owner@acme.dsrvm.app", password: "wrong" } });
    check("POST /api/auth/login (bad pw) -> 401", badLogin.statusCode === 401, badLogin.json());

    const me = await call(server, { method: "GET", url: "/api/auth/me", headers: { authorization: auth } });
    check("GET /api/auth/me -> 200 owner", me.statusCode === 200 && me.json().user?.email === "owner@acme.dsrvm.app", me.json());

    const noAuth = await call(server, { method: "GET", url: "/api/content" });
    check("GET /api/content (no auth) -> 401", noAuth.statusCode === 401, noAuth.json());

    const content = await call(server, {
      method: "POST",
      url: "/api/content",
      headers: { authorization: auth },
      payload: { slug: "pricing", title: "Pricing", body: "AI delivery that compounds." },
    });
    check("POST /api/content -> 201", content.statusCode === 201 && !!content.json().item?.id, content.json());
    const contentId = content.json().item?.id;

    const publish = await call(server, {
      method: "PATCH",
      url: `/api/content/${contentId}/status`,
      headers: { authorization: auth },
      payload: { status: "published" },
    });
    check("PATCH /api/content/:id/status -> published", publish.statusCode === 200 && publish.json().item?.status === "published", publish.json());

    const contentList = await call(server, { method: "GET", url: "/api/content", headers: { authorization: auth } });
    check("GET /api/content -> lists item", contentList.statusCode === 200 && contentList.json().items.some((i: { id: string }) => i.id === contentId), contentList.json());

    const usage = await call(server, {
      method: "POST",
      url: "/api/usage",
      headers: { authorization: auth },
      payload: { task: "screening", model: "gpt-4o-mini", inputTokens: 100, outputTokens: 50 },
    });
    check("POST /api/usage -> 201 with cost estimate", usage.statusCode === 201 && typeof usage.json().record?.estCostUsd === "number", usage.json());

    const plans = await call(server, { method: "GET", url: "/api/billing/plans" });
    check("GET /api/billing/plans -> 200", plans.statusCode === 200 && plans.json().plans.length >= 3, plans.json());

    const portal = await call(server, { method: "GET", url: "/api/billing/portal", headers: { authorization: auth } });
    check("GET /api/billing/portal -> 200 (owner)", portal.statusCode === 200 && !!portal.json().statement, portal.json());

    const tenants = await call(server, { method: "GET", url: "/api/tenants", headers: { authorization: auth } });
    check("GET /api/tenants -> 200 (owner)", tenants.statusCode === 200, tenants.json());

    const tenantRes = await call(server, { method: "GET", url: "/api/tenant", headers: { host: "acme.dsrvm.app" } });
    check("GET /api/tenant (host resolve) -> 200 acme", tenantRes.statusCode === 200 && tenantRes.json().tenant?.hosts?.includes("acme.dsrvm.app"), tenantRes.json());

    const noTenant = await call(server, { method: "GET", url: "/api/tenant", headers: { host: "unknown.example.com" } });
    check("GET /api/tenant (unknown host) -> 404", noTenant.statusCode === 404, noTenant.json());

    const sso = await call(server, { method: "GET", url: "/api/auth/sso" });
    check("GET /api/auth/sso -> 200 providers", sso.statusCode === 200 && Array.isArray(sso.json().providers), sso.json());

    await app.close();
  }

  console.log("");
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log("FAILED: " + failures.join(", "));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
