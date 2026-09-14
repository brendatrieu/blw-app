import { ChartFrame, type ChartTable } from "./ChartFrame.js";
import {
  areaPath,
  axisLabelIndexes,
  axisMax,
  formatCount,
  linePath,
  niceTicks,
  pointX,
  round,
  valueToY,
} from "./helpers.js";

/**
 * The one time-series chart, and the only chart here that carries
 * annotations.
 *
 * Deploy markers are drawn in MUTED INK, dashed, behind the line — not in a
 * second series color. A deploy is not a measurement: giving it a hue would
 * put it in the same visual class as the data and invite reading two series
 * off one axis. Dashed also keeps it distinct from the gridlines, which the
 * mark spec fixes as solid hairlines.
 */

const VIEW_W = 320;
const VIEW_H = 150;
const GUTTER_L = 26;
const PAD_T = 10;
const PAD_B = 18;
const PAD_R = 6;
const PLOT_W = VIEW_W - GUTTER_L - PAD_R;
const PLOT_H = VIEW_H - PAD_T - PAD_B;

export interface LinePoint {
  label: string;
  value: number;
}

export interface LineMarker {
  /** Fractional point index — 2.5 is the middle of the third bucket. */
  at: number;
  label: string;
}

interface LineProps {
  points: LinePoint[];
  markers?: LineMarker[];
  title: string;
  summary: string;
  /** Names the measure in the table and the end label, e.g. "Parents". */
  valueHeader: string;
}

export function Line({ points, markers = [], title, summary, valueHeader }: LineProps) {
  const values = points.map((point) => point.value);
  const max = axisMax(Math.max(0, ...values));
  const ticks = niceTicks(Math.max(0, ...values));
  const box = { width: PLOT_W, height: PLOT_H, max };
  const labelled = new Set(axisLabelIndexes(points.length, 4));
  const last = points.length - 1;
  const lastY = PAD_T + valueToY(values[last] ?? 0, max, PLOT_H);

  const table: ChartTable = {
    columns: markers.length > 0 ? ["Week", valueHeader, "Deploys"] : ["Week", valueHeader],
    rows: points.map((point, index) => {
      const inWeek = markers.filter((marker) => Math.floor(marker.at) === index).map((marker) => marker.label);
      return {
        header: point.label,
        cells: markers.length > 0 ? [formatCount(point.value), inWeek.join(", ") || "—"] : [formatCount(point.value)],
      };
    }),
  };

  return (
    <ChartFrame title={title} summary={summary} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} table={table}>
      {ticks.map((tick) => {
        const y = round(PAD_T + valueToY(tick, max, PLOT_H));
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

      {markers.map((marker, index) => {
        const x = round(GUTTER_L + pointX(marker.at, points.length, PLOT_W));
        return (
          <g key={`${marker.label}-${index}`}>
            <title>{`Deploy ${marker.label}`}</title>
            <line
              x1={x}
              y1={PAD_T}
              x2={x}
              y2={PAD_T + PLOT_H}
              stroke="var(--color-text-muted)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <path
              d={`M${x - 3} ${PAD_T - 6} L${x + 3} ${PAD_T - 6} L${x} ${PAD_T - 1} Z`}
              fill="var(--color-text-muted)"
            />
          </g>
        );
      })}

      <path
        d={areaPath(values, box)}
        transform={`translate(${GUTTER_L} ${PAD_T})`}
        fill="var(--chart-1)"
        fillOpacity={0.12}
      />
      <path
        d={linePath(values, box)}
        transform={`translate(${GUTTER_L} ${PAD_T})`}
        fill="none"
        stroke="var(--chart-1)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {points.length > 0 ? (
        <>
          {/* 2px surface ring, so the end dot stays legible wherever it lands. */}
          <circle
            cx={round(GUTTER_L + pointX(last, points.length, PLOT_W))}
            cy={round(lastY)}
            r={4}
            fill="var(--chart-1)"
            stroke="var(--color-bg-elevated)"
            strokeWidth={2}
          />
          {/* One direct label — the endpoint. Flips below the line rather than
              being clipped when the series finishes at the top of the plot. */}
          <text
            x={VIEW_W - PAD_R}
            y={round(lastY < PAD_T + 14 ? lastY + 14 : lastY - 8)}
            textAnchor="end"
            fontSize={11}
            fontWeight={700}
            fill="var(--color-text)"
          >
            {formatCount(values[last] ?? 0)}
          </text>
        </>
      ) : null}

      {points.map((point, index) =>
        labelled.has(index) ? (
          <text
            key={point.label}
            x={round(GUTTER_L + pointX(index, points.length, PLOT_W))}
            y={VIEW_H - 5}
            textAnchor={index === 0 ? "start" : index === last ? "end" : "middle"}
            fontSize={9}
            fill="var(--color-text-muted)"
          >
            {point.label}
          </text>
        ) : null,
      )}
    </ChartFrame>
  );
}

const SPARK_W = 120;
const SPARK_H = 32;

/**
 * The stat tile's trend line: the same scale arithmetic with the axes,
 * labels and table stripped out. It carries no values of its own — the tile's
 * number and delta do that — so it is `role="img"` with a one-line title
 * rather than a second table nobody asked for.
 */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const max = axisMax(Math.max(0, ...values));
  // Inset by the dot's radius plus its ring, so the endpoint marker is drawn
  // inside the viewBox instead of half-clipped at the right edge.
  const box = { width: SPARK_W - 8, height: SPARK_H - 8, max };
  const last = values.length - 1;

  if (values.length === 0) return null;

  return (
    <svg
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      role="img"
      aria-label={label}
      className="block h-auto w-full"
      focusable="false"
    >
      <g transform="translate(4 4)">
        <path d={areaPath(values, box)} fill="var(--chart-1)" fillOpacity={0.12} />
        <path
          d={linePath(values, box)}
          fill="none"
          stroke="var(--chart-1)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={round(pointX(last, values.length, SPARK_W - 8))}
          cy={round(valueToY(values[last] ?? 0, max, SPARK_H - 8))}
          r={2.5}
          fill="var(--chart-1)"
          stroke="var(--color-bg-elevated)"
          strokeWidth={1.5}
        />
      </g>
    </svg>
  );
}
