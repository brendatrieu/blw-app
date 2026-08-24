import type { KeyboardEvent } from "react";
import { Button } from "../../../components/ui/Button.js";
import { Textarea } from "../../../components/ui/Input.js";

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  maxLength: number;
}

/**
 * Chat input row: an auto-sizing textarea plus a send button. Enter sends,
 * Shift+Enter inserts a newline. Extracted from ChatPage so the thread view
 * and its composer can be reasoned about (and restyled) independently.
 */
export function Composer({ value, onChange, onSubmit, disabled, maxLength }: ComposerProps) {
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="flex items-end gap-2 border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3"
    >
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        rows={1}
        placeholder="Ask a question…"
        aria-label="Message"
        className="flex-1"
      />
      <Button type="submit" disabled={disabled || value.trim().length === 0}>
        Send
      </Button>
    </form>
  );
}
