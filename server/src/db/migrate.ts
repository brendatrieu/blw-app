import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { migrate as migrateNodePg } from "drizzle-orm/node-postgres/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, "../../drizzle");

/**
 * Applies generated SQL migrations for whichever driver is active, mirroring
 * the dual-driver split in createDb(): DATABASE_URL set -> node-postgres
 * against real Postgres, otherwise -> PGlite persisted at server/.data/pglite.
 */
export async function migrateDatabase(databaseUrl: string | undefined): Promise<void> {
  if (databaseUrl) {
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const db = drizzleNodePg(pool);
      await migrateNodePg(db, { migrationsFolder });
    } finally {
      await pool.end();
    }
    return;
  }

  const dataDir = path.resolve(__dirname, "../../.data/pglite");
  // PGlite's nodefs backend does a plain (non-recursive) mkdir, which fails
  // on a fresh checkout where server/.data doesn't exist yet.
  mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  try {
    const db = drizzlePglite(client);
    await migratePglite(db, { migrationsFolder });
  } finally {
    await client.close();
  }
}

const isMainModule =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  migrateDatabase(process.env.DATABASE_URL)
    .then(() => {
      console.log("Migrations applied.");
    })
    .catch((err: unknown) => {
      console.error("Migration failed:", err);
      process.exitCode = 1;
    });
}
