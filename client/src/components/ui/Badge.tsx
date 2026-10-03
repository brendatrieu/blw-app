import type { ReactNode } from "react";

export type BadgeTone = "primary" | "neutral" | "allergen" | "dangerSoft" | "sunshine" | "leaf" | "outline" | "nutrient";

const TONE_CLASSES: Record<BadgeTone, string> = {
  // Solid CTA-style fill — the single "strong" badge look, shared with buttons.
  primary: "bg-[var(--color-primary)] text-[var(--color-primary-contrast)]",
  // The allergen pill (item 636): a soft plum, not red — red is kept for
  // reactions, choking notes and Delete.
  allergen: "bg-[var(--color-allergen-soft)] text-[var(--color-allergen-soft-text)]",
  // Quiet danger STATUS (e.g. "Expired") — a chip, not an alert or a button.
  dangerSoft: "bg-[var(--color-danger-soft)] text-[var(--color-danger-soft-text)]",
  // Translucent tints (bg + matching deep/pastel text) — a gentle label
  // rather than an alert. Prop names stay their old "sunshine"/"leaf"
  // shorthand for caution/success even though the token values underneath
  // are the new palette's.
  neutral: "bg-[var(--color-neutral-soft)] text-[var(--color-neutral-soft-text)]",
  sunshine: "bg-[var(--color-caution-soft)] text-[var(--color-caution-soft-text)]",
  leaf: "bg-[var(--color-success-soft)] text-[var(--color-success-soft-text)]",
  // Badge rules (item 637): tinted = status, outline = plain info (6m+,
  // Custom, prep time), nutrient = one soft tint for every nutrient badge.
  // An inset ring, not a border, so it adds no height: outline badges stay
  // as tall as the tinted ones (item 647).
  outline: "inset-ring inset-ring-[var(--color-border)] text-[var(--color-text-muted)]",
  nutrient: "bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-text)]",
};

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  /**
   * Native tooltip spelling out a chip whose label is deliberately short
   * (the allergen "Serve again soon" badge, whose full sentence is too long
   * for a pill). Pair it with `sr-only` text inside `children` — a `title`
   * alone is not reliably announced.
   */
  title?: string;
}

/** Small pill label used for tags, counts, and status chips across the app. */
export function Badge({ children, tone = "neutral", title }: BadgeProps) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-[var(--radius-pill)] px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
