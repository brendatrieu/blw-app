import { useState, type ReactNode } from "react";
import {
  METRICS_RANGES,
  RETENTION_WEEKS,
  triageLevelSchema,
  type AdminMetricsResponse,
  type MetricsRange,
  type TriageLevel,
} from "@blw/shared";
import { useAdminMetrics, useIsAdmin } from "../features/admin/hooks.js";
import { AccessPanel } from "../features/admin/AccessPanel.js";
import { FeedbackInbox } from "../features/admin/FeedbackInbox.js";
import { Bars } from "../components/charts/Bars.js";
import { ChartEmpty } from "../components/charts/ChartFrame.js";
import { Donut } from "../components/charts/Donut.js";
import { Funnel } from "../components/charts/Funnel.js";
import { HeatTable } from "../components/charts/HeatTable.js";
import { Line, Sparkline, type LineMarker } from "../components/charts/Line.js";
import {
  deltaOf,
  formatCount,
  formatPercent,
  formatRate,
  formatTimestamp,
  humanizeKey,
  weekFraction,
  weekLabel,
  type Delta,
} from "../components/charts/helpers.js";
import { BackButton } from "../components/ui/BackButton.js";
import { Button } from "../components/ui/Button.js";
import { Card } from "../components/ui/Card.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { SegmentedControl, type SegmentedControlOption } from "../components/ui/SegmentedControl.js";
import { Skeleton } from "../components/ui/Skeleton.js";
import { NotFoundPage } from "./NotFoundPage.js";

/**
 * The owner's dashboard: everything phase 1a started collecting, read back
 * as aggregates.
 *
 * **Why a non-admin gets `NotFoundPage` and not a "you don't have access"
 * screen.** The API behind this page answers the app's ordinary 404 to
 * everyone else — identical body, identical headers — precisely so the admin
 * surface cannot be discovered by probing. A client that rendered "access
 * denied" here would undo that in one sentence: it would confirm the route
 * exists and that somebody has access to it. So this renders the *same
 * component* `/nope` renders, with nothing added, and waits for the answer
 * before rendering anything at all rather than flashing one page then the
 * other.
 *
 * **Nothing between the Inbox and the Access panel identifies a parent.**
 * Not by construction of the queries — by construction of the *types*:
 * `AdminMetricsResponse` has nowhere to put an id, an email or a name. There
 * are exactly two exceptions and both are deliberate: the Access panel at
 * the bottom, which lists admins to admins, and the Inbox at the top (item
 * 361), which shows one parent's own words and the address to answer them
 * at — because that is what an inbox is for, and a suggestion box you cannot
 * reply from is not one.
 */

const TRIAGE_LABELS: Record<TriageLevel, string> = {
  monitor_at_home: "Watch at home",
  contact_doctor_24h: "Call the doctor",
  urgent_care: "Seen today",
  emergency: "Emergency",
};

const ACTIVATION_STAGES = ["Signed up", "Added a baby", "First meal", "3 logging days"] as const;

/** How many signup cohorts the funnel shows — the plan's "last 4 cohorts". */
const FUNNEL_COHORTS = 4;

/** Rows in the retention triangle; older cohorts are in the data, not on screen. */
const RETENTION_ROWS = 8;

/**
 * Every panel's heading, in render order. Exported because the page's test
 * walks this list: a panel that quietly stops rendering is exactly the kind
 * of regression a dashboard hides well.
 */
export const METRICS_PANEL_TITLES = [
  // First on the page and first in this list: a message from a parent is the
  // only thing here that is waiting on a person, and a dashboard that buried
  // it under twelve charts would be a dashboard nobody read it from.
  "Inbox",
  "Weekly logging parents",
  "Signups",
  "Activation",
  "Retention",
  "Feature adoption",
  "Tour",
  "Catalog filters",
  "Storage serve-through",
  "Learn articles",
  "Symptom checks",
  "Errors",
  "Access",
] as const;

/** The KPI row, in render order. */
export const METRICS_TILE_LABELS = [
  "Logging parents",
  "Signups",
  "Weekly active",
  "Monthly active",
  "Errors per 100 sessions",
] as const;

const RANGE_OPTIONS: Array<SegmentedControlOption<MetricsRange>> = METRICS_RANGES.map((range) => ({
  value: range,
  label: `${range.replace("w", "")} weeks`,
  icon: null,
}));

