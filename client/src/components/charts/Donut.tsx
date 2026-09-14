import { ChartFrame, ChartLegend, type ChartTable } from "./ChartFrame.js";
import { donutArcs, formatCount, formatPercent, severityFill } from "./helpers.js";

/**
 * A ring of parts of one whole — used here for the triage split of completed
 * symptom checks.
 *
 * The slices wear the SEVERITY ramp, in order, because the four triage
 * levels are ordered rather than merely different: "monitor at home" through
 * "emergency" is a scale, and a scale drawn as four unrelated hues both
 * loses the order and fails CVD separation outright (green vs amber measured
 * ΔE 0.9 under deuteranopia). Lightness carries the severity; the legend's
 * labels and counts carry the identity; the ring itself carries only the
 * proportion.
 *
 * Slices are separated by a real gap in the surface, never by a stroke — and
 * the 100% case is drawn as a full ring rather than a degenerate arc, which
 * is the bug this chart type is famous for.
 */

const SIZE = 132;
const THICKNESS = 26;

export interface DonutDatum {
  label: string;
  value: number;
}

interface DonutProps {
  /** Lowest severity first — the order the ramp is applied in. */
  slices: DonutDatum[];
  /** The number in the middle of the ring: the whole these are parts of. */
  centreValue: string;
  centreLabel: string;
  title: string;
  summary: string;
  valueHeader: string;
}

export function Donut({ slices, centreValue, centreLabel, title, summary, valueHeader }: DonutProps) {
  const arcs = donutArcs(slices, { size: SIZE, thickness: THICKNESS, gapDegrees: 3 });

  const table: ChartTable = {
    columns: ["Slice", valueHeader, "Share"],
    rows: arcs.map((arc) => ({
      header: arc.label,
      cells: [formatCount(arc.value), formatPercent(arc.share)],
    })),
  };

  return (
    <ChartFrame
      title={title}
      summary={summary}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      svgClassName="mx-auto block h-auto w-full max-w-[168px]"
      table={table}
      legend={
        <ChartLegend
          items={arcs.map((arc, index) => ({
            swatch: severityFill(index),
            label: arc.label,
            value: `${formatCount(arc.value)} · ${formatPercent(arc.share)}`,
          }))}
        />
      }
    >
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={SIZE / 2 - THICKNESS / 2}
        fill="none"
        stroke="var(--color-bg-inset)"
        strokeWidth={THICKNESS}
      />
      {arcs.map((arc, index) =>
        arc.d ? (
          <g key={arc.label}>
            <title>{`${arc.label}: ${formatCount(arc.value)} (${formatPercent(arc.share)})`}</title>
            <path d={arc.d} fill={severityFill(index)} />
          </g>
        ) : null,
      )}
      <text
        x={SIZE / 2}
        y={SIZE / 2}
        textAnchor="middle"
        fontSize={22}
        fontWeight={800}
        fill="var(--color-text)"
      >
        {centreValue}
      </text>
      <text x={SIZE / 2} y={SIZE / 2 + 14} textAnchor="middle" fontSize={9} fill="var(--color-text-muted)">
        {centreLabel}
      </text>
    </ChartFrame>
  );
}
