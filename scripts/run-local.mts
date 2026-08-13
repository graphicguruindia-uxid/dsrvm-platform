import { buildServer as buildApiServer } from "../apps/api/src/server.js";
import { createReviewerApp } from "../apps/hr-automation/src/app.js";
import { seedDemo } from "../apps/hr-automation/src/seed.js";
import { createWebReferenceApp } from "../apps/web/src/app.js";
import { seedReference } from "../apps/web/src/seed.js";

const API_PORT = Number(process.env.API_PORT ?? 8899);
const HR_PORT = Number(process.env.HR_PORT ?? 3002);
const WEB_PORT = Number(process.env.WEB_PORT ?? 3003);
const SEED = process.env.SEED_DEMO === "1";

const signal = new AbortController().signal;

const api = buildApiServer();
const hr = createReviewerApp({
  provider: (process.env.PROVIDER ?? "demo") as "demo",
  databaseUrl: process.env.DATABASE_URL,
  signal,
  telemetryTtlMs: process.env.TELEMETRY_TTL_MS
    ? Number(process.env.TELEMETRY_TTL_MS)
    : undefined,
});
const web = createWebReferenceApp({
  databaseUrl: process.env.DATABASE_URL,
  billingWebhookSecret: process.env.BILLING_WEBHOOK_SECRET,
});

if (SEED) {
  const seeded = await seedDemo(hr.hr);
  console.log(
    `seeded hr-automation: role ${seeded.roleId}, ${seeded.candidateIds.length} candidates screened`,
  );
  const ref = await seedReference(web.service);
  console.log(`seeded web: ${ref.tenantIds.length} tenants (acme/beta.dsrvm.app)`);
}

await api.listen({ port: API_PORT, host: "0.0.0.0" });
await hr.server.listen({ port: HR_PORT, host: "0.0.0.0" });
await web.server.listen({ port: WEB_PORT, host: "0.0.0.0" });

if (hr.dispatcher) await hr.dispatcher.start();
if (hr.retention) await hr.retention.start();

console.log("");
console.log("=== DSRA-17 localhost staging is LIVE ===");
console.log(`  api           http://127.0.0.1:${API_PORT}/health`);
console.log(`  hr-automation http://127.0.0.1:${HR_PORT}/health  (dashboard http://127.0.0.1:${HR_PORT}/)`);
console.log(`  web           http://127.0.0.1:${WEB_PORT}/health  (dashboard http://127.0.0.1:${WEB_PORT}/)`);
console.log("");

const shutdown = async () => {
  await Promise.allSettled([web.close(), hr.close(), api.close()]);
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
