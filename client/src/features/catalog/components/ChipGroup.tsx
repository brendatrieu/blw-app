interface ChipOption<T extends string> {
  value: T;
  label: string;
}

interface ChipGroupProps<T extends string> {
  label: string;
  options: ChipOption<T>[];
  value: T | undefined;
  onChange: (value: T | undefined) => void;
}

/** Single-select chip row: clicking the active chip clears the filter. */
export function ChipGroup<T extends string>({ label, options, value, onChange }: ChipGroupProps<T>) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-[var(--color-text-muted)]">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(active ? undefined : option.value)}
              aria-pressed={active}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-contrast)]"
                  : "border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)]"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
