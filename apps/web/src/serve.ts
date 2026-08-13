import { createWebReferenceApp } from "./app.js";
import { seedReference } from "./seed.js";

const port = Number(process.env.PORT ?? 3003);
const app = createWebReferenceApp({
  databaseUrl: process.env.DATABASE_URL,
  billingWebhookSecret: process.env.BILLING_WEBHOOK_SECRET,
});

if (process.env.SEED_DEMO === "1") {
  const seeded = await seedReference(app.service);
  console.log(
    `seeded web reference: ${seeded.tenantIds.length} tenants (acme.dsrvm.app, beta.dsrvm.app)`,
  );
}

await app.server.listen({ port, host: "0.0.0.0" });
console.log(`Web reference listening on http://0.0.0.0:${port}`);

const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
