import type { ReactNode } from "react";

export interface SegmentedControlOption<Value extends string> {
  value: Value;
  label: string;
  icon: ReactNode;
}

interface SegmentedControlProps<Value extends string> {
  options: Array<SegmentedControlOption<Value>>;
  value: Value;
  onChange: (value: Value) => void;
  "aria-label": string;
}

/**
 * A chunky, rounded-segment picker for a small closed set of mutually
 * exclusive options (e.g. appearance mode). Renders as a `radiogroup` of
 * `radio` buttons rather than native radio inputs, so it can be styled as
 * one pill-shaped track with a solid coral fill on the selected segment.
 */
export function SegmentedControl<Value extends string>({
  options,
  value,
  onChange,
  ...rest
}: SegmentedControlProps<Value>) {
  const ariaLabel = rest["aria-label"];

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex gap-1 rounded-[var(--radius-pill)] bg-[var(--color-bg-inset)] p-1"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => {
              onChange(option.value);
            }}
            className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-pill)] px-3 py-2 text-sm font-medium transition-colors duration-[var(--duration-fast)] ${
              selected
                ? "bg-[var(--color-primary)] text-[var(--color-primary-contrast)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
