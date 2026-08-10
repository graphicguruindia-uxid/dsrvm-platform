import { createHmac } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildServer as buildApiServer } from "../apps/api/src/server.js";
import { createReviewerApp } from "../apps/hr-automation/src/app.js";
import { createWebReferenceApp } from "../apps/web/src/app.js";

const WEBHOOK_SECRET = "smoke-webhook-secret";
const SSO_CLIENT_ID = "client-123";
const SSO_SECRET = "smoke-sso-secret";

function b64url(data: string | Buffer): string {
  return Buffer.from(data).toString("base64url");
}

function signHs256(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  secret: string,
): string {
  const input = `${b64url(JSON.stringify(header))}.${b64url(
    JSON.stringify(payload),
  )}`;
  const sig = createHmac("sha256", secret).update(input).digest("base64url");
  return `${input}.${sig}`;
}

function webhookSign(secret: string, body: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

const startedAt = new Date().toISOString();
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
    console.log(
      `  FAIL ${name}${detail !== undefined ? " :: " + JSON.stringify(detail) : ""}`,
    );
  }
}

async function call(
  server: {
    inject: (
      opts: unknown,
    ) => Promise<{ statusCode: number; body: string; json: () => unknown }>;
  },
  opts: unknown,
) {
  return server.inject(opts as never);
}

