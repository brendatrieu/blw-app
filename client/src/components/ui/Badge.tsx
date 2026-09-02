import type { ReactNode } from "react";

export type BadgeTone = "primary" | "neutral" | "danger" | "dangerSoft" | "sunshine" | "leaf";

const TONE_CLASSES: Record<BadgeTone, string> = {
  // Solid CTA-style fill — the single "strong" badge look, shared with buttons.
  primary: "bg-[var(--color-primary)] text-[var(--color-primary-contrast)]",
  danger: "bg-[var(--color-danger)] text-[var(--color-danger-contrast)]",
  // Quiet danger STATUS (e.g. "Expired") — a chip, not an alert or a button.
  dangerSoft: "bg-[var(--color-danger-soft)] text-[var(--color-danger-soft-text)]",
  // Translucent tints (bg + matching deep/pastel text) — a gentle label
  // rather than an alert. Prop names stay their old "sunshine"/"leaf"
  // shorthand for caution/success even though the token values underneath
  // are the new palette's.
  neutral: "bg-[var(--color-neutral-soft)] text-[var(--color-neutral-soft-text)]",
  sunshine: "bg-[var(--color-caution-soft)] text-[var(--color-caution-soft-text)]",
  leaf: "bg-[var(--color-success-soft)] text-[var(--color-success-soft-text)]",
};

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
}

/** Small pill label used for tags, counts, and status chips across the app. */
export function Badge({ children, tone = "neutral" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-[var(--radius-pill)] px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
