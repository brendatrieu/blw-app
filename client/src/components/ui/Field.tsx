import type { ReactNode } from "react";

interface FieldProps {
  label: ReactNode;
  htmlFor: string;
  error?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}

/**
 * Label + control + error/hint wrapper. Wraps whatever control is passed as
 * `children` (typically `Input` or `Select`, but any labeled control works)
 * so every hand-rolled form in the app shares one label/spacing/error
 * treatment instead of re-implementing it per page.
 */
export function Field({ label, htmlFor, error, hint, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-[var(--color-text)]">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs font-medium text-[var(--color-danger)]">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-[var(--color-text-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}
