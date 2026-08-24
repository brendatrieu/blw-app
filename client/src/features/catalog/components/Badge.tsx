import type { ReactNode } from "react";

type BadgeTone = "primary" | "accent" | "neutral" | "danger";

const TONE_CLASSES: Record<BadgeTone, string> = {
  primary: "bg-[var(--color-primary)] text-[var(--color-primary-contrast)]",
  accent: "bg-[var(--color-accent)] text-[var(--color-primary-contrast)]",
  neutral: "bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] border border-[var(--color-border)]",
  danger: "bg-[var(--color-danger)] text-[var(--color-primary-contrast)]",
};

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
}

export function Badge({ children, tone = "neutral" }: BadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}