export function AdminMetricsPage() {
  const { isAdmin, isResolved } = useIsAdmin();

  // Deliberately blank, not a spinner and not the not-found page: either one
  // would be a visible difference between "this route exists but you can't
  // see it" and "this route does not exist".
  if (!isResolved) return null;
  if (!isAdmin) return <NotFoundPage />;

  return <MetricsDashboard />;
}

/** Exported for render tests — the page's gate is only two branches. */
export function MetricsDashboard() {
  const [range, setRange] = useState<MetricsRange>("12w");
  const metrics = useAdminMetrics(range);
  const data = metrics.data;

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader
        title="Metrics"
        emoji="📈"
        leading={<BackButton fallback="/more" />}
        description="Aggregates only — no names, no notes, nobody's baby."
      />

      {/* Above the range picker, not just above the tiles: the inbox has its
          own queries and its own tabs, so it renders while the metrics are
          still loading (or have failed) — and a range control sitting above
          it would look like it governed which messages were shown. */}
      <Card as="section">
        <FeedbackInbox />
      </Card>

      <SegmentedControl options={RANGE_OPTIONS} value={range} onChange={setRange} aria-label="Range" />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--color-text-muted)]">
          {data ? `As of ${formatTimestamp(data.meta.to)}` : "Loading…"}
        </p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={metrics.isFetching}
          onClick={() => {
            void metrics.refetch();
          }}
        >
          {metrics.isFetching ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {metrics.isLoading ? <DashboardSkeleton /> : null}

      {metrics.isError ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          Couldn't load metrics.
        </p>
      ) : null}

      {data ? <Panels data={data} /> : null}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading">
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton key={index} className="h-40 w-full" />
      ))}
    </div>
  );
}

/** Drops the in-progress week (the series' last bucket) when there is anything before it. */
export function completedWeeks(values: number[]): number[] {
  return values.length > 1 ? values.slice(0, -1) : values;
}

function Panels({ data }: { data: AdminMetricsResponse }) {
  const wlp = data.weeklyLoggingParents;
  const weekStarts = wlp.map((week) => week.weekStart);
  const wlpValues = wlp.map((week) => week.parents);
  const signups = data.signupsPerWeek;
  const signupValues = signups.map((week) => week.signups);
  // The last bucket is the week in progress: a delta against it would read
  // "down" every Monday morning by construction, so the tiles compare the
  // last two COMPLETED weeks and show the running week as "so far".
  const wlpCompleted = completedWeeks(wlpValues);
  const signupsCompleted = completedWeeks(signupValues);

  const markers: LineMarker[] = data.recentDeploys
    .map((deploy) => {
      const at = weekFraction(deploy.deployedAt, weekStarts);
      return at === null ? null : { at, label: deploy.note ?? deploy.sha.slice(0, 7) };
    })
    .filter((marker): marker is LineMarker => marker !== null);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        <StatTile
          label="Logging parents"
          caption={`3+ meals, last full week · so far this week ${formatCount(last(wlpValues))}`}
          value={formatCount(last(wlpCompleted))}
          delta={deltaOf(last(wlpCompleted), previous(wlpCompleted))}
          trend={wlpValues.length > 1 ? <Sparkline values={wlpValues} label="Weekly logging parents trend" /> : null}
        />
        <StatTile
          label="Signups"
          caption={`last full week · so far this week ${formatCount(last(signupValues))}`}
          value={formatCount(last(signupsCompleted))}
          delta={deltaOf(last(signupsCompleted), previous(signupsCompleted))}
          trend={signupValues.length > 1 ? <Sparkline values={signupValues} label="Signups per week trend" /> : null}
        />
        <StatTile label="Weekly active" caption="last 7 days" value={formatCount(data.activeUsers.wau)} />
        <StatTile label="Monthly active" caption="last 30 days" value={formatCount(data.activeUsers.mau)} />
        <StatTile
          label="Errors per 100 sessions"
          caption={`${formatCount(data.clientErrors.errors)} in range`}
          value={formatRate(data.clientErrors.perHundredSessions)}
          className="col-span-2"
        />
      </div>

      <Panel
        title="Weekly logging parents"
        description="The north star: accounts that created three or more meals inside a week. Dashes mark deploys."
      >
        {wlp.length === 0 ? (
          <ChartEmpty>No weeks in this range yet.</ChartEmpty>
        ) : (
          <Line
            points={wlp.map((week) => ({ label: weekLabel(week.weekStart), value: week.parents }))}
            markers={markers}
            title="Weekly logging parents"
            summary={`${formatCount(last(wlpValues))} parents logged three or more meals in the week of ${weekLabel(
              weekStarts[weekStarts.length - 1] ?? "",
            )}, across ${wlp.length} weeks.`}
            valueHeader="Parents"
          />
        )}
      </Panel>

      <Panel title="Signups" description="New accounts per week.">
        {signups.length === 0 ? (
          <ChartEmpty>No weeks in this range yet.</ChartEmpty>
        ) : (
          <Bars
            bars={signups.map((week) => ({ label: weekLabel(week.weekStart), value: week.signups }))}
            title="Signups per week"
            summary={`${formatCount(
              signups.reduce((sum, week) => sum + week.signups, 0),
            )} new accounts across ${signups.length} weeks.`}
            valueHeader="Signups"
          />
        )}
      </Panel>

      <ActivationPanel data={data} />
      <RetentionPanel data={data} />
      <AdoptionPanel data={data} />
      <TourPanel data={data} />
      <FiltersPanel data={data} />
      <StoragePanel data={data} />
      <LearnPanel data={data} />
      <SymptomPanel data={data} />
      <ErrorsPanel data={data} />

      <Card as="section">
        <AccessPanel />
      </Card>
    </div>
  );
}

