// Ledger 901 (plan SPEC §8.1, docs/deploy-oracle.md "Plate migration dry
// run"): the Phase 1 dry run, on a RESTORED COPY of a production backup,
// never on production. From server/, with DATABASE_URL set to that copy:
//
//   pnpm exec tsx scripts/plate-dry-run.ts record before.json
//   pnpm exec tsx scripts/plate-dry-run.ts migrate        (twice: two boots, timed)
//   pnpm exec tsx scripts/plate-dry-run.ts record after.json
//   pnpm exec tsx scripts/plate-dry-run.ts compare before.json after.json
//
// Without DATABASE_URL it uses the local PGlite database (server/.data/pglite).
// It prints only counts and pass/fail. before.json and after.json hold names
// and ids: they stay on this machine and are deleted afterwards.
import { readFile, writeFile } from "node:fs/promises";
import { createDb } from "../src/db/index.js";
import { migrateDatabase } from "../src/db/migrate.js";
import { compareDryRun, describeRecord, recordDryRun, type DryRunRecord } from "../src/db/plateDryRun.js";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const USAGE = "usage: plate-dry-run.ts record <file> | migrate | compare <before.json> <after.json>";

async function main([command, ...files]: string[]): Promise<number> {
  const url = process.env.DATABASE_URL;
  if (url && !LOCAL_HOSTS.has(new URL(url).hostname)) {
    console.error("refused: DATABASE_URL must point at a restored copy on this machine (localhost)");
    return 2;
  }
  if (command === "migrate" && files.length === 0) {
    const start = performance.now();
    await migrateDatabase(url);
    console.log(`migrate + boot heals: ${Math.round(performance.now() - start)} ms`);
    return 0;
  }
  if (!((command === "record" && files.length === 1) || (command === "compare" && files.length === 2))) {
    console.error(USAGE);
    return 2;
  }

  const db = createDb(url);
  try {
    if (command === "record") {
      const record = await recordDryRun(db);
      await writeFile(files[0]!, JSON.stringify(record));
      console.log(describeRecord(record));
      return 0;
    }
    const [before, after] = await Promise.all(
      files.map(async (file) => JSON.parse(await readFile(file, "utf8")) as DryRunRecord),
    );
    const { pass, lines } = await compareDryRun(db, before!, after!);
    for (const line of lines) console.log(line);
    return pass ? 0 : 1;
  } finally {
    const client = db.$client as { end?: () => Promise<void>; close?: () => Promise<void> };
    await (client.end ?? client.close)?.call(client);
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    // A message or detail can quote row values, so only the kind of failure
    // is printed: the error's class, SQLSTATE, table and constraint.
    const parts = (e: unknown): string[] => {
      const x = (e ?? {}) as { name?: unknown; code?: unknown; table?: unknown; constraint?: unknown; cause?: unknown };
      return [
        ...(typeof x.name === "string" ? [x.name] : []),
        ...(typeof x.code === "string" ? [`code ${x.code}`] : []),
        ...(typeof x.table === "string" ? [`table ${x.table}`] : []),
        ...(typeof x.constraint === "string" ? [`constraint ${x.constraint}`] : []),
        ...(x.cause ? parts(x.cause) : []),
      ];
    };
    console.error(`failed: ${parts(err).join(", ") || "unknown error"}`);
    process.exitCode = 1;
  },
);
