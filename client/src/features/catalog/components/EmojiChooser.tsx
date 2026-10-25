import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent } from "react";
import { DEFAULT_FOOD_EMOJI, EMOJI_CHOICE_GROUPS } from "../foodEmoji.js";
import { Input } from "../../../components/ui/Input.js";
import { SmileyGlyph } from "../../../components/ui/iconButton.js";

interface EmojiChooserProps {
  /** The box's id — the Field label's `htmlFor` and the submit-focus target. */
  id: string;
  /** The form value: what is typed, or "" for none (🍽️). */
  value: string;
  onChange: (emoji: string) => void;
}

/**
 * The custom-food emoji (ledgers 862, 872, 879, 893, 894): the box is a
 * plain text field — type or paste one emoji, or clear it for none, which
 * shows 🍽️ as its placeholder because that is what the food gets — and the
 * emoji button beside it (an outline smiley icon, like a phone keyboard's
 * emoji key) opens and closes the app's own grid inline (never floating, so
 * no portal; it pushes the form down). The form validates the value
 * (`validateCustomFood`). A pick or Escape closes the grid and puts focus back
 * on the button; so does focus moving on to another control, and a tap or
 * click anywhere outside the chooser (ledger 888: phones have no Escape, and a
 * tap on plain text moves focus nowhere). Tapping or focusing the box closes
 * it too (ledger 893): the box is for typing, so the phone keyboard and the
 * grid never share the screen, and a failed Save's focus leaves the error line
 * right under the box. Logic in `foodEmoji.ts`.
 */
export function EmojiChooser({ id, value, onChange }: EmojiChooserProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const gridId = `${id}-choices`;
  const buttonId = `${id}-button`;
  const current = value.trim();

  function close() {
    setOpen(false);
    // By id: no ref plumbing. A button takes focus without a phone keyboard.
    document.getElementById(buttonId)?.focus();
  }

  function choose(emoji: string) {
    onChange(emoji);
    close();
  }

  function toggle(event: MouseEvent<HTMLButtonElement>) {
    // iOS doesn't focus a tapped button: focusing it moves focus off the box,
    // so its keyboard goes down while the grid is up.
    event.currentTarget.focus();
    setOpen(!open);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!open || event.key !== "Escape") return;
    // Claimed, so a surrounding Sheet's Escape (useModal skips a prevented
    // event) leaves the half-filled form open.
    event.preventDefault();
    close();
  }

  // Focus moving to a control outside the chooser closes the grid. A tap on
  // a grid button may blur with no relatedTarget (iOS doesn't focus
  // buttons), so that case keeps it open for the click to land.
  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget as Node | null;
    if (open && next && !event.currentTarget.contains(next)) setOpen(false);
  }

  // pointerup, not pointerdown: a touch that turns into a scroll ends in
  // pointercancel, so scrolling the form keeps the grid; and a touch pointer's
  // target stays where it went down, so a press that starts in the grid counts
  // as inside. Not prevented or stopped: inside a Sheet the same tap is still
  // the sheet's, which closes only on its backdrop.
  useEffect(() => {
    if (!open) return;
    function handlePointerUp(event: PointerEvent) {
      // The wrapper itself is form-wide (the row is narrow): a tap on its own
      // empty strip beside the row, or the gap above the grid, is outside.
      const target = event.target as Node;
      if (target === root.current || !root.current?.contains(target)) setOpen(false);
    }
    document.addEventListener("pointerup", handlePointerUp);
    return () => document.removeEventListener("pointerup", handlePointerUp);
  }, [open]);

  return (
    <div ref={root} onKeyDown={handleKeyDown} onBlur={handleBlur} className="flex flex-col gap-2">
      <div className="flex items-center gap-2 self-start">
        <Input
          id={id}
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          placeholder={DEFAULT_FOOD_EMOJI}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setOpen(false)}
          onClick={() => setOpen(false)}
          className="w-20! text-center text-3xl!"
        />
        <button
          id={buttonId}
          type="button"
          aria-label="Emoji choices"
          aria-expanded={open}
          aria-controls={gridId}
          onClick={toggle}
          // An icon button, not a second tile (ledger 894): no border or fill,
          // the header gear's icon colour, a soft tint on hover/press, and
          // while open a primary-soft circle with the icon in accent.
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--color-icon)] transition-colors duration-[var(--duration-fast)] hover:not-aria-expanded:bg-[var(--color-bg-inset)] active:not-aria-expanded:bg-[var(--color-bg-inset)] aria-expanded:bg-[var(--color-primary-soft)] aria-expanded:text-[var(--color-accent)] motion-reduce:transition-none"
        >
          <SmileyGlyph />
        </button>
      </div>
      {open ? (
        <div
          id={gridId}
          role="group"
          aria-label="Food emojis"
          // Focusable by script only: a tap on a label or gap in the grid
          // focuses it, not the Sheet's panel outside the chooser (which
          // the blur check would read as leaving).
          tabIndex={-1}
          className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-2"
        >
          {EMOJI_CHOICE_GROUPS.map((group) => (
            <div key={group.label} className="flex flex-col gap-1">
              <span className="px-1 text-xs font-medium text-[var(--color-text-muted)]">{group.label}</span>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))]">
                {group.choices.map((choice) => (
                  <button
                    key={choice.emoji}
                    type="button"
                    aria-label={`Pick ${choice.emoji} ${choice.label}`}
                    aria-pressed={choice.emoji === current}
                    onClick={() => choose(choice.emoji)}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-md)] text-2xl hover:bg-[var(--color-bg-inset)] aria-pressed:bg-[var(--color-bg-inset)]"
                  >
                    {choice.emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
