import { useRef, type InputHTMLAttributes, type MouseEvent, type RefObject } from "react";
import { Input } from "./Input.js";
import { CloseGlyph } from "./iconButton.js";

interface ClearSearchButtonProps {
  /** The search text: the button is there only while it is not empty. */
  value: string;
  onClear: () => void;
  /** The field it clears, which keeps focus so a phone keyboard stays up. */
  inputRef: RefObject<HTMLInputElement | null>;
  className?: string;
}

/** Keeps focus on the field: a press on the × never moves it to the button. */
const keepFocus = (event: MouseEvent) => event.preventDefault();

/** Ledger 1016: hover and keyboard focus only change the glyph's colour
 * (muted -> text): no hover box, no size change; the global focus ring still
 * marks keyboard focus. 44px like ICON_BUTTON_CLASSES. */
const CLEAR_CLASSES =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-muted)] transition-colors duration-[var(--duration-fast)] hover:text-[var(--color-text)] focus-visible:text-[var(--color-text)]";

/**
 * The one "Clear search" × (ledger 999), at the right edge of every search
 * field: `SearchInput` (Add more, Foods, Recipes) and `MultiCombobox` (every
 * food/recipe picker). Shown only while there is text. The press never takes
 * focus (pointer/mouse down prevented), and the click puts it back on the
 * field synchronously anyway (a keyboard press, or a browser that moved it),
 * so a phone keyboard stays up. The native WebKit × is hidden in index.css.
 */
export function ClearSearchButton({ value, onClear, inputRef, className = "" }: ClearSearchButtonProps) {
  if (value === "") return null;
  return (
    <button
      type="button"
      aria-label="Clear search"
      onPointerDown={keepFocus}
      onMouseDown={keepFocus}
      onClick={() => {
        onClear();
        inputRef.current?.focus();
      }}
      className={`${CLEAR_CLASSES} ${className}`}
    >
      <CloseGlyph />
    </button>
  );
}

type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value"> & {
  value: string;
  onClear: () => void;
};

/**
 * A `type="search"` `Input` with the clear × inside its right edge.
 * `className` goes on the wrapper (the field's place in its layout); while
 * the × shows, the input's right padding is the button's 44px, so text never
 * runs under it.
 */
export function SearchInput({ value, onClear, className = "", ...props }: SearchInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className={`relative ${className}`}>
      <Input ref={ref} type="search" value={value} className={value === "" ? "" : "pr-11"} {...props} />
      <ClearSearchButton value={value} onClear={onClear} inputRef={ref} className="absolute inset-y-0 right-0 my-auto" />
    </div>
  );
}
