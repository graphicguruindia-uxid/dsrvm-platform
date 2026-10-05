import { runMigrations } from "../dist/db/migrate.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

try {
  const ran = await runMigrations(url);
  console.log(
    ran.length ? `Applied: ${ran.join(", ")}` : "No pending migrations",
  );
} catch (e) {
  console.error("Migration failed:", e);
  process.exit(1);
}