async function main() {
  console.log("=== API app (apps/api) ===");
  {
    const server = buildApiServer();
    const health = await call(server, { method: "GET", url: "/health" });
    check(
      "GET /health -> 200 ok",
      health.statusCode === 200 && health.json().status === "ok",
      health.json(),
    );
    await server.close();
  }

  console.log("=== HR automation app (apps/hr-automation) ===");
  {
    const app = createReviewerApp({ provider: "demo" });
    const { server } = app;
    const health = await call(server, { method: "GET", url: "/health" });
    check(
      "GET /health -> 200 ok",
      health.statusCode === 200 && health.json().status === "ok",
      health.json(),
    );

    const dash = await call(server, { method: "GET", url: "/" });
    check(
      "GET / -> 200 dashboard html",
      dash.statusCode === 200 && String(dash.body).includes("<html"),
      dash.statusCode,
    );

    const role = await call(server, {
      method: "POST",
      url: "/api/roles",
      payload: {
        title: "QA Engineer",
        requirements: ["test automation"],
        niceToHave: ["vitest"],
      },
    });
    check(
      "POST /api/roles -> 201",
      role.statusCode === 201 && !!role.json().role?.id,
      role.json(),
    );
    const roleId = role.json().role?.id as string;

    const roleList = await call(server, { method: "GET", url: "/api/roles" });
    check(
      "GET /api/roles -> lists created role",
      roleList.statusCode === 200 &&
        roleList.json().roles.some((r: { id: string }) => r.id === roleId),
      roleList.json(),
    );

    const badRole = await call(server, {
      method: "POST",
      url: "/api/roles",
      payload: {},
    });
    check(
      "POST /api/roles (no title) -> 400",
      badRole.statusCode === 400,
      badRole.json(),
    );

    const cand = await call(server, {
      method: "POST",
      url: "/api/candidates",
      payload: {
        roleId: role.json().role.id,
        name: "Jane Tester",
        email: "jane@example.com",
        resumeText: "5 years test automation, Playwright, CI",
      },
    });
    const candJson = cand.json();
    check(
      "POST /api/candidates -> 201 with screening",
      cand.statusCode === 201 && !!candJson.candidate?.screening,
      candJson,
    );
    const candidateId = candJson.candidate?.id;

    check(
      "DSRA-27: POST /api/candidates returns the AI transparency notice",
      candJson.notice?.version === "v1" &&
        typeof candJson.notice?.text === "string" &&
        candJson.notice.text.includes("A human reviewer always makes"),
      candJson,
    );

    const ackOutbox = await app.hr.pendingOutbox();
    const ackEvent = ackOutbox.find((e) => e.type === "candidate.acknowledged");
    check(
      "DSRA-27/R6: candidate.acknowledged outbox event carries the notice",
      !!ackEvent && ackEvent.payload?.notice?.version === "v1",
      ackOutbox,
    );

    const auditAfterCreate = await app.hr.auditLog();
    check(
      "DSRA-27/R6: candidate.ai_notice audit event at pending_screening",
      auditAfterCreate.some(
        (e) =>
          e.action === "candidate.ai_notice" &&
          e.candidateId === candidateId &&
          e.detail?.disclosedAt === "pending_screening",
      ),
      auditAfterCreate,
    );

    const badCand = await call(server, {
      method: "POST",
      url: "/api/candidates",
      payload: {
        roleId: role.json().role.id,
        name: "X",
        email: "x@example.com",
      },
    });
    check(
      "POST /api/candidates (missing resumeText) -> 400",
      badCand.statusCode === 400,
      badCand.json(),
    );

    const list = await call(server, { method: "GET", url: "/api/candidates" });
    check(
      "GET /api/candidates -> contains candidate",
      list.statusCode === 200 &&
        list
          .json()
          .candidates.some((c: { id: string }) => c.id === candidateId),
      list.json(),
    );

    const get = await call(server, {
      method: "GET",
      url: `/api/candidates/${candidateId}`,
    });
    check(
      "GET /api/candidates/:id -> 200",
      get.statusCode === 200 && get.json().candidate?.id === candidateId,
      get.json(),
    );

    const review = await call(server, {
      method: "POST",
      url: `/api/candidates/${candidateId}/review`,
      payload: {
        approved: true,
        reviewer: "qa-automation",
        note: "looks good",
      },
    });
    check(
      "POST /api/candidates/:id/review -> 200 approved",
      review.statusCode === 200 &&
        review.json().candidate?.status === "approved",
      review.json(),
    );

    const outboxAfterReview = await app.hr.pendingOutbox();
    check(
      "DSRA-27/AUP4: every status email (ack + approved) carries the notice",
      outboxAfterReview.length >= 2 &&
        outboxAfterReview.every(
          (e) =>
            e.type === "candidate.acknowledged" ||
            e.type === "candidate.approved",
        ) &&
        outboxAfterReview.every((e) => e.payload?.notice?.version === "v1"),
      outboxAfterReview,
    );

    await app.store.candidates.create({
      id: "qa-undisclosed",
      roleId: role.json().role.id,
      name: "No Notice",
      email: "no-notice@example.com",
      resumeText: "QA.",
      status: "pending_review",
      screening: {
        score: 80,
        recommendation: "advance",
        summary: "ok",
        strengths: [],
        flags: [],
        provider: "demo",
        model: "demo-v1",
        screenedAt: new Date().toISOString(),
      },
      review: null,
      aiNoticeDisclosedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const blockedReview = await call(server, {
      method: "POST",
      url: "/api/candidates/qa-undisclosed/review",
      payload: { approved: true, reviewer: "qa-automation" },
    });
    check(
      "DSRA-27/R6: review blocked with 400 until the AI notice is disclosed",
      blockedReview.statusCode === 400 &&
        typeof blockedReview.json().error === "string" &&
        blockedReview
          .json()
          .error.includes("has not been disclosed the AI transparency notice"),
      blockedReview.json(),
    );

    const badReview = await call(server, {
      method: "POST",
      url: `/api/candidates/${candidateId}/review`,
      payload: { reviewer: "qa" },
    });
    check(
      "POST review (no approved) -> 400",
      badReview.statusCode === 400,
      badReview.json(),
    );

    const missingReview = await call(server, {
      method: "POST",
      url: "/api/candidates/does-not-exist/review",
      payload: { approved: true, reviewer: "qa" },
    });
    check(
      "POST review (unknown candidate) -> 409",
      missingReview.statusCode === 409,
      missingReview.json(),
    );

    const audit = await call(server, { method: "GET", url: "/api/audit" });
    check(
      "GET /api/audit -> has review event",
      audit.statusCode === 200 &&
        audit
          .json()
          .events.some(
            (e: { action: string }) => e.action === "candidate.reviewed",
          ),
      audit.json(),
    );

    const telemetry = await call(server, {
      method: "GET",
      url: "/api/telemetry",
    });
    check(
      "GET /api/telemetry -> report",
      telemetry.statusCode === 200,
      telemetry.json(),
    );

    const retention = await call(server, {
      method: "POST",
      url: "/api/retention/cleanup",
    });
    const retentionCounts = retention.json().counts;
    check(
      "G6: POST /api/retention/cleanup -> 200 counts",
      retention.statusCode === 200 &&
        typeof retentionCounts?.candidatesDeleted === "number" &&
        typeof retentionCounts?.auditAnonymized === "number" &&
        typeof retentionCounts?.outboxExpired === "number",
      retention.json(),
    );

    const approved = await call(server, {
      method: "GET",
      url: "/api/candidates?status=approved",
    });
    check(
      "GET /api/candidates?status=approved -> filter works",
      approved.statusCode === 200 &&
        approved
          .json()
          .candidates.some((c: { id: string }) => c.id === candidateId),
      approved.json(),
    );

    const csvImport = await call(server, {
      method: "POST",
      url: "/api/candidates/import",
      payload: {
        csv: "name,email,resume text\nAlice Import,alice.import@example.com,QA automation Playwright\nBob Import,bob.import@example.com,Cypress e2e suites",
        defaultRoleId: roleId,
      },
    });
    check(
      "POST /api/candidates/import (csv) -> 201 imported 2",
      csvImport.statusCode === 201 && csvImport.json().result?.imported === 2,
      csvImport.json(),
    );

    const emailImport = await call(server, {
      method: "POST",
      url: "/api/candidates/import",
      payload: {
        email:
          "From: Carol Import <carol.import@example.com>\nSubject: CV - Carol Import\n\nCarol Import\n5 years test automation, Playwright, CI",
        defaultRoleId: roleId,
      },
    });
    check(
      "POST /api/candidates/import (email) -> 201 imported 1",
      emailImport.statusCode === 201 &&
        emailImport.json().result?.imported === 1,
      emailImport.json(),
    );

    const outboxAfterImport = await app.hr.pendingOutbox();
    const importAcks = outboxAfterImport.filter(
      (e) => e.type === "candidate.acknowledged",
    );
    const auditAfterImport = await app.hr.auditLog();
    const importedNoticeAudits = auditAfterImport.filter(
      (e) =>
        e.action === "candidate.ai_notice" && e.candidateId !== candidateId,
    );
    check(
      "DSRA-27/AUP4 no-bypass: imported candidates get ack email + notice audit",
      importAcks.length >= 4 &&
        importAcks.every((e) => e.payload?.notice?.version === "v1") &&
        importedNoticeAudits.length === 3,
      {
        importAcks: importAcks.length,
        importedNoticeAudits: importedNoticeAudits.length,
      },
    );

    const emptyImport = await call(server, {
      method: "POST",
      url: "/api/candidates/import",
      payload: {},
    });
    check(
      "POST /api/candidates/import (empty) -> 400",
      emptyImport.statusCode === 400,
      emptyImport.json(),
    );

    await app.close();
  }

  console.log("=== Web reference app (apps/web) ===");
  {
    const app = createWebReferenceApp({
      billingWebhookSecret: WEBHOOK_SECRET,
      ssoProviders: [
        {
          provider: "oidc",
          name: "google",
          clientId: SSO_CLIENT_ID,
          clientSecret: SSO_SECRET,
          issuer: "https://accounts.google.com",
          redirectUri: "https://acme.dsrvm.app/api/auth/sso/google/callback",
          authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
          tokenEndpoint: "https://oauth2.googleapis.com/token",
          grant: "implicit",
          defaultRole: "viewer",
        },
      ],
    });
    const { server } = app;
    const health = await call(server, { method: "GET", url: "/health" });
    check(
      "GET /health -> 200 ok",
      health.statusCode === 200 && health.json().status === "ok",
      health.json(),
    );

    const dash = await call(server, { method: "GET", url: "/" });
    check(
      "GET / -> 200 dashboard html",
      dash.statusCode === 200 && String(dash.body).includes("<html"),
      dash.statusCode,
    );

    const tenant = await call(server, {
      method: "POST",
      url: "/api/tenants",
      payload: { name: "Acme Consulting", host: "acme.dsrvm.app" },
    });
    check(
      "POST /api/tenants -> 201",
      tenant.statusCode === 201 && !!tenant.json().tenant?.id,
      tenant.json(),
    );
    const tenantId = tenant.json().tenant?.id;

    const dup = await call(server, {
      method: "POST",
      url: "/api/tenants",
      payload: { name: "Acme 2", host: "acme.dsrvm.app" },
    });
    check(
      "POST /api/tenants (dup host) -> 409",
      dup.statusCode === 409,
      dup.json(),
    );

    const login = await call(server, {
      method: "POST",
      url: "/api/auth/login",
      payload: {
        tenantId,
        email: "owner@acme.dsrvm.app",
        password: "change-me-now",
      },
    });
    check(
      "POST /api/auth/login (seeded owner) -> 200 token",
      login.statusCode === 200 && !!login.json().token,
      login.json(),
    );
    const token = login.json().token;
    const auth = `Bearer ${token}`;

    const badLogin = await call(server, {
      method: "POST",
      url: "/api/auth/login",
      payload: { tenantId, email: "owner@acme.dsrvm.app", password: "wrong" },
    });
    check(
      "POST /api/auth/login (bad pw) -> 401",
      badLogin.statusCode === 401,
      badLogin.json(),
    );

    const me = await call(server, {
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: auth },
    });
    check(
      "GET /api/auth/me -> 200 owner",
      me.statusCode === 200 && me.json().user?.email === "owner@acme.dsrvm.app",
      me.json(),
    );

    const noAuth = await call(server, { method: "GET", url: "/api/content" });
    check(
      "GET /api/content (no auth) -> 401",
      noAuth.statusCode === 401,
      noAuth.json(),
    );

    const content = await call(server, {
      method: "POST",
      url: "/api/content",
      headers: { authorization: auth },
      payload: {
        slug: "pricing",
        title: "Pricing",
        body: "AI delivery that compounds.",
      },
    });
    check(
      "POST /api/content -> 201",
      content.statusCode === 201 && !!content.json().item?.id,
      content.json(),
    );
    const contentId = content.json().item?.id;

    const publish = await call(server, {
      method: "PATCH",
      url: `/api/content/${contentId}/status`,
      headers: { authorization: auth },
      payload: { status: "published" },
    });
    check(
      "PATCH /api/content/:id/status -> published",
      publish.statusCode === 200 && publish.json().item?.status === "published",
      publish.json(),
    );

    const contentList = await call(server, {
      method: "GET",
      url: "/api/content",
      headers: { authorization: auth },
    });
    check(
      "GET /api/content -> lists item",
      contentList.statusCode === 200 &&
        contentList
          .json()
          .items.some((i: { id: string }) => i.id === contentId),
      contentList.json(),
    );

    const usage = await call(server, {
      method: "POST",
      url: "/api/usage",
      headers: { authorization: auth },
      payload: {
        task: "screening",
        model: "gpt-4o-mini",
        inputTokens: 100,
        outputTokens: 50,
      },
    });
    check(
      "POST /api/usage -> 201 with cost estimate",
      usage.statusCode === 201 &&
        typeof usage.json().record?.estCostUsd === "number",
      usage.json(),
    );

    const plans = await call(server, {
      method: "GET",
      url: "/api/billing/plans",
    });
    check(
      "GET /api/billing/plans -> 200",
      plans.statusCode === 200 && plans.json().plans.length >= 3,
      plans.json(),
    );

    const portal = await call(server, {
      method: "GET",
      url: "/api/billing/portal",
      headers: { authorization: auth },
    });
    check(
      "GET /api/billing/portal -> 200 (owner)",
      portal.statusCode === 200 && !!portal.json().statement,
      portal.json(),
    );

    const tenants = await call(server, {
      method: "GET",
      url: "/api/tenants",
      headers: { authorization: auth },
    });
    check(
      "GET /api/tenants -> 200 (owner)",
      tenants.statusCode === 200,
      tenants.json(),
    );

    const tenantRes = await call(server, {
      method: "GET",
      url: "/api/tenant",
      headers: { host: "acme.dsrvm.app" },
    });
    check(
      "GET /api/tenant (host resolve) -> 200 acme",
      tenantRes.statusCode === 200 &&
        tenantRes.json().tenant?.hosts?.includes("acme.dsrvm.app"),
      tenantRes.json(),
    );

    const noTenant = await call(server, {
      method: "GET",
      url: "/api/tenant",
      headers: { host: "unknown.example.com" },
    });
    check(
      "GET /api/tenant (unknown host) -> 404",
      noTenant.statusCode === 404,
      noTenant.json(),
    );

    const sso = await call(server, { method: "GET", url: "/api/auth/sso" });
    check(
      "GET /api/auth/sso -> 200 providers",
      sso.statusCode === 200 && Array.isArray(sso.json().providers),
      sso.json(),
    );

    const ssoLogin = await call(server, {
      method: "GET",
      url: `/api/auth/sso/google/login?tenantId=${tenantId}`,
    });
    check(
      "GET /api/auth/sso/google/login -> 200 redirect + state",
      ssoLogin.statusCode === 200 &&
        !!ssoLogin.json().state &&
        !!ssoLogin.json().redirectUrl,
      ssoLogin.json(),
    );
    const ssoState = ssoLogin.json().state as string;
    const ssoNonce =
      new URL(ssoLogin.json().redirectUrl as string).searchParams.get(
        "nonce",
      ) ?? "";

    const ssoToken = signHs256(
      { alg: "HS256", typ: "JWT" },
      {
        iss: "https://accounts.google.com",
        aud: SSO_CLIENT_ID,
        sub: "google-sso-1",
        email: "sso.user@acme.dsrvm.app",
        name: "SSO User",
        nonce: ssoNonce,
        iat: Math.floor(Date.now() / 1000) - 60,
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      SSO_SECRET,
    );
    const ssoCallbackOk = await call(server, {
      method: "GET",
      url: `/api/auth/sso/google/callback?id_token=${encodeURIComponent(
        ssoToken,
      )}&state=${encodeURIComponent(ssoState)}`,
    });
    check(
      "GET /api/auth/sso/google/callback (valid id_token) -> 200 user",
      ssoCallbackOk.statusCode === 200 &&
        !!ssoCallbackOk.json().token &&
        ssoCallbackOk.json().identity?.email === "sso.user@acme.dsrvm.app",
      ssoCallbackOk.json(),
    );

    const signup = await call(server, {
      method: "POST",
      url: "/api/auth/signup",
      payload: {
        tenantId,
        email: "viewer@acme.dsrvm.app",
        password: "viewer-pass-1",
        name: "Viewer One",
        role: "viewer",
      },
    });
    check(
      "POST /api/auth/signup (viewer) -> 201 token",
      signup.statusCode === 201 && !!signup.json().token,
      signup.json(),
    );
    const viewerToken = signup.json().token as string;

    const dupSignup = await call(server, {
      method: "POST",
      url: "/api/auth/signup",
      payload: {
        tenantId,
        email: "viewer@acme.dsrvm.app",
        password: "viewer-pass-1",
        name: "Viewer Duplicate",
      },
    });
    check(
      "POST /api/auth/signup (dup email) -> 409",
      dupSignup.statusCode === 409,
      dupSignup.json(),
    );

    const logout = await call(server, {
      method: "POST",
      url: "/api/auth/logout",
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    check(
      "POST /api/auth/logout -> 200 ok",
      logout.statusCode === 200 && logout.json().ok === true,
      logout.json(),
    );

    const meAfterLogout = await call(server, {
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    check(
      "GET /api/auth/me (logged out token) -> 401",
      meAfterLogout.statusCode === 401,
      meAfterLogout.json(),
    );

    const planChange = await call(server, {
      method: "PATCH",
      url: "/api/billing/plan",
      headers: { authorization: auth },
      payload: { plan: "starter" },
    });
    check(
      "PATCH /api/billing/plan -> 200 starter",
      planChange.statusCode === 200 &&
        planChange.json().tenant?.plan === "starter",
      planChange.json(),
    );

    const badPlan = await call(server, {
      method: "PATCH",
      url: "/api/billing/plan",
      headers: { authorization: auth },
      payload: { plan: "platinum" },
    });
    check(
      "PATCH /api/billing/plan (unknown plan) -> 400",
      badPlan.statusCode === 400,
      badPlan.json(),
    );

    const webhookBody = JSON.stringify({
      id: "evt_sub_1",
      type: "customer.subscription.updated",
      createdAt: new Date().toISOString(),
      data: { tenantId, plan: "enterprise" },
    });
    const webhookSig = webhookSign(WEBHOOK_SECRET, webhookBody);
    const webhook = await call(server, {
      method: "POST",
      url: "/api/billing/webhooks",
      headers: {
        "content-type": "application/json",
        "x-billing-signature": webhookSig,
      },
      payload: webhookBody,
    });
    check(
      "POST /api/billing/webhooks (valid sig) -> 200 handled",
      webhook.statusCode === 200 && webhook.json().handled === true,
      webhook.json(),
    );

    const badSig = await call(server, {
      method: "POST",
      url: "/api/billing/webhooks",
      headers: {
        "content-type": "application/json",
        "x-billing-signature": "t=0,v1=deadbeef",
      },
      payload: webhookBody,
    });
    check(
      "POST /api/billing/webhooks (bad sig) -> 401",
      badSig.statusCode === 401,
      badSig.json(),
    );

    const adminOverview = await call(server, {
      method: "GET",
      url: "/api/admin/overview",
      headers: { authorization: auth },
    });
    check(
      "GET /api/admin/overview (owner) -> 200 tenants",
      adminOverview.statusCode === 200 &&
        typeof adminOverview.json().tenants === "number" &&
        adminOverview.json().tenants >= 1,
      adminOverview.json(),
    );

    const adminDenied = await call(server, {
      method: "GET",
      url: "/api/admin/overview",
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    check(
      "GET /api/admin/overview (logged-out viewer) -> 401",
      adminDenied.statusCode === 401,
      adminDenied.json(),
    );

    const viewerLogin = await call(server, {
      method: "POST",
      url: "/api/auth/login",
      payload: {
        tenantId,
        email: "viewer@acme.dsrvm.app",
        password: "viewer-pass-1",
      },
    });
    check(
      "POST /api/auth/login (viewer re-login) -> 200 token",
      viewerLogin.statusCode === 200 && !!viewerLogin.json().token,
      viewerLogin.json(),
    );
    const viewerSessionToken = viewerLogin.json().token as string;

    const adminViewerDenied = await call(server, {
      method: "GET",
      url: "/api/admin/overview",
      headers: { authorization: `Bearer ${viewerSessionToken}` },
    });
    check(
      "GET /api/admin/overview (viewer role) -> 403",
      adminViewerDenied.statusCode === 403,
      adminViewerDenied.json(),
    );

    const ssoCallback = await call(server, {
      method: "GET",
      url: `/api/auth/sso/google/callback?id_token=malformed&state=${ssoState}`,
    });
    check(
      "GET /api/auth/sso/google/callback (bad id_token) -> 401",
      ssoCallback.statusCode === 401,
      ssoCallback.json(),
    );

    await app.close();
  }

  console.log("");
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  const summary = {
    suite: "qa-smoke",
    startedAt,
    finishedAt: new Date().toISOString(),
    pass,
    fail,
    total: pass + fail,
    status: fail > 0 ? ("FAIL" as const) : ("PASS" as const),
    failures,
  };
  writeFileSync(
    join(process.cwd(), "qa-report.json"),
    JSON.stringify(summary, null, 2),
  );
  if (fail > 0) {
    console.log("FAILED: " + failures.join(", "));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
