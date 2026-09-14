// The weekly review, from a terminal.
//
//   docker compose exec app node dist/metrics/cli.js --range 12w
//
// Same numbers as the dashboard, same code path (`collectMetrics`), rendered
// as Markdown so the output can be pasted straight into a review. `--json`
// prints the raw payload instead, for a diff or an archive.
//
// It reads the database directly rather than calling `/api/admin/metrics`:
// on the box there is no session to authenticate with, and a report that
// needed a cookie would be a report nobody runs.
import { pathToFileURL } from "node:url";
import { metricsRangeSchema, type MetricsRange } from "@blw/shared";
import { loadConfig } from "../config.js";
import { createDb } from "../db/index.js";
import { collectMetrics } from "./collect.js";
import { renderMetricsMarkdown } from "./markdown.js";

export interface CliOptions {
  range: MetricsRange;
  json: boolean;
}

/** Exported so the argument handling is pinned by a test rather than by use. */
export function parseCliArgs(argv: string[]): CliOptions {
  let range: MetricsRange = "12w";
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--range" || arg === "-r") {
      const value = argv[index + 1];
      const parsed = metricsRangeSchema.safeParse(value);
      if (!parsed.success) {
        throw new Error(`--range must be one of 4w, 12w, 26w (got ${value ?? "nothing"})`);
      }
      range = parsed.data;
      index += 1;
      continue;
    }
    if (arg?.startsWith("--range=")) {
      const parsed = metricsRangeSchema.safeParse(arg.slice("--range=".length));
      if (!parsed.success) {
        throw new Error(`--range must be one of 4w, 12w, 26w (got ${arg})`);
      }
      range = parsed.data;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { range, json };
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  const env = loadConfig();
  const db = createDb(env.DATABASE_URL);
  const payload = await collectMetrics(db, options.range, new Date());

  process.stdout.write(
    options.json ? `${JSON.stringify(payload, null, 2)}\n` : `${renderMetricsMarkdown(payload)}\n`,
  );
}

// Only when this file IS the command — importing it (a test of the argument
// parser, say) must not open a database connection or print a report.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().then(
    () => {
      // A pg Pool keeps the event loop alive; the report is done, so leave.
      process.exit(0);
    },
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    },
  );
}
