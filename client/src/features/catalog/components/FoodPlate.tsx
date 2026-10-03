import type { CSSProperties } from "react";
import type { EmojiCluster, PlateTint } from "../foodEmoji.js";

interface FoodPlateProps {
  emoji: string;
  tint: PlateTint;
  /** Diameter in px; the emoji is about half of it. */
  size: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * A food's emoji on a round disc tinted by food group (item 657). Purely
 * decorative: every caller renders the food's name as text beside it.
 */
export function FoodPlate({ emoji, tint, size, className = "", style }: FoodPlateProps) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full leading-none ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(14, size / 2),
        background: `var(--color-plate-${tint})`,
        ...style,
      }}
    >
      {emoji}
    </span>
  );
}

/** [size, left, top] per plate, by how many discs the 48x44 slot holds (A-Home mockup). */
const SPOTS: Record<number, readonly (readonly [number, number, number])[]> = {
  1: [[44, 2, 0]],
  // No mockup example for two; a diagonal of 30px plates fills the slot.
  2: [
    [30, 0, 0],
    [30, 18, 14],
  ],
  3: [
    [24, 12, 0],
    [24, 0, 20],
    [24, 24, 20],
  ],
};

/**
 * Several foods in one fixed 48x44 slot (item 658): 1 food = one 44px plate;
 * 2 = two plates on a diagonal; 3 = a pyramid; 4+ = the first two plus a
 * neutral "+N" plate in the third spot. Every plate after the first overlaps
 * one drawn before it, so it wears a 2px ring in the card's surface color. A
 * fixed slot keeps the names beside it aligned row to row.
 */
export function FoodPlates({ plates, overflow }: EmojiCluster) {
  const discs =
    overflow > 0 ? [...plates, { emoji: `+${overflow}`, tint: "neutral" as const }] : plates;
  const spots = SPOTS[discs.length] ?? [];
  return (
    <span aria-hidden="true" className="relative block h-[44px] w-[48px] shrink-0">
      {spots.map(([size, left, top], index) => {
        const isCount = overflow > 0 && index === discs.length - 1;
        return (
          <FoodPlate
            key={index}
            emoji={discs[index]!.emoji}
            tint={discs[index]!.tint}
            size={size}
            className={`absolute${index > 0 ? " ring-2 ring-[var(--color-bg-elevated)]" : ""}${isCount ? " font-extrabold tabular-nums text-[var(--color-text)]" : ""}`}
            style={{ left, top, ...(isCount && { fontSize: 12 }) }}
          />
        );
      })}
    </span>
  );
}
