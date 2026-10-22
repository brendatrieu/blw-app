import { useState, type KeyboardEvent } from "react";
import type { FoodCategory } from "@blw/shared";
import { EMOJI_CHOICE_GROUPS, emojiBox, readTypedEmoji } from "../foodEmoji.js";
import { Button } from "../../../components/ui/Button.js";
import { Input } from "../../../components/ui/Input.js";

interface EmojiChooserProps {
  /** The box's id — the Field label's `htmlFor` and the submit-focus target. */
  id: string;
  /** The form value: one emoji, or "" for none (plain plate). */
  value: string;
  category: FoodCategory;
  onChange: (emoji: string) => void;
}

/**
 * The custom-food emoji (ledgers 862, 872): the box IS the control. It shows
 * the chosen emoji — or, muted, the category emoji a food with none gets —
 * and tapping it opens the app's own grid inline (never floating, so no
 * portal; it pushes the form down). The grid also takes any typed or pasted
 * emoji and, when one is set, a way back to none. A pick, Use, No emoji or
 * Escape closes it and hands focus back to the box. Logic in `foodEmoji.ts`.
 */
export function EmojiChooser({ id, value, category, onChange }: EmojiChooserProps) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [typedError, setTypedError] = useState<string | null>(null);
  const box = emojiBox(value, category);
  const gridId = `${id}-choices`;
  const typedId = `${id}-typed`;

  function close() {
    setOpen(false);
    setTyped("");
    setTypedError(null);
    // By id: no ref plumbing through the Field wrapper.
    document.getElementById(id)?.focus();
  }

  function choose(emoji: string) {
    onChange(emoji);
    close();
  }

  function commitTyped() {
    const result = readTypedEmoji(typed);
    if (!result) return;
    if ("error" in result) setTypedError(result.error);
    else choose(result.emoji);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!open || event.key !== "Escape") return;
    // Claimed, so a surrounding Sheet's Escape (useModal skips a prevented
    // event) leaves the half-filled form open.
    event.preventDefault();
    close();
  }

  return (
    <div onKeyDown={handleKeyDown} className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <button
          id={id}
          type="button"
          aria-label={box.label}
          aria-expanded={open}
          aria-controls={gridId}
          onClick={() => (open ? close() : setOpen(true))}
          className={`flex min-h-12 min-w-16 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] text-3xl ${
            box.chosen ? "border border-[var(--color-border)]" : "border border-dashed border-[var(--color-border)]"
          }`}
        >
          <span aria-hidden="true" className={box.chosen ? "" : "opacity-40 grayscale"}>
            {box.emoji}
          </span>
        </button>
        {box.chosen ? null : <span className="text-xs text-[var(--color-text-muted)]">No emoji chosen</span>}
      </div>
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
                    aria-pressed={box.chosen && choice.emoji === box.emoji}
                    onClick={() => choose(choice.emoji)}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-md)] text-2xl hover:bg-[var(--color-bg-inset)] aria-pressed:bg-[var(--color-bg-inset)]"
                  >
                    {choice.emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="flex flex-col gap-1 px-1">
            <label htmlFor={typedId} className="text-xs font-medium text-[var(--color-text-muted)]">
              Or type one
            </label>
            <div className="flex items-center gap-2">
              <Input
                id={typedId}
                type="text"
                inputMode="text"
                autoComplete="off"
                value={typed}
                aria-invalid={typedError ? true : undefined}
                aria-describedby={typedError ? `${typedId}-error` : undefined}
                onChange={(e) => {
                  setTyped(e.target.value);
                  setTypedError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  // Enter would otherwise submit the whole food form.
                  e.preventDefault();
                  commitTyped();
                }}
                placeholder="🍽️"
                className="w-20! text-center text-xl"
              />
              <Button type="button" variant="secondary" onClick={commitTyped}>
                Use
              </Button>
            </div>
            {typedError ? (
              <p id={`${typedId}-error`} role="alert" className="text-xs font-medium text-[var(--color-danger)]">
                {typedError}
              </p>
            ) : null}
          </div>
          {box.chosen ? (
            <Button type="button" variant="ghost" onClick={() => choose("")} className="self-start">
              No emoji
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
