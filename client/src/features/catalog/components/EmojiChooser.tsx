import { useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent } from "react";
import { DEFAULT_FOOD_EMOJI, EMOJI_CHOICE_GROUPS } from "../foodEmoji.js";
import { Input } from "../../../components/ui/Input.js";

interface EmojiChooserProps {
  /** The box's id — the Field label's `htmlFor` and the submit-focus target. */
  id: string;
  /** The form value: what is typed, or "" for none (🍽️). */
  value: string;
  onChange: (emoji: string) => void;
}

/**
 * The custom-food emoji (ledgers 862, 872, 879): the box is a text field —
 * type or paste one emoji, or clear it for none, which shows 🍽️ as its
 * placeholder because that is what the food gets — and tapping or focusing
 * it opens the app's own grid inline (never floating, so no portal; it
 * pushes the form down). The form validates the value (`validateCustomFood`).
 * A pick or Escape closes the grid; so does focus moving on to another
 * control. Logic in `foodEmoji.ts`.
 */
export function EmojiChooser({ id, value, onChange }: EmojiChooserProps) {
  const [open, setOpen] = useState(false);
  // Set while focus is handed back to the box after a keyboard pick or
  // Escape, so that focus doesn't reopen the grid it just closed.
  const returning = useRef(false);
  const gridId = `${id}-choices`;
  const current = value.trim();

  function close(refocus: boolean) {
    setOpen(false);
    if (!refocus) return;
    returning.current = true;
    // By id: no ref plumbing through the Field wrapper.
    document.getElementById(id)?.focus();
    returning.current = false;
  }

  // A keyboard pick (a click with detail 0) gets focus back on the box; a
  // tap leaves it alone, so a phone's keyboard doesn't jump up after a pick.
  function choose(emoji: string, event: MouseEvent) {
    onChange(emoji);
    close(event.detail === 0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!open || event.key !== "Escape") return;
    // Claimed, so a surrounding Sheet's Escape (useModal skips a prevented
    // event) leaves the half-filled form open.
    event.preventDefault();
    close(true);
  }

  // Focus moving to a control outside the chooser closes the grid. A tap on
  // a grid button may blur the box with no relatedTarget (iOS doesn't focus
  // buttons), so that case keeps it open for the click to land.
  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget as Node | null;
    if (open && next && !event.currentTarget.contains(next)) setOpen(false);
  }

  return (
    <div onKeyDown={handleKeyDown} onBlur={handleBlur} className="flex flex-col gap-2">
      <Input
        id={id}
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        placeholder={DEFAULT_FOOD_EMOJI}
        aria-expanded={open}
        aria-controls={gridId}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => {
          if (!returning.current) setOpen(true);
        }}
        onClick={() => setOpen(true)}
        className="w-20! text-center text-3xl!"
      />
      {open ? (
        <div
          id={gridId}
          role="group"
          aria-label="Food emojis"
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
                    onClick={(event) => choose(choice.emoji, event)}
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
