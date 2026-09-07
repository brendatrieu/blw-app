import type { AlarmLevel } from "../alarmColors.js";

/** Visible-to-screen-readers name for each solo-triage tier. */
export function triageBadgeLabel(level: AlarmLevel): string {
  return level === "emergency" ? "Emergency" : "See today";
}

/** Same source as the food tiles: plain Unicode emoji, no bespoke SVG. */
export const TRIAGE_EMOJI: Record<AlarmLevel, string> = {
  emergency: "⚠️",
  urgent_care: "🩺",
};

/** The stethoscope's tubing is near-black ink — sit it on a light disc. */
const NEEDS_DISC: Record<AlarmLevel, boolean> = { emergency: false, urgent_care: true };

/**
 * Emoji-only alarm mark beside a symptom that on its own warrants care —
 * the same plain Unicode emoji the food tiles use, no pill or chrome. The
 * meaning is spelled out once by <TriageLegend> above the checklist, and
 * sr-only text keeps "Emergency" / "See today" for assistive tech.
 */
export function TriageBadge({ level }: { level: AlarmLevel }) {
  return (
    // Negative vertical margin (same idiom as Switch): the 24px mark adds
    // nothing to row height, so rows with and without a mark stay equal.
    // The disc is sized to the ⚠️ glyph's rendered height, so the 🩺
    // inside it is drawn smaller to fit — Apple's emoji ink runs ~1.3× the
    // font size, so 13px keeps it inside the 24px disc on iOS.
    <span className="-my-0.5 inline-flex shrink-0 items-center">
      <span
        aria-hidden="true"
        className={`flex h-6 w-6 items-center justify-center leading-none ${
          NEEDS_DISC[level] ? "emoji-disc text-[13px]" : "text-xl"
        }`}
        data-icon={level}
      >
        {TRIAGE_EMOJI[level]}
      </span>
      <span className="sr-only">{triageBadgeLabel(level)}</span>
    </span>
  );
}

const LEGEND: ReadonlyArray<{ level: AlarmLevel; text: string }> = [
  { level: "emergency", text: "Needs immediate care — call emergency services." },
  { level: "urgent_care", text: "See a doctor today." },
];

/** Plain two-line key explaining the badges — deliberately not an alert box. */
export function TriageLegend() {
  return (
    <div role="group" className="flex flex-col gap-3" aria-label="What the symptom marks mean">
      <p className="text-xs text-[var(--color-text-muted)]">Symptoms marked like this need care on their own:</p>
      {LEGEND.map((entry) => (
        <p key={entry.level} className="flex items-center gap-2 text-xs text-[var(--color-text)]">
          <TriageBadge level={entry.level} />
          {entry.text}
        </p>
      ))}
    </div>
  );
}
