import { useState, type KeyboardEvent } from "react";
import { EMOJI_CHOICE_GROUPS } from "../foodEmoji.js";
import { Button } from "../../../components/ui/Button.js";

interface EmojiChooserProps {
  /** Distinguishes the grid's id from any other chooser on the page. */
  id: string;
  onPick: (emoji: string) => void;
}

/**
 * "Choose an emoji" (ledger 862): desktop keyboards have no emoji key, so the
 * custom-food form offers a small grid of food emojis — on every device, one
 * control everywhere. Inline and expanding, never floating, so it needs no
 * portal and pushes the rest of the form down rather than covering it.
 * Typing or pasting into the field beside it still works; picking just fills
 * it. Escape or a pick closes the grid and hands focus back to the toggle.
 */
export function EmojiChooser({ id, onPick }: EmojiChooserProps) {
  const [open, setOpen] = useState(false);
  const toggleId = `${id}-toggle`;

  function close() {
    setOpen(false);
    // By id: `Button` doesn't forward refs (React 18).
    document.getElementById(toggleId)?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    // Claimed, so a surrounding Sheet's Escape (useModal skips a prevented
    // event) leaves the half-filled form open.
    event.preventDefault();
    close();
  }

  return (
    <>
      <Button
        id={toggleId}
        type="button"
        variant="secondary"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((current) => !current)}
      >
        Choose an emoji
      </Button>
      {open ? (
        <div
          id={id}
          role="group"
          aria-label="Food emojis"
          onKeyDown={handleKeyDown}
          className="flex basis-full flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-2"
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
                    onClick={() => {
                      onPick(choice.emoji);
                      close();
                    }}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-md)] text-2xl hover:bg-[var(--color-bg-inset)]"
                  >
                    {choice.emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
