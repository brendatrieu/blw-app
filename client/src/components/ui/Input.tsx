import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

const CONTROL_BASE =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2 text-base text-[var(--color-text)] outline-none transition-colors duration-[var(--duration-fast)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60";

/** Single-line text input matching the app's control styling (44px min height). */
export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`min-h-11 ${CONTROL_BASE} ${className}`} {...props} />;
}

/**
 * Multi-line text input for longer free text (notes, chat composer).
 *
 * `forwardRef` is not decoration: the auto-growing fields (item 300) measure
 * and set the height of the real element, which means they need a ref to it.
 * A plain function component would swallow a `ref` prop — React 18 warns and
 * attaches nothing — so autosize would silently do nothing at all.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = "", ...props }, ref) {
    return <textarea ref={ref} className={`min-h-[2.5rem] resize-none ${CONTROL_BASE} ${className}`} {...props} />;
  },
);
