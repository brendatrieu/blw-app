import type { ButtonHTMLAttributes } from "react";
import { Link, type LinkProps } from "react-router-dom";

export type ButtonVariant = "primary" | "secondary" | "tonal" | "ghost" | "danger" | "danger-quiet";
export type ButtonSize = "md" | "sm";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "border border-transparent bg-[var(--color-primary)] text-[var(--color-primary-contrast)] shadow-[var(--shadow-sm)] hover:bg-[var(--color-primary-hover)] active:bg-[var(--color-primary-active)]",
  secondary: "border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text)]",
  // A quieter CTA than `primary` (the Add-to-storage button): a solid
  // `--color-success` fill (mint in light, deep green in dark) with its own
  // `--color-success-contrast` text, so the contrast gate covers it.
  // Hover darkens the fill by 8% — no new color token.
  tonal:
    "border border-transparent bg-[var(--color-success)] text-[var(--color-success-contrast)] hover:bg-[color-mix(in_srgb,var(--color-success),#000000_8%)]",
  ghost: "border border-transparent bg-transparent text-[var(--color-text)] hover:bg-[var(--color-bg-inset)]",
  danger: "border border-transparent bg-[var(--color-danger)] text-[var(--color-danger-contrast)] shadow-[var(--shadow-sm)]",
  // The delete question's commit (item 607): red text + border on the sheet's
  // own surface, a soft red tint on hover — pairs the contrast gate covers.
  "danger-quiet":
    "border border-[var(--color-danger)] bg-[var(--color-bg-elevated)] text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]",
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
