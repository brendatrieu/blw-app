import type { KeyboardEvent } from "react";
import { STAR_RATING_MAX, type RatingSummary } from "@blw/shared";

const STARS = Array.from({ length: STAR_RATING_MAX }, (_, index) => index + 1);

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]";

export interface StarRatingProps {
  /** 1-5, or null for "not rated" — there is no 0-star state. */
  value: number | null;
  onChange: (value: number | null) => void;
  /** Names the group for a screen reader, e.g. "Rating for Banana". */
  label: string;
  disabled?: boolean;
}

/**
 * Where an arrow / Home / End key moves the rating, or null for any other
 * key. Radio-group keyboard rules: arrows step one star and stop at the ends
 * (no wrap — wrapping 5 -> 1 would read as a slip), and from "not rated" the
 * first step lands on 1.
 */
export function starForKey(key: string, value: number | null): number | null {
  const current = value ?? 0;
  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
      return Math.min(STAR_RATING_MAX, current + 1);
    case "ArrowLeft":
    case "ArrowDown":
      return Math.max(1, current - 1);
    case "Home":
      return 1;
    case "End":
      return STAR_RATING_MAX;
    default:
      return null;
  }
}

/**
 * Item 574: five tappable stars. Tapping star N sets N (the right-most is 5,
 * the middle one 3); "Clear" puts it back to not rated. A `radiogroup` of
 * `radio` buttons like `SegmentedControl`, with the roving tabindex and arrow
 * keys that one lacks: Tab lands on the chosen star (or the first), arrows
 * move the choice and the focus together. Every target is 44px.
 */
export function StarRating({ value, onChange, label, disabled = false }: StarRatingProps) {
  const focusable = value ?? 1;

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const next = starForKey(event.key, value);
    if (next === null) return;
    event.preventDefault();
    onChange(next);
    const group = event.currentTarget.parentElement;
    (group?.children[next - 1] as HTMLElement | undefined)?.focus();
  }

  return (
    <div className="flex items-center gap-1">
      <div role="radiogroup" aria-label={label} className="flex">
        {STARS.map((star) => {
          const filled = value !== null && star <= value;
          return (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={value === star}
              aria-label={star === 1 ? "1 star" : `${star} stars`}
              tabIndex={star === focusable ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(star)}
              onKeyDown={handleKeyDown}
              className={`flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] text-2xl leading-none ${FOCUS_RING} ${
                filled ? "text-[var(--color-apricot-graphic)]" : "text-[var(--color-text-muted)]"
              }`}
            >
              <span aria-hidden="true">{filled ? "★" : "☆"}</span>
            </button>
          );
        })}
      </div>
      {value !== null && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(null)}
          aria-label={`Clear ${label.charAt(0).toLowerCase()}${label.slice(1)}`}
          className={`min-h-11 rounded-[var(--radius-sm)] px-2 text-sm font-medium text-[var(--color-text-muted)] underline hover:text-[var(--color-text)] ${FOCUS_RING}`}
        >
          Clear
        </button>
      )}
    </div>
  );
}

/** "4.2 (5)" — one decimal, whatever the average. The ★ is drawn beside it. */
export function formatRatingSummary(summary: RatingSummary): string {
  return `${summary.average.toFixed(1)} (${summary.count})`;
}

/**
 * Item 575: a card's rating line for the active baby, or nothing at all when
 * the baby has never rated it (never "★ 0").
 */
export function RatingSummaryText({ summary, className = "" }: { summary: RatingSummary | undefined; className?: string }) {
  if (!summary) return null;
  const ratings = summary.count === 1 ? "1 rating" : `${summary.count} ratings`;
  return (
    <span className={`text-xs text-[var(--color-text-muted)] ${className}`}>
      <span aria-hidden="true">
        {/* Item 640: the star wears the apricot identity graphic, the number stays muted. */}
        <span className="text-[var(--color-apricot-graphic)]">★</span>
        {` ${formatRatingSummary(summary)}`}
      </span>
      <span className="sr-only">{`Rated ${summary.average.toFixed(1)} out of ${STAR_RATING_MAX}, ${ratings}`}</span>
    </span>
  );
}
