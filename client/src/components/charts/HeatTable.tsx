import { ChartFrame, type ChartTable } from "./ChartFrame.js";
import { formatCount, formatPercent, heatStep, rampFill, rampInk, round } from "./helpers.js";

/**
 * One row per signup week, one cell per window measured against it, painted
 * on the sequential ramp. Two panels read this way: the retention triangle
 * (a cell per week since signup) and activation (a cell per stage).
 *
 * The load-bearing rule is what an EMPTY cell means. A window that has not
 * finished yet for the whole cohort comes back as `null`, and a null cell is
 * drawn as bare inset surface with a dash — never as the ramp's lightest
 * step. Painting "not yet known" the same as "nobody came back" draws a
 * collapse that has not happened, and the triangle's whole shape is that
 * distinction.
 *
 * Cells print their own percentage, which is why the ink switches with the
 * step (see `rampInk`): this is the one place in the app where text sits on
 * a chart color, and `styles/contrast.test.ts` gates every step/ink pairing
 * in both themes.
 */

const VIEW_W = 320;
const LABEL_W = 58;
const HEADER_H = 12;
const ROW_H = 22;
const CELL_H = 20;
const CELL_GAP = 2;

export interface HeatRow {
  label: string;
  /** The cohort's size — the denominator every cell in the row is read against. */
  size: number;
  /** One count per column, `null` where that window has not closed yet. */
  cells: Array<number | null>;
}

interface HeatTableProps {
  columns: string[];
  rows: HeatRow[];
  title: string;
  summary: string;
  /**
   * What a painted cell prints. `"share"` (the default, and the retention
   * triangle's own reading) prints the percentage alone; `"count-share"`
   * prints "3 · 75%", for a table whose rows are small enough that the raw
   * count is the number the reader wants first. The hidden table carries
   * "75% (3)" either way — a screen reader has room for both.
   */
  cellText?: "share" | "count-share";
}

export function HeatTable({ columns, rows, title, summary, cellText = "share" }: HeatTableProps) {
  const cellW = (VIEW_W - LABEL_W) / Math.max(1, columns.length);
  const height = HEADER_H + rows.length * ROW_H;

  const table: ChartTable = {
    columns: ["Cohort", ...columns],
    rows: rows.map((row) => ({
      header: `${row.label} (${formatCount(row.size)} signups)`,
      cells: row.cells.map((cell) =>
        cell === null ? "not yet" : `${formatPercent(share(cell, row.size))} (${formatCount(cell)})`,
      ),
    })),
  };

  return (
    <ChartFrame title={title} summary={summary} viewBox={`0 0 ${VIEW_W} ${height}`} table={table}>
      {columns.map((column, index) => (
        <text
          key={column}
          x={round(LABEL_W + index * cellW + (cellW - CELL_GAP) / 2)}
          y={HEADER_H - 4}
          textAnchor="middle"
          fontSize={8}
          fill="var(--color-text-muted)"
        >
          {column}
        </text>
      ))}

      {rows.map((row, rowIndex) => {
        const y = HEADER_H + rowIndex * ROW_H;
        return (
          <g key={row.label}>
            <text x={0} y={y + CELL_H / 2 + 3} fontSize={8} fill="var(--color-text)">
              {`${row.label} (${formatCount(row.size)})`}
            </text>
            {row.cells.map((cell, cellIndex) => {
              const x = LABEL_W + cellIndex * cellW;
              const value = cell === null ? null : share(cell, row.size);
              const step = heatStep(value, 1);
              return (
                <g key={`${row.label}-${cellIndex}`}>
                  <title>
                    {cell === null
                      ? `${row.label}, ${columns[cellIndex] ?? ""}: not measured yet`
                      : `${row.label}, ${columns[cellIndex] ?? ""}: ${formatCount(cell)} of ${formatCount(row.size)}`}
                  </title>
                  <rect
                    x={round(x)}
                    y={y}
                    width={round(cellW - CELL_GAP)}
                    height={CELL_H}
                    rx={3}
                    fill={step === null ? "var(--color-bg-inset)" : rampFill(step)}
                  />
                  <text
                    x={round(x + (cellW - CELL_GAP) / 2)}
                    y={y + CELL_H / 2 + 3}
                    textAnchor="middle"
                    fontSize={8}
                    fill={step === null ? "var(--color-text-muted)" : rampInk(step)}
                  >
                    {step === null
                      ? "–"
                      : cellText === "count-share"
                        ? `${formatCount(cell ?? 0)} · ${formatPercent(value ?? 0)}`
                        : formatPercent(value ?? 0)}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </ChartFrame>
  );
}

function share(retained: number, size: number): number {
  return size > 0 ? retained / size : 0;
}
