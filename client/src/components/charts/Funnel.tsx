import { ChartFrame, ChartLegend, type ChartTable } from "./ChartFrame.js";
import {
  barPath,
  clamp,
  CHART_RAMP_STEPS,
  fitLabel,
  formatCount,
  formatPercent,
  funnelSteps,
  groupLayout,
  rampFill,
  valueToLength,
} from "./helpers.js";

/**
 * An activation funnel for several signup cohorts at once: one row per
 * stage, one bar per cohort inside it.
 *
 * Two decisions worth stating. Bars are measured against **their own
 * cohort's** first stage, not against the biggest cohort — the question is
 * "what share of this week's signups got this far", and scaling every cohort
 * to a shared denominator would make a small good week look like a failure.
 * And cohorts are colored by an ORDINAL ramp (oldest lightest, newest
 * darkest) rather than four categorical hues: recency is ordered, so the
 * order belongs in the color, and four separate hues would have to clear a
 * CVD gate that lightness steps clear by construction. The legend carries
 * the week labels, so the ramp never has to be decoded by eye.
 */

const VIEW_W = 320;
const STAGE_ROW = 54;
const GROUP_Y = 16;
const GROUP_H = 30;

export interface FunnelCohort {
  label: string;
  /** One value per stage; `values[0]` is that cohort's denominator. */
  values: number[];
}

interface FunnelProps {
  stages: string[];
  /** Oldest cohort first — the newest is the one that gets the direct label. */
  cohorts: FunnelCohort[];
  title: string;
  summary: string;
}

/** Newest cohort always lands on the ramp's darkest step; older ones step back. */
export function cohortRampStep(index: number, count: number): number {
  return clamp(CHART_RAMP_STEPS.length - (count - 1 - index), 2, CHART_RAMP_STEPS.length);
}

export function Funnel({ stages, cohorts, title, summary }: FunnelProps) {
  const group = groupLayout(cohorts.length, GROUP_H);
  const height = Math.max(STAGE_ROW, stages.length * STAGE_ROW - (STAGE_ROW - GROUP_Y - GROUP_H));
  const newest = cohorts.length - 1;
  const perCohort = cohorts.map((cohort) =>
    funnelSteps(stages.map((label, index) => ({ label, value: cohort.values[index] ?? 0 }))),
  );

  const table: ChartTable = {
    columns: ["Cohort", ...stages],
    rows: cohorts.map((cohort, index) => ({
      header: cohort.label,
      cells: (perCohort[index] ?? []).map((step) => `${formatCount(step.value)} (${formatPercent(step.ofFirst)})`),
    })),
  };

  return (
    <ChartFrame
      title={title}
      summary={summary}
      viewBox={`0 0 ${VIEW_W} ${height}`}
      table={table}
      legend={
        <ChartLegend
          items={cohorts.map((cohort, index) => ({
            swatch: rampFill(cohortRampStep(index, cohorts.length)),
            label: cohort.label,
          }))}
        />
      }
    >
      {stages.map((stage, stageIndex) => {
        const y = stageIndex * STAGE_ROW;
        const newestStep = perCohort[newest]?.[stageIndex];
        const newestLabel = newestStep
          ? `${formatCount(newestStep.value)} · ${formatPercent(newestStep.ofFirst)}`
          : "";
        return (
          <g key={stage}>
            <text x={0} y={y + 9} fontSize={10} fill="var(--color-text)">
              {fitLabel(stage, newestLabel, VIEW_W)}
            </text>
            {newestStep ? (
              <text
                x={VIEW_W}
                y={y + 9}
                textAnchor="end"
                fontSize={10}
                fill="var(--color-text-muted)"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {newestLabel}
              </text>
            ) : null}
            {cohorts.map((cohort, cohortIndex) => {
              const value = cohort.values[stageIndex] ?? 0;
              const length = valueToLength(value, cohort.values[0] ?? 0, VIEW_W);
              const barY = y + GROUP_Y + (group.offsets[cohortIndex] ?? 0);
              return (
                <g key={`${stage}-${cohort.label}`}>
                  <title>{`${cohort.label} — ${stage}: ${formatCount(value)}`}</title>
                  <path
                    d={barPath(0, barY, length, group.thickness, 3, "right")}
                    fill={rampFill(cohortRampStep(cohortIndex, cohorts.length))}
                  />
                </g>
              );
            })}
          </g>
        );
      })}
    </ChartFrame>
  );
}
