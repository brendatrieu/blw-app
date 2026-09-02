import type { ElementType, HTMLAttributes } from "react";
import { Link, type LinkProps } from "react-router-dom";

type CardPadding = "none" | "sm" | "md";

const PADDING_CLASSES: Record<CardPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
};

const BASE = "rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-sm)]";
// No hover border/shadow: whole-card hover reads as a special state nothing
// else in the app has. The press-down scale stays — it is touch feedback,
// not a hover affordance.
const INTERACTIVE =
  "transition-transform duration-[var(--duration-fast)] ease-[var(--ease-spring)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100";

interface CardProps extends HTMLAttributes<HTMLElement> {
  padding?: CardPadding;
  /** Render as a different element — e.g. `"li"` inside a `<ul>`. Defaults to `"div"`. */
  as?: ElementType;
}

/** Static content surface — the base unit for list rows, sections, and panels. */
export function Card({ padding = "md", as: Tag = "div", className = "", ...props }: CardProps) {
  return <Tag className={`${BASE} ${PADDING_CLASSES[padding]} ${className}`} {...props} />;
}

interface CardLinkProps extends LinkProps {
  padding?: CardPadding;
}

/** Same surface as `Card`, but a navigable `Link` with a hover/active affordance. */
export function CardLink({ padding = "md", className = "", ...props }: CardLinkProps) {
  return <Link className={`${BASE} ${INTERACTIVE} ${PADDING_CLASSES[padding]} ${className}`} {...props} />;
}
