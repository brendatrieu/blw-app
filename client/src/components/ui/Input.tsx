import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

const CONTROL_BASE =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition-colors duration-[var(--duration-fast)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-60";

/** Single-line text input matching the app's control styling (44px min height). */
export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`min-h-11 ${CONTROL_BASE} ${className}`} {...props} />;
}

/** Multi-line text input for longer free text (notes, chat composer). */
export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`min-h-[2.5rem] resize-none ${CONTROL_BASE} ${className}`} {...props} />;
}
