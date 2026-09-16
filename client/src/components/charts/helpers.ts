/**
 * The arithmetic behind `components/charts/*` — every scale, tick, band,
 * percentage, heat step and label, with no React and no DOM in sight.
 *
 * Two reasons it all lives here rather than inside the components. First,
 * a chart is only as honest as its scale: an off-by-one band, a `max` that
 * silently becomes zero, or a percentage divided by the wrong denominator
 * produces a picture that is *wrong* rather than broken, and nothing about
 * the rendered SVG would look amiss. Pure functions can be pinned by tests;
 * a path string built inline inside a `<svg>` cannot. Second, every chart
 * here is drawn to a fixed viewBox and scaled by CSS, so "pixels" below are
 * really user units — the same numbers in every viewport, which is exactly
 * what makes them testable.
 */

// ---------------------------------------------------------------------------
// The ramp
// ---------------------------------------------------------------------------

/** The sequential/ordinal ramp's steps, lowest magnitude first. */
export const CHART_RAMP_STEPS = [1, 2, 3, 4, 5] as const;
export type ChartRampStep = (typeof CHART_RAMP_STEPS)[number];

/**
 * The first ramp step whose fill is dark enough (light mode) or light enough
 * (dark mode) that a label printed on it has to switch to the other ink.
 *
 * Imported by `styles/contrast.test.ts`, which gates exactly the pairings
 * this number produces — so moving the threshold moves the gate with it and
 * an unreadable retention cell fails the suite rather than shipping.
 */
export const RAMP_INK_THRESHOLD = 3;

/** `var(--chart-ramp-N)` for a step, clamped into the ramp. */
export function rampFill(step: number): string {
  return `var(--chart-ramp-${clamp(Math.round(step), 1, CHART_RAMP_STEPS.length)})`;
}

/** The label ink that stays legible on `rampFill(step)`. */
export function rampInk(step: number): string {
  const clamped = clamp(Math.round(step), 1, CHART_RAMP_STEPS.length);
  return clamped < RAMP_INK_THRESHOLD ? "var(--chart-ramp-ink-low)" : "var(--chart-ramp-ink-high)";
}

