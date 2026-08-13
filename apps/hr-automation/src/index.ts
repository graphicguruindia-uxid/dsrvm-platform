import { createReviewerApp, type ProviderKind } from "./app.js";
import { seedDemo } from "./seed.js";

const port = Number(process.env.PORT ?? 3002);
const provider = (process.env.PROVIDER ?? "demo") as ProviderKind;

const signal = new AbortController().signal;
const app = createReviewerApp({
  provider,
  databaseUrl: process.env.DATABASE_URL,
  signal,
  telemetryTtlMs: process.env.TELEMETRY_TTL_MS
    ? Number(process.env.TELEMETRY_TTL_MS)
    : undefined,
});

if (process.env.SEED_DEMO === "1") {
  const seeded = await seedDemo(app.hr);
  console.log(
    `seeded demo: role ${seeded.roleId}, ${seeded.candidateIds.length} candidates screened into the review queue`,
  );
}

await app.server.listen({ port, host: "0.0.0.0" });
if (app.dispatcher) {
  await app.dispatcher.start();
}
if (app.retention) {
  await app.retention.start();
}
console.log(`HR automation reviewer listening on http://0.0.0.0:${port}`);

const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
