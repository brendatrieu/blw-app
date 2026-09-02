import type { ButtonHTMLAttributes } from "react";
import { Link, type LinkProps } from "react-router-dom";

export type ButtonVariant = "primary" | "secondary" | "tonal" | "ghost" | "danger";
export type ButtonSize = "md" | "sm";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "border border-transparent bg-[var(--color-primary)] text-[var(--color-primary-contrast)] shadow-[var(--shadow-sm)] hover:bg-[var(--color-primary-hover)] active:bg-[var(--color-primary-active)]",
  secondary: "border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text)]",
  // A quieter CTA than `primary`: the same contrast-gated soft-tint tokens
  // used for badges/chips, not a new color. Hover mixes in a touch of the
  // solid `--color-primary` token to nudge the tint's alpha up slightly —
  // both are existing tokens, no new hex introduced.
  tonal:
    "border border-transparent bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-text)] hover:bg-[color-mix(in_srgb,var(--color-primary-soft),var(--color-primary)_15%)]",
  ghost: "border border-transparent bg-transparent text-[var(--color-text)] hover:bg-[var(--color-bg-inset)]",
  danger: "border border-transparent bg-[var(--color-danger)] text-[var(--color-danger-contrast)] shadow-[var(--shadow-sm)]",
};

// `md` meets the 44px touch-target minimum; `sm` is a deliberate exception
// for dense, secondary actions inside existing list rows (delete/cancel
// links) where a full-size button would overwhelm the row.
const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: "min-h-11 px-4 py-2 text-sm",
  sm: "min-h-9 px-3 py-1.5 text-sm",
};

// Chunky, rounded, springy: a quick scale-down on press (skipped for
// reduced-motion users, who get an instant, motionless press instead).
const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] font-semibold transition-[transform,background-color,border-color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-spring)] active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = "primary", size = "md", className = "", ...props }: ButtonProps) {
  return <button className={`${BASE} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`} {...props} />;
}

interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** A `Link` styled identically to `Button`, for primary actions that navigate. */
export function ButtonLink({ variant = "primary", size = "md", className = "", ...props }: ButtonLinkProps) {
  return <Link className={`${BASE} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`} {...props} />;
}