/** The four severity fills, lowest severity first. */
export function severityFill(index: number): string {
  return `var(--chart-sev-${clamp(Math.round(index) + 1, 1, 4)})`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// ---------------------------------------------------------------------------
// Ticks and scales
// ---------------------------------------------------------------------------

/** Rounds a raw step up to the next 1 / 2 / 5 × 10ⁿ, so axis labels read cleanly. */
export function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalized = raw / magnitude;
  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

/**
 * Ticks from 0 up to at least `max`, on a round step. Always at least two
 * entries, so an all-zero series still draws a baseline and a "1" — an axis
 * that collapses to a single line reads as a rendering bug, not as no data.
 *
 * **The step never goes below 1.** Every axis in this folder counts things —
 * parents, signups, skips, errors — and there is no such measurement as half
 * a parent. A max of 2 used to produce a step of 0.5 and the ticks 0, 0.5, 1,
 * 1.5, 2, which `formatCount` rounds to the labels 0, 1, 1, 2, 2: an axis
 * with each of its numbers printed twice, on gridlines that mean nothing.
 * Flooring the step at 1 gives 0, 1, 2 instead, and `axisMax` follows.
 */
export function niceTicks(max: number, targetCount = 4): number[] {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 0;
  const step = Math.max(1, niceStep(safeMax / Math.max(1, targetCount)));
  const top = Math.max(step, Math.ceil(safeMax / step) * step);
  const ticks: number[] = [];
  for (let value = 0; value <= top + step / 2; value += step) ticks.push(Number(value.toFixed(10)));
  return ticks;
}

/** The top tick — the value the plot's full height represents. */
export function axisMax(max: number, targetCount = 4): number {
  const ticks = niceTicks(max, targetCount);
  return ticks[ticks.length - 1] ?? 1;
}

/**
 * Distance from the TOP of a plot box for `value`, with the domain pinned to
 * `[0, max]`. A zero or negative `max` puts everything on the baseline
 * rather than dividing by zero — an empty week is a flat line, not NaN.
 */
export function valueToY(value: number, max: number, height: number): number {
  if (!(max > 0)) return height;
  return height - clamp(value / max, 0, 1) * height;
}

/** Length of a bar for `value` inside a track of `extent`, domain `[0, max]`. */
export function valueToLength(value: number, max: number, extent: number): number {
  if (!(max > 0)) return 0;
  return clamp(value / max, 0, 1) * extent;
}

/** Where point `index` of `count` sits across a plot `width` wide. */
export function pointX(index: number, count: number, width: number): number {
  if (count <= 1) return width / 2;
  return (index / (count - 1)) * width;
}

export interface BandLayout {
  /** Width (or height) of one slot, including its air. */
  band: number;
  /** The mark's own thickness — never the whole slot. */
  thickness: number;
  /** Leading edge of the mark inside its slot. */
  offset: number;
}

/**
 * One slot per datum, with the mark centred inside it.
 *
 * `maxThickness` caps a bar at 24 units (the mark spec) even when the band
 * is wider: a two-bar chart whose bars are 150 units wide reads as two
 * blocks of color, not as data. `gap` is the surface gap that separates
 * touching bars — the separation is always air, never a stroke.
 */
export function bandLayout(
  count: number,
  extent: number,
  { gap = 2, maxThickness = 24 }: { gap?: number; maxThickness?: number } = {},
): BandLayout {
  if (count <= 0) return { band: extent, thickness: 0, offset: 0 };
  const band = extent / count;
  const thickness = Math.max(1, Math.min(maxThickness, band - gap));
  return { band, thickness, offset: (band - thickness) / 2 };
}

/** Leading edge of band `index` under a `bandLayout`. */
export function bandStart(index: number, layout: BandLayout): number {
  return index * layout.band + layout.offset;
}

/**
 * Which x positions get a written label. Always the first and the last, then
 * as even a spread between them as the count allows — a 26-week axis with a
 * label under every column is unreadable at phone width.
 */
export function axisLabelIndexes(count: number, maxLabels = 5): number[] {
  if (count <= 0) return [];
  if (count <= maxLabels) return Array.from({ length: count }, (_, index) => index);
  const stride = (count - 1) / (maxLabels - 1);
  const indexes = new Set<number>();
  for (let i = 0; i < maxLabels; i++) indexes.add(Math.round(i * stride));
  return [...indexes].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export interface PlotBox {
  width: number;
  height: number;
  max: number;
}

/** Polyline through every value, left to right. Empty for no values. */
export function linePath(values: number[], { width, height, max }: PlotBox): string {
  if (values.length === 0) return "";
  return values
    .map((value, index) => {
      const x = pointX(index, values.length, width);
      const y = valueToY(value, max, height);
      return `${index === 0 ? "M" : "L"}${round(x)} ${round(y)}`;
    })
    .join(" ");
}

/** The same shape closed down to the baseline, for the 12% area wash. */
export function areaPath(values: number[], box: PlotBox): string {
  if (values.length === 0) return "";
  const line = linePath(values, box);
  const lastX = pointX(values.length - 1, values.length, box.width);
  const firstX = pointX(0, values.length, box.width);
  return `${line} L${round(lastX)} ${round(box.height)} L${round(firstX)} ${round(box.height)} Z`;
}

/** Two decimals is plenty at these sizes, and keeps the DOM (and the test pins) small. */
export function round(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Heat table
// ---------------------------------------------------------------------------

/**
 * Which ramp step a retention cell wears.
 *
 * `null` in, `null` out, always: a retention window that has not finished
 * yet for the whole cohort is NOT a zero, and painting it as the lightest
 * step would draw a collapse that has not happened. The caller renders those
 * cells as empty.
 */
export function heatStep(value: number | null | undefined, max: number): ChartRampStep | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  if (!(max > 0)) return 1;
  const share = clamp(value / max, 0, 1);
  return clamp(Math.ceil(share * CHART_RAMP_STEPS.length), 1, CHART_RAMP_STEPS.length) as ChartRampStep;
}

// ---------------------------------------------------------------------------
// Donut
// ---------------------------------------------------------------------------

export interface DonutSlice {
  label: string;
  value: number;
}

export interface DonutArc extends DonutSlice {
  share: number;
  /** Empty for a zero-value slice — nothing to draw, and no zero-width wedge. */
  d: string;
}

/**
 * Ring segments, clockwise from twelve o'clock, separated by a real gap in
 * the surface color rather than by a stroke.
 *
 * A single non-zero slice is drawn as two half arcs: SVG's elliptical arc
 * cannot express a 360° sweep (start and end coincide, and the renderer
 * draws nothing), which is the classic "the 100% case is invisible" bug.
 */
export function donutArcs(
  slices: DonutSlice[],
  { size, thickness, gapDegrees = 2 }: { size: number; thickness: number; gapDegrees?: number },
): DonutArc[] {
  const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0);
  const outer = size / 2;
  const inner = Math.max(1, outer - thickness);
  const centre = size / 2;
  const drawn = slices.filter((slice) => slice.value > 0).length;
  const gap = drawn > 1 ? gapDegrees : 0;

  let cursor = 0;
  return slices.map((slice) => {
    const value = Math.max(0, slice.value);
    const share = total > 0 ? value / total : 0;
    const sweep = share * 360;
    const start = cursor + gap / 2;
    const end = cursor + sweep - gap / 2;
    cursor += sweep;
    if (value <= 0 || end <= start) return { ...slice, share, d: "" };
    if (sweep >= 359.999) return { ...slice, share, d: fullRing(centre, outer, inner) };
    return { ...slice, share, d: ringSegment(centre, outer, inner, start, end) };
  });
}

/** Degrees clockwise from twelve o'clock → a point on a circle. */
function polar(centre: number, radius: number, degrees: number): { x: number; y: number } {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return { x: centre + radius * Math.cos(radians), y: centre + radius * Math.sin(radians) };
}

function ringSegment(centre: number, outer: number, inner: number, start: number, end: number): string {
  const large = end - start > 180 ? 1 : 0;
  const o1 = polar(centre, outer, start);
  const o2 = polar(centre, outer, end);
  const i2 = polar(centre, inner, end);
  const i1 = polar(centre, inner, start);
  return [
    `M${round(o1.x)} ${round(o1.y)}`,
    `A${round(outer)} ${round(outer)} 0 ${large} 1 ${round(o2.x)} ${round(o2.y)}`,
    `L${round(i2.x)} ${round(i2.y)}`,
    `A${round(inner)} ${round(inner)} 0 ${large} 0 ${round(i1.x)} ${round(i1.y)}`,
    "Z",
  ].join(" ");
}

function fullRing(centre: number, outer: number, inner: number): string {
  return [
    `M${round(centre)} ${round(centre - outer)}`,
    `A${round(outer)} ${round(outer)} 0 1 1 ${round(centre)} ${round(centre + outer)}`,
    `A${round(outer)} ${round(outer)} 0 1 1 ${round(centre)} ${round(centre - outer)}`,
    `M${round(centre)} ${round(centre - inner)}`,
    `A${round(inner)} ${round(inner)} 0 1 0 ${round(centre)} ${round(centre + inner)}`,
    `A${round(inner)} ${round(inner)} 0 1 0 ${round(centre)} ${round(centre - inner)}`,
    "Z",
  ].join(" ");
}

// ---------------------------------------------------------------------------
// Week buckets and deploy markers
// ---------------------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * `YYYY-MM-DD` → `Mon D`, read in **UTC**.
 *
 * The server computes bucket edges as UTC Mondays on purpose; parsing the
 * string with `new Date("2026-09-07")` and then reading local getters would
 * slide the label a day backwards for everyone west of Greenwich, so the
 * axis would disagree with the data it labels.
 */
export function weekLabel(weekStart: string): string {
  const date = parseWeekStart(weekStart);
  if (!date) return weekStart;
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/** The same bucket as a full `Mon D – Mon D` span, for tables and captions. */
export function weekRangeLabel(weekStart: string): string {
  const date = parseWeekStart(weekStart);
  if (!date) return weekStart;
  const end = new Date(date.getTime() + WEEK_MS - 1);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()} – ${MONTHS[end.getUTCMonth()]} ${end.getUTCDate()}`;
}

function parseWeekStart(weekStart: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return null;
  const date = new Date(`${weekStart}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Where a deploy sits on a week axis, as a fractional point index (2.5 = the
 * middle of the third week). `null` when it falls outside the plotted range —
 * a marker clamped to the edge would claim a deploy happened in a week it
 * did not.
 */
export function weekFraction(instant: string, weekStarts: string[]): number | null {
  if (weekStarts.length === 0) return null;
  const at = new Date(instant).getTime();
  if (Number.isNaN(at)) return null;
  const first = parseWeekStart(weekStarts[0]!);
  const last = parseWeekStart(weekStarts[weekStarts.length - 1]!);
  if (!first || !last) return null;
  if (at < first.getTime() || at >= last.getTime() + WEEK_MS) return null;
  return (at - first.getTime()) / WEEK_MS;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** 0–9 999 grouped with commas, bigger numbers compacted (12.9K, 1.2M). */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs < 10_000) return sign + Math.round(abs).toLocaleString("en-US");
  if (abs < 1_000_000) return `${sign}${trimZero(abs / 1000)}K`;
  return `${sign}${trimZero(abs / 1_000_000)}M`;
}

function trimZero(value: number): string {
  const fixed = value.toFixed(1);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
}

/** A 0..1 share as a whole percent. Not a ratio — callers pass shares. */
export function formatPercent(share: number, digits = 0): string {
  if (!Number.isFinite(share)) return "—";
  return `${(share * 100).toFixed(digits)}%`;
}

/**
 * A plain rate (errors per 100 sessions), always to one decimal.
 *
 * The trailing ".0" is kept on purpose: this number is read against a
 * threshold ("above two per hundred, feature work stops"), and rounding 1.96
 * to a bare "2" would show the gate as tripped when it is not.
 */
export function formatRate(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(1);
}

export type DeltaDirection = "up" | "down" | "flat";
export type DeltaTone = "good" | "bad" | "neutral";

export interface Delta {
  direction: DeltaDirection;
  tone: DeltaTone;
  /** Signed change, e.g. `+3`, `-2`, or `0`. */
  label: string;
  /** Spoken form, so the arrow glyph is never the only carrier. */
  description: string;
}

/**
 * Change against the previous period, with the direction and whether that
 * direction is *good* kept separate: errors going up is the same arrow as
 * signups going up and the opposite news, and a delta chip that colors by
 * direction alone gets one of them backwards.
 */
export function deltaOf(
  current: number,
  previous: number,
  { upIsGood = true, unit = "" }: { upIsGood?: boolean; unit?: string } = {},
): Delta {
  const change = current - previous;
  const direction: DeltaDirection = change > 0 ? "up" : change < 0 ? "down" : "flat";
  const tone: DeltaTone = direction === "flat" ? "neutral" : (direction === "up") === upIsGood ? "good" : "bad";
  const magnitude = formatCount(Math.abs(change));
  const label = direction === "flat" ? "0" : `${direction === "up" ? "+" : "-"}${magnitude}`;
  const suffix = unit ? ` ${unit}` : "";
  const description =
    direction === "flat"
      ? "no change from last week"
      : `${magnitude}${suffix} ${direction === "up" ? "more" : "fewer"} than last week`;
  return { direction, tone, label, description };
}

/**
 * A slug or snake_case key as a sentence: `vitamin_c_level` → `Vitamin C
 * level`, `gagging-vs-choking` → `Gagging vs choking`. Labels come from
 * closed enums in the shared schema, so this is presentation only — it can
 * never surface a name a parent typed.
 */
export function humanizeKey(key: string): string {
  const words = key.split(/[-_]/).filter(Boolean);
  if (words.length === 0) return key;
  const spelled = words.map((word) => (word.toLowerCase() === "c" ? "C" : word.toLowerCase()));
  const [first, ...rest] = spelled;
  return [first!.charAt(0).toUpperCase() + first!.slice(1), ...rest].join(" ");
}

/**
 * The "as of" stamp, in the reader's own local time and without
 * `toLocaleString` — the owner checks this from a phone and a laptop, and
 * two different renderings of the same instant read as two different
 * numbers.
 */
export function formatTimestamp(instant: string | Date): string {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return "—";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${hours}:${minutes}`;
}

// ---------------------------------------------------------------------------
// Bar geometry
// ---------------------------------------------------------------------------

/**
 * A bar with a 4px-rounded DATA END and a square baseline — the mark spec's
 * asymmetry, and the reason this is a path rather than a `<rect rx>`: rounding
 * all four corners lifts the bar off its own baseline, so a short bar reads as
 * a floating pill instead of a measurement from zero.
 */
export function barPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  direction: "up" | "right",
): string {
  if (width <= 0 || height <= 0) return "";
  if (direction === "up") {
    const r = clamp(radius, 0, Math.min(width / 2, height));
    return [
      `M${round(x)} ${round(y + height)}`,
      `L${round(x)} ${round(y + r)}`,
      `Q${round(x)} ${round(y)} ${round(x + r)} ${round(y)}`,
      `L${round(x + width - r)} ${round(y)}`,
      `Q${round(x + width)} ${round(y)} ${round(x + width)} ${round(y + r)}`,
      `L${round(x + width)} ${round(y + height)}`,
      "Z",
    ].join(" ");
  }
  const r = clamp(radius, 0, Math.min(height / 2, width));
  return [
    `M${round(x)} ${round(y)}`,
    `L${round(x + width - r)} ${round(y)}`,
    `Q${round(x + width)} ${round(y)} ${round(x + width)} ${round(y + r)}`,
    `L${round(x + width)} ${round(y + height - r)}`,
    `Q${round(x + width)} ${round(y + height)} ${round(x + width - r)} ${round(y + height)}`,
    `L${round(x)} ${round(y + height)}`,
    "Z",
  ].join(" ");
}

// ---------------------------------------------------------------------------
// Label fitting
// ---------------------------------------------------------------------------

/**
 * Roughly how wide one character of a 10-unit label is, in user units.
 *
 * An approximation, because SVG cannot measure text without a DOM and these
 * charts render server-side in the test suite as well as in a browser. It is
 * deliberately a slight OVER-estimate of the average advance in the app's
 * sans, so the budget below errs toward truncating a label that would have
 * just fitted rather than letting one overlap its value.
 */
export const CHART_LABEL_CHAR_UNITS = 5.2;

/** End-truncates with an ellipsis. Anything longer than `maxChars` loses its tail. */
export function truncateLabel(label: string, maxChars: number): string {
  if (maxChars <= 0) return "";
  return label.length <= maxChars ? label : `${label.slice(0, Math.max(1, maxChars - 1))}…`;
}

/**
 * A row's label, cut to whatever the value label leaves it.
 *
 * The mark spec's rule is "a label that won't fit doesn't get clipped" — an
 * SVG `<text>` does not wrap or ellipsize on its own, it just overlaps
 * whatever is beside it, which on a long error route is the number the row
 * exists to show. Nothing is lost by cutting here: the full string is still
 * in the mark's `<title>` and in the chart's table.
 */
export function fitLabel(label: string, valueLabel: string, width = 320, gap = 10): string {
  const available = width - valueLabel.length * CHART_LABEL_CHAR_UNITS - gap;
  return truncateLabel(label, Math.max(6, Math.floor(available / CHART_LABEL_CHAR_UNITS)));
}
