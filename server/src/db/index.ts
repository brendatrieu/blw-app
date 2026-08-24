import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { Pool } from "pg";
import * as schema from "./schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type Database =
  | ReturnType<typeof drizzleNodePg<typeof schema>>
  | ReturnType<typeof drizzlePglite<typeof schema>>;

/**
 * Dual-driver Drizzle factory.
 * - DATABASE_URL set -> drizzle-orm/node-postgres against real Postgres (production).
 * - otherwise -> drizzle-orm/pglite, persisted on disk under server/.data/pglite
 *   (local dev + tests, no Docker required).
 */
export function createDb(databaseUrl: string | undefined) {
  if (databaseUrl) {
    const pool = new Pool({ connectionString: databaseUrl });
    return drizzleNodePg(pool, { schema });
  }

  const dataDir = path.resolve(__dirname, "../../.data/pglite");
  // PGlite's nodefs backend does a plain (non-recursive) mkdir, which fails
  // on a fresh checkout where server/.data doesn't exist yet.
  mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  return drizzlePglite(client, { schema });
}
