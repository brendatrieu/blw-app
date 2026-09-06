interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Accessible name; the visible label usually lives beside the control. */
  "aria-label"?: string;
  id?: string;
}

/**
 * iOS-style on/off switch (a styled `role="switch"` button — no native
 * element exists). Track fills with the primary peach when on; the thumb
 * slides right. The 44px tap target comes from padding around the 28×16
 * visual, same negative-margin idiom the chip remove buttons use.
 */
export function Switch({ checked, onChange, disabled, id, "aria-label": ariaLabel }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="-m-[10px] shrink-0 p-[10px] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span
        aria-hidden="true"
        className={`flex h-5 w-9 items-center rounded-[var(--radius-pill)] px-0.5 transition-colors duration-[var(--duration-fast)] ${
          checked ? "justify-end bg-[var(--color-primary)]" : "justify-start bg-[var(--color-bg-inset)]"
        }`}
      >
        <span className="h-4 w-4 rounded-full bg-[var(--color-bg-elevated)] shadow-[var(--shadow-sm)]" />
      </span>
    </button>
  );
}
