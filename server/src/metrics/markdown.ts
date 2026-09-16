// The same payload the dashboard renders, as Markdown for the weekly review.
//
// Pure: a payload in, a string out, no database and no clock — so the report
// can be pinned by a test and pasted into a conversation with the assistant
// without anything else having to run.
import { RETENTION_WEEKS, type AdminMetricsResponse } from "@blw/shared";

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** One activation cell: the count and its share, or "not yet" for a window still open. */
function stage(value: number | null, signups: number): string {
  if (value === null) return "not yet";
  return `${value} (${pct(signups ? value / signups : 0)})`;
}

function table(headers: string[], rows: (string | number)[][]): string {
  const head = `| ${headers.join(" | ")} |`;
  const rule = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.join(" | ")} |`);
  return [head, rule, ...body].join("\n");
}

/** Trailing weeks read better than 26 rows of a sparkline in a terminal. */
const SERIES_TAIL = 12;

export function renderMetricsMarkdown(payload: AdminMetricsResponse): string {
  const { meta } = payload;
  const wlp = payload.weeklyLoggingParents;
  const latest = wlp.at(-1)?.parents ?? 0;
  const previous = wlp.at(-2)?.parents ?? 0;
  const out: string[] = [];

  out.push(`# Little Meals metrics — ${meta.range}`);
  out.push("");
  out.push(`As of ${meta.to} (from ${meta.from}, ${meta.weeks} weeks).`);
  out.push("");

  out.push("## Headline");
  out.push("");
  out.push(
    table(
      ["Metric", "Value"],
      [
        ["Weekly logging parents (this week)", `${latest} (${latest - previous >= 0 ? "+" : ""}${latest - previous} vs last week)`],
        ["Signups this week", payload.signupsPerWeek.at(-1)?.signups ?? 0],
        ["DAU / WAU / MAU", `${payload.activeUsers.dau} / ${payload.activeUsers.wau} / ${payload.activeUsers.mau}`],
        ["Client errors per 100 sessions", payload.clientErrors.perHundredSessions.toFixed(2)],
      ],
    ),
  );
  out.push("");

  out.push("## Weekly logging parents and signups");
  out.push("");
  const signupsByWeek = new Map(payload.signupsPerWeek.map((row) => [row.weekStart, row.signups]));
  out.push(
    table(
      ["Week", "WLP", "Signups"],
      wlp.slice(-SERIES_TAIL).map((row) => [row.weekStart, row.parents, signupsByWeek.get(row.weekStart) ?? 0]),
    ),
  );
  out.push("");

  out.push("## Activation funnel (by signup week)");
  out.push("");
  out.push(
    table(
      ["Cohort", "Signups", "Baby <=24h", "First meal <=48h", "3 logging days"],
      payload.activationFunnel
        .slice(-SERIES_TAIL)
        .map((row) => [
          row.weekStart,
          row.signups,
          // "not yet" is a window that has not closed for the whole week, not
          // a zero — the same distinction the retention table's dash carries.
          stage(row.withBaby, row.signups),
          stage(row.loggedMeal, row.signups),
          stage(row.threeLoggingDays, row.signups),
        ]),
    ),
  );
  out.push("");

  out.push("## Retention triangle");
  out.push("");
  out.push(
    table(
      ["Cohort", "Size", ...Array.from({ length: RETENTION_WEEKS }, (_, i) => `W${i + 1}`)],
      payload.retentionTriangle.map((row) => [
        row.weekStart,
        row.size,
        // "—" is an unfinished window, not a zero. The distinction is the
        // whole reason the field is nullable.
        ...row.retained.map((value) =>
          value === null ? "—" : row.size ? `${pct(value / row.size)}` : "0.0%",
        ),
      ]),
    ),
  );
  out.push("");

  out.push(`## Feature adoption (${payload.featureAdoption.windowDays}d, of ${payload.featureAdoption.denominator} logging parents)`);
  out.push("");
  out.push(
    table(
      ["Feature", "Parents", "Share"],
      payload.featureAdoption.features.map((row) => [row.feature, row.users, pct(row.share)]),
    ),
  );
  out.push("");

  out.push("## Tour");
  out.push("");
  out.push(
    table(
      ["Opened", "Completed", "Skipped", "Completion"],
      [[payload.tourOutcomes.opened, payload.tourOutcomes.completed, payload.tourOutcomes.skipped, pct(payload.tourOutcomes.completionRate)]],
    ),
  );
  out.push("");
  out.push(
    table(
      ["Slide", "Skips"],
      payload.tourOutcomes.skipsBySlide.map((row) => [row.slide, row.skips]),
    ),
  );
  out.push("");

  out.push("## Catalog filters");
  out.push("");
  out.push(`${payload.catalogFilters.events} filtered queries, ${pct(payload.catalogFilters.zeroResultRate)} with no results.`);
  out.push("");
  out.push(
    table(
      ["Filter", "Uses", "Share"],
      payload.catalogFilters.byFilter.map((row) => [row.filter, row.uses, pct(row.share)]),
    ),
  );
  out.push("");
  if (payload.catalogFilters.zeroResultCombos.length > 0) {
    out.push(
      table(
        ["Catalog", "Filters", "Search", "Empty results"],
        payload.catalogFilters.zeroResultCombos.map((row) => [
          row.catalog,
          row.filters.length > 0 ? row.filters.join(" + ") : "(none)",
          row.hasQuery ? "yes" : "no",
          row.count,
        ]),
      ),
    );
    out.push("");
  }

  const storage = payload.storageServeThrough;
  out.push("## Storage");
  out.push("");
  out.push(
    table(
      ["Added", "Finished", "Discarded", "Still active", "Serve-through"],
      [[storage.added, storage.finished, storage.discarded, storage.stillActive, pct(storage.serveThrough)]],
    ),
  );
  out.push("");

  out.push("## Learn");
  out.push("");
  out.push(
    table(
      ["Article", "Views", "Share"],
      payload.learnRanking.map((row) => [row.article, row.views, pct(row.share)]),
    ),
  );
  out.push("");

  out.push("## Symptom checks");
  out.push("");
  out.push(
    `${payload.symptomTriage.started} started, ${payload.symptomTriage.completed} completed (${pct(payload.symptomTriage.completionRate)}).`,
  );
  out.push("");
  out.push(
    table(
      ["Triage", "Checks", "Share"],
      payload.symptomTriage.byLevel.map((row) => [row.level, row.checks, pct(row.share)]),
    ),
  );
  out.push("");

  out.push("## Client errors");
  out.push("");
  out.push(
    `${payload.clientErrors.errors} errors over ${payload.clientErrors.sessions} sessions — ${payload.clientErrors.perHundredSessions.toFixed(2)} per 100.`,
  );
  out.push("");
  if (payload.clientErrors.topRoutes.length > 0) {
    out.push(
      table(
        ["Route", "Kind", "Status", "Count", "Share", "Last seen"],
        payload.clientErrors.topRoutes.map((row) => [
          row.route,
          row.kind,
          row.status,
          row.count,
          pct(row.share),
          row.lastAt,
        ]),
      ),
    );
    out.push("");
  }

  out.push("## Deploys in range");
  out.push("");
  out.push(
    payload.recentDeploys.length > 0
      ? table(
          ["SHA", "Deployed", "Note"],
          payload.recentDeploys.map((row) => [row.sha, row.deployedAt, row.note ?? ""]),
        )
      : "None.",
  );
  out.push("");

  return out.join("\n");
}
