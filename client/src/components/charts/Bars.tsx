import { ChartFrame, type ChartTable } from "./ChartFrame.js";
import {
  axisLabelIndexes,
  axisMax,
  bandLayout,
  bandStart,
  barPath,
  fitLabel,
  formatCount,
  niceTicks,
  round,
  valueToLength,
  valueToY,
} from "./helpers.js";

/**
 * Bars, in the two orientations this dashboard needs: **columns** over a time
 * axis (signups per week, tour skips per slide) and **rows** for a ranked
 * list (feature adoption, Learn articles, filter usage, storage outcomes).
 *
 * Every bar in a chart wears the SAME hue. Length already encodes the value,
 * so coloring each bar differently would spend the identity channel
 * re-encoding what the reader can already see — and would imply the
 * categories are series when they are one measure sliced. The only variation
 * is `tone: "critical"`, for the one series that MEANS bad (client errors),
 * which wears the app's danger token rather than a chart hue.
 *
 * Row labels sit ABOVE their bar rather than beside it. A left label column
 * either truncates "Iron and nutrition basics" or starves the track; putting
 * the label and its value on their own line gives both the full width and
 * makes collisions impossible at any viewport.
 */

const VIEW_W = 320;
const COLUMN_VIEW_H = 150;
const GUTTER_L = 26;
const PAD_T = 10;
const PAD_B = 18;
const PAD_R = 6;
const COLUMN_PLOT_W = VIEW_W - GUTTER_L - PAD_R;
const COLUMN_PLOT_H = COLUMN_VIEW_H - PAD_T - PAD_B;

/** One ranked row: a label line and the track under it. */
const ROW_H = 30;
const ROW_BAR_H = 8;
const ROW_BAR_Y = 14;

export type BarTone = "series" | "critical";

export interface BarDatum {
  label: string;
  value: number;
  /** What the row prints instead of the raw count, e.g. "62% · 8 parents". */
  valueLabel?: string;
}

interface BarsProps {
  bars: BarDatum[];
  title: string;
  summary: string;
  /** Names the measure in the table's value column. */
  valueHeader: string;
  orientation?: "column" | "row";
  tone?: BarTone;
  /**
   * Domain top for row bars. Pass 1 for shares so every row is read against
   * the same 100%, rather than against whichever row happens to be biggest.
   */
  max?: number;
  /** Draw the full extent behind each row bar — right for shares, noise for counts. */
  showTrack?: boolean;
  /**
   * Replaces the default two-column table (label, value) behind the drawing.
   * For a chart whose rows carry more than the bar can show — the errors
   * panel's status and last-seen — where the sighted reader gets the extra
   * columns from the panel's own key and the screen reader would otherwise
   * get less, not more.
   */
  table?: ChartTable;
}

function toneFill(tone: BarTone): string {
  return tone === "critical" ? "var(--color-danger)" : "var(--chart-1)";
}

export function Bars({
  bars,
  title,
  summary,
  valueHeader,
  orientation = "column",
  tone = "series",
  max,
  showTrack = false,
  table: tableOverride,
}: BarsProps) {
  const table: ChartTable = tableOverride ?? {
    columns: ["Label", valueHeader],
    rows: bars.map((bar) => ({ header: bar.label, cells: [bar.valueLabel ?? formatCount(bar.value)] })),
  };

  return orientation === "column" ? (
    <ColumnBars bars={bars} title={title} summary={summary} table={table} tone={tone} />
  ) : (
    <RowBars bars={bars} title={title} summary={summary} table={table} tone={tone} max={max} showTrack={showTrack} />
  );
}

function ColumnBars({
  bars,
  title,
  summary,
  table,
  tone,
}: {
  bars: BarDatum[];
  title: string;
  summary: string;
  table: ChartTable;
  tone: BarTone;
}) {
  const values = bars.map((bar) => bar.value);
  const top = axisMax(Math.max(0, ...values));
  const ticks = niceTicks(Math.max(0, ...values));
  const layout = bandLayout(bars.length, COLUMN_PLOT_W);
  const labelled = new Set(axisLabelIndexes(bars.length, 4));

  return (
    <ChartFrame title={title} summary={summary} viewBox={`0 0 ${VIEW_W} ${COLUMN_VIEW_H}`} table={table}>
      {ticks.map((tick) => {
        const y = round(PAD_T + valueToY(tick, top, COLUMN_PLOT_H));
        return (
          <g key={tick}>
            <line
              x1={GUTTER_L}
              y1={y}
              x2={VIEW_W - PAD_R}
              y2={y}
              stroke="var(--color-border)"
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
            <text x={GUTTER_L - 4} y={y + 3} textAnchor="end" fontSize={9} fill="var(--color-text-muted)">
              {formatCount(tick)}
            </text>
          </g>
        );
      })}

      {bars.map((bar, index) => {
        const x = GUTTER_L + bandStart(index, layout);
        const y = PAD_T + valueToY(bar.value, top, COLUMN_PLOT_H);
        const height = PAD_T + COLUMN_PLOT_H - y;
        return (
          <g key={`${bar.label}-${index}`}>
            <title>{`${bar.label}: ${bar.valueLabel ?? formatCount(bar.value)}`}</title>
            <path d={barPath(x, y, layout.thickness, height, 4, "up")} fill={toneFill(tone)} />
          </g>
        );
      })}

      {bars.map((bar, index) =>
        labelled.has(index) ? (
          <text
            key={`label-${bar.label}-${index}`}
            x={round(GUTTER_L + bandStart(index, layout) + layout.thickness / 2)}
            y={COLUMN_VIEW_H - 5}
            textAnchor="middle"
            fontSize={9}
            fill="var(--color-text-muted)"
          >
            {bar.label}
          </text>
        ) : null,
      )}
    </ChartFrame>
  );
}

function RowBars({
  bars,
  title,
  summary,
  table,
  tone,
  max,
  showTrack,
}: {
  bars: BarDatum[];
  title: string;
  summary: string;
  table: ChartTable;
  tone: BarTone;
  max?: number;
  showTrack: boolean;
}) {
  const top = max ?? Math.max(0, ...bars.map((bar) => bar.value));
  const height = Math.max(ROW_H, bars.length * ROW_H - (ROW_H - ROW_BAR_Y - ROW_BAR_H));

  return (
    <ChartFrame title={title} summary={summary} viewBox={`0 0 ${VIEW_W} ${height}`} table={table}>
      {bars.map((bar, index) => {
        const y = index * ROW_H;
        const length = valueToLength(bar.value, top, VIEW_W);
        const valueLabel = bar.valueLabel ?? formatCount(bar.value);
        return (
          <g key={`${bar.label}-${index}`}>
            <title>{`${bar.label}: ${valueLabel}`}</title>
            <text x={0} y={y + 9} fontSize={10} fill="var(--color-text)">
              {fitLabel(bar.label, valueLabel, VIEW_W)}
            </text>
            <text
              x={VIEW_W}
              y={y + 9}
              textAnchor="end"
              fontSize={10}
              fill="var(--color-text-muted)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {valueLabel}
            </text>
            {showTrack ? (
              <rect x={0} y={y + ROW_BAR_Y} width={VIEW_W} height={ROW_BAR_H} rx={4} fill="var(--color-bg-inset)" />
            ) : null}
            <path d={barPath(0, y + ROW_BAR_Y, length, ROW_BAR_H, 4, "right")} fill={toneFill(tone)} />
          </g>
        );
      })}
    </ChartFrame>
  );
}