function ActivationPanel({ data }: { data: AdminMetricsResponse }) {
  const cohorts = data.activationFunnel.slice(-FUNNEL_COHORTS);

  return (
    <Panel
      title="Activation"
      description="Measured from each account's own signup: a baby within 24 hours, a first meal within 48, meals on three separate days within 28."
    >
      {cohorts.length === 0 ? (
        <ChartEmpty>No signup cohorts in this range yet.</ChartEmpty>
      ) : (
        <Funnel
          stages={[...ACTIVATION_STAGES]}
          cohorts={cohorts.map((cohort) => ({
            label: weekLabel(cohort.weekStart),
            values: [cohort.signups, cohort.withBaby, cohort.loggedMeal, cohort.threeLoggingDays],
          }))}
          title="Activation funnel by signup week"
          summary={`The last ${cohorts.length} signup cohorts, each read against its own signups.`}
        />
      )}
    </Panel>
  );
}

function RetentionPanel({ data }: { data: AdminMetricsResponse }) {
  const rows = data.retentionTriangle.slice(-RETENTION_ROWS);

  return (
    <Panel
      title="Retention"
      description="Share of each signup week that logged a meal in week 1 through 8 after signing up. An empty cell is a week that has not finished yet — never a zero."
    >
      {rows.length === 0 ? (
        <ChartEmpty>No signup cohorts in this range yet.</ChartEmpty>
      ) : (
        <HeatTable
          columns={Array.from({ length: RETENTION_WEEKS }, (_, index) => `W${index + 1}`)}
          rows={rows.map((cohort) => ({
            label: weekLabel(cohort.weekStart),
            size: cohort.size,
            cells: cohort.retained,
          }))}
          title="Retention by signup week"
          summary={`${rows.length} signup cohorts, followed for up to ${RETENTION_WEEKS} weeks each.`}
        />
      )}
    </Panel>
  );
}

function AdoptionPanel({ data }: { data: AdminMetricsResponse }) {
  const { denominator, windowDays, features } = data.featureAdoption;

  return (
    <Panel
      title="Feature adoption"
      description={`Share of the ${formatCount(denominator)} parents who hit three meals in a week during the last ${windowDays} days.`}
    >
      {denominator === 0 ? (
        <ChartEmpty>Nobody has logged three meals in a week yet.</ChartEmpty>
      ) : (
        <Bars
          orientation="row"
          max={1}
          showTrack
          bars={features.map((feature) => ({
            label: humanizeKey(feature.feature),
            value: feature.share,
            valueLabel: `${formatPercent(feature.share)} · ${formatCount(feature.users)}`,
          }))}
          title="Feature adoption"
          summary={`Out of ${formatCount(denominator)} weekly logging parents in the last ${windowDays} days.`}
          valueHeader="Share of logging parents"
        />
      )}
    </Panel>
  );
}

function TourPanel({ data }: { data: AdminMetricsResponse }) {
  const tour = data.tourOutcomes;

  return (
    <Panel title="Tour" description="Where the first-run tour is finished, and where it is abandoned.">
      <InlineStats
        stats={[
          { label: "Opened", value: formatCount(tour.opened) },
          { label: "Completed", value: formatCount(tour.completed) },
          { label: "Skipped", value: formatCount(tour.skipped) },
          { label: "Completion", value: formatPercent(tour.completionRate) },
        ]}
      />
      {tour.skipped === 0 ? (
        <ChartEmpty>Nobody skipped the tour in this range.</ChartEmpty>
      ) : (
        <Bars
          orientation="row"
          bars={tour.skipsBySlide.map((slide) => ({
            label: `Slide ${slide.slide + 1}`,
            value: slide.skips,
          }))}
          title="Tour skips by slide"
          summary={`${formatCount(tour.skipped)} skips, by the slide they left on.`}
          valueHeader="Skips"
        />
      )}
    </Panel>
  );
}

