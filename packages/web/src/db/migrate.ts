import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const META_TABLE = "_web_migrations";

/**
 * Runs pending SQL migrations from the `drizzle/` folder against the
 * database. Safe to call at startup: it records applied migrations in
 * `_web_migrations` so it is idempotent. Uses its own meta table (not
 * `_drizzle_migrations`) so the web and hr stores can share one database.
 */
export async function runMigrations(url: string): Promise<string[]> {
  const pool = new pg.Pool({ connectionString: url });
  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS ${META_TABLE} (
        id serial PRIMARY KEY,
        name text NOT NULL UNIQUE,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
    );
    const applied = new Set(
      (
        await pool.query<{ name: string }>(
          `SELECT name FROM ${META_TABLE} ORDER BY id`,
        )
      ).rows.map((r) => r.name),
    );

    const dir = resolveDrizzleDir(import.meta.url);
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const ran: string[] = [];
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(dir, file), "utf8");
      await pool.query(sql);
      await pool.query(`INSERT INTO ${META_TABLE} (name) VALUES ($1)`, [file]);
      ran.push(file);
    }
    return ran;
  } finally {
    await pool.end();
  }
}

function resolveDrizzleDir(url: string): string {
  const candidates = [
    fileURLToPath(new URL("../drizzle", url)),
    fileURLToPath(new URL("../../drizzle", url)),
    path.join(process.cwd(), "drizzle"),
    path.join(process.cwd(), "packages", "web", "drizzle"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.readdirSync(c).some((f) => f.endsWith(".sql"))) {
      return c;
    }
  }
  throw new Error(
    `Could not find drizzle migrations dir. Tried: ${candidates.join(", ")}`,
  );
}
