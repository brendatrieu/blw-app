import { useId, type ReactNode } from "react";

/**
 * The frame every chart in this folder is drawn inside, and the reason none
 * of them is a picture with no way in.
 *
 * Three things it guarantees. The `<svg>` is `role="img"` with a real
 * `<title>` and `<desc>`, so assistive tech announces what the chart IS
 * before its numbers. A **visually-hidden data table** carries every value —
 * the fallback the dataviz method requires, and the only honest answer to
 * "what does a screen reader do with a path element". And the viewBox does
 * the responsiveness: the SVG has no fixed pixel size, so one drawing works
 * from a 360px phone to a desktop card without a media query or a measured
 * container.
 */

export interface ChartTable {
  /** Column headers, the first of which names the row header column. */
  columns: string[];
  rows: Array<{ header: string; cells: string[] }>;
}

interface ChartFrameProps {
  /** What the chart is — becomes `<title>` and the table's caption. */
  title: string;
  /** One sentence of what it shows, including the headline number. */
  summary: string;
  viewBox: string;
  table: ChartTable;
  /** Legend / key, rendered under the drawing where two or more colors carry identity. */
  legend?: ReactNode;
  svgClassName?: string;
  children: ReactNode;
}

export function ChartFrame({
  title,
  summary,
  viewBox,
  table,
  legend,
  svgClassName = "block h-auto w-full",
  children,
}: ChartFrameProps) {
  const id = useId();

  return (
    <figure className="m-0 flex flex-col gap-2">
      <svg
        viewBox={viewBox}
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
        className={svgClassName}
        focusable="false"
      >
        <title id={`${id}-title`}>{title}</title>
        <desc id={`${id}-desc`}>{summary}</desc>
        {children}
      </svg>
      {legend}
      <ChartDataTable caption={title} table={table} />
    </figure>
  );
}

/**
 * The chart's numbers as a real table, hidden from sight but not from
 * assistive tech (`sr-only` clips it rather than `display: none`, which
 * would take it out of the accessibility tree along with the pixels).
 */
export function ChartDataTable({ caption, table }: { caption: string; table: ChartTable }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {table.columns.map((column, index) => (
            <th key={`${column}-${index}`} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row) => (
          <tr key={row.header}>
            <th scope="row">{row.header}</th>
            {row.cells.map((cell, index) => (
              <td key={index}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export interface LegendItem {
  /** A CSS color — always a `var(--chart-*)`, never a literal. */
  swatch: string;
  label: string;
  value?: string;
}

/**
 * The identity channel that is not color. Present whenever a chart uses more
 * than one fill, so nobody has to match a hue to a meaning by eye — the
 * mitigation that makes an ordinal ramp legal where a categorical palette
 * would have collapsed under CVD.
 */
export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
            style={{ backgroundColor: item.swatch }}
          />
          <span className="text-[var(--color-text)]">{item.label}</span>
          {item.value ? <span>{item.value}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** Shown in a panel's chart slot when the range holds nothing to draw. */
export function ChartEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-[var(--radius-md)] bg-[var(--color-bg-inset)] px-3 py-6 text-center text-sm text-[var(--color-text-muted)]">
      {children}
    </p>
  );
}