function FiltersPanel({ data }: { data: AdminMetricsResponse }) {
  const filters = data.catalogFilters;

  return (
    <Panel
      title="Catalog filters"
      description={`${formatCount(filters.events)} filter changes in range, ${formatPercent(
        filters.zeroResultRate,
      )} of which came back empty.`}
    >
      {filters.events === 0 ? (
        <ChartEmpty>No filtering in this range yet.</ChartEmpty>
      ) : (
        <>
          <Bars
            orientation="row"
            max={1}
            showTrack
            bars={filters.byFilter.map((filter) => ({
              label: humanizeKey(filter.filter),
              value: filter.share,
              valueLabel: `${formatPercent(filter.share)} · ${formatCount(filter.uses)}`,
            }))}
            title="Filter usage"
            summary={`Share of the ${formatCount(filters.events)} filter changes that used each key.`}
            valueHeader="Share of filter changes"
          />
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Combinations with no results</h3>
          {filters.zeroResultCombos.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">Every combination found something.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[var(--color-text-muted)]">
                  <tr>
                    <th scope="col" className="py-1 pr-2 font-medium">
                      Catalog
                    </th>
                    <th scope="col" className="py-1 pr-2 font-medium">
                      Filters
                    </th>
                    <th scope="col" className="py-1 pr-2 font-medium">
                      Search
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">
                      Times
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filters.zeroResultCombos.map((combo, index) => (
                    <tr key={index} className="border-t border-[var(--color-border)]">
                      <td className="py-1 pr-2">{humanizeKey(combo.catalog)}</td>
                      <td className="py-1 pr-2">
                        {combo.filters.length === 0 ? "None" : combo.filters.map(humanizeKey).join(", ")}
                      </td>
                      <td className="py-1 pr-2">{combo.hasQuery ? "Yes" : "No"}</td>
                      <td className="py-1 text-right tabular-nums">{formatCount(combo.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

function StoragePanel({ data }: { data: AdminMetricsResponse }) {
  const storage = data.storageServeThrough;
  const touched = storage.added + storage.finished + storage.discarded + storage.stillActive;

  return (
    <Panel
      title="Storage serve-through"
      description="Read from the storage table itself, so it covers parents who turned sharing off. Serve-through is finished ÷ (finished + discarded)."
    >
      {touched === 0 ? (
        <ChartEmpty>Nothing has been put in storage in this range.</ChartEmpty>
      ) : (
        <>
          <InlineStats
            stats={[
              { label: "Serve-through", value: formatPercent(storage.serveThrough) },
              { label: "Added", value: formatCount(storage.added) },
            ]}
          />
          <Bars
            orientation="row"
            bars={[
              { label: "Finished", value: storage.finished },
              { label: "Discarded", value: storage.discarded },
              { label: "Still active", value: storage.stillActive },
            ]}
            title="Storage outcomes"
            summary={`${formatCount(storage.finished)} finished, ${formatCount(
              storage.discarded,
            )} discarded, ${formatCount(storage.stillActive)} still open.`}
            valueHeader="Items"
          />
        </>
      )}
    </Panel>
  );
}

function LearnPanel({ data }: { data: AdminMetricsResponse }) {
  const total = data.learnRanking.reduce((sum, article) => sum + article.views, 0);

  return (
    <Panel title="Learn articles" description="Which safety articles actually get read.">
      {total === 0 ? (
        <ChartEmpty>No articles opened in this range.</ChartEmpty>
      ) : (
        <Bars
          orientation="row"
          max={1}
          showTrack
          bars={data.learnRanking.map((article) => ({
            label: humanizeKey(article.article),
            value: article.share,
            valueLabel: `${formatPercent(article.share)} · ${formatCount(article.views)}`,
          }))}
          title="Learn article ranking"
          summary={`${formatCount(total)} article views in range.`}
          valueHeader="Share of views"
        />
      )}
    </Panel>
  );
}

function SymptomPanel({ data }: { data: AdminMetricsResponse }) {
  const triage = data.symptomTriage;
  const byLevel = new Map(triage.byLevel.map((entry) => [entry.level, entry]));
  const ordered = triageLevelSchema.options.map((level) => ({
    label: TRIAGE_LABELS[level],
    value: byLevel.get(level)?.checks ?? 0,
  }));

  return (
    <Panel
      title="Symptom checks"
      description="Completed checks by how urgently the result said to involve a clinician, alongside how many surveys were started."
    >
      <InlineStats
        stats={[
          { label: "Started", value: formatCount(triage.started) },
          { label: "Completed", value: formatCount(triage.completed) },
          { label: "Completion", value: formatPercent(triage.completionRate) },
        ]}
      />
      {triage.completed === 0 ? (
        <ChartEmpty>No completed checks in this range.</ChartEmpty>
      ) : (
        <Donut
          slices={ordered}
          centreValue={formatCount(triage.completed)}
          centreLabel="checks"
          title="Symptom checks by triage level"
          summary={`${formatCount(triage.completed)} completed checks, least urgent first.`}
          valueHeader="Checks"
        />
      )}
    </Panel>
  );
}

function ErrorsPanel({ data }: { data: AdminMetricsResponse }) {
  const errors = data.clientErrors;

  return (
    <Panel
      title="Errors"
      description={`${formatCount(errors.errors)} client errors across ${formatCount(
        errors.sessions,
      )} sessions. Above two per hundred, feature work stops.`}
    >
      {errors.errors === 0 ? (
        <ChartEmpty>No client errors in this range.</ChartEmpty>
      ) : (
        <Bars
          orientation="row"
          tone="critical"
          bars={errors.topRoutes.map((route) => ({
            label: `${route.route} · ${humanizeKey(route.kind)}`,
            value: route.count,
            valueLabel: `${formatCount(route.count)} · ${formatPercent(route.share)}`,
          }))}
          title="Top error routes"
          summary={`Where the ${formatCount(errors.errors)} errors in range landed.`}
          valueHeader="Errors"
        />
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card as="section" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="font-h2 text-[var(--color-text)]">{title}</h2>
        {description ? <p className="text-xs text-[var(--color-text-muted)]">{description}</p> : null}
      </div>
      {children}
    </Card>
  );
}

function StatTile({
  label,
  value,
  caption,
  delta,
  trend,
  className = "",
}: {
  label: string;
  value: string;
  caption: string;
  delta?: Delta;
  trend?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 ${className}`}
    >
      <span className="text-xs font-medium text-[var(--color-text-muted)]">{label}</span>
      <span className="flex flex-wrap items-baseline gap-1.5">
        <span className="font-display text-[var(--color-text)]">{value}</span>
        {delta ? <DeltaChip delta={delta} /> : null}
      </span>
      <span className="text-[11px] text-[var(--color-text-muted)]">{caption}</span>
      {trend}
    </div>
  );
}

const DELTA_TONE_CLASSES: Record<Delta["tone"], string> = {
  good: "bg-[var(--color-success-soft)] text-[var(--color-success-soft-text)]",
  bad: "bg-[var(--color-danger-soft)] text-[var(--color-danger-soft-text)]",
  neutral: "bg-[var(--color-neutral-soft)] text-[var(--color-neutral-soft-text)]",
};

const DELTA_GLYPHS: Record<Delta["direction"], string> = { up: "▲", down: "▼", flat: "–" };

/**
 * Direction as a glyph AND a word, never as color alone: the same arrow is
 * good news for signups and bad news for errors, and a reader who cannot
 * separate the mint chip from the salmon one still gets both from the text.
 */
function DeltaChip({ delta }: { delta: Delta }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
        DELTA_TONE_CLASSES[delta.tone]
      }`}
    >
      <span aria-hidden="true">{DELTA_GLYPHS[delta.direction]}</span>
      <span aria-hidden="true">{delta.label}</span>
      <span className="sr-only">{delta.description}</span>
    </span>
  );
}

function InlineStats({ stats }: { stats: Array<{ label: string; value: string }> }) {
  return (
    <dl className="flex flex-wrap gap-x-5 gap-y-2">
      {stats.map((stat) => (
        <div key={stat.label} className="flex flex-col">
          <dt className="text-xs text-[var(--color-text-muted)]">{stat.label}</dt>
          <dd className="font-h2 text-[var(--color-text)]">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function last(values: number[]): number {
  return values[values.length - 1] ?? 0;
}

function previous(values: number[]): number {
  return values[values.length - 2] ?? 0;
}
