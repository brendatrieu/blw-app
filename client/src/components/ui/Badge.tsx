import type { ReactNode } from "react";

export type BadgeTone = "primary" | "accent" | "neutral" | "danger" | "sunshine" | "leaf";

const TONE_CLASSES: Record<BadgeTone, string> = {
  primary: "bg-[var(--color-primary)] text-[var(--color-primary-contrast)]",
  accent: "bg-[var(--color-accent)] text-[var(--color-primary-contrast)]",
  neutral: "bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] border border-[var(--color-border)]",
  danger: "bg-[var(--color-danger)] text-[var(--color-primary-contrast)]",
  // Soft-tone chips (bg + matching deep text) rather than a solid fill —
  // used where a badge should read as a gentle label, not an alert.
  sunshine: "bg-[var(--color-sunshine-soft)] text-[var(--color-sunshine-deep)]",
  leaf: "bg-[var(--color-leaf-soft)] text-[var(--color-leaf-deep)]",
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
