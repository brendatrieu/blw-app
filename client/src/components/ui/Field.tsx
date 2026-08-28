import type { ReactNode } from "react";

interface FieldProps {
  label: ReactNode;
  htmlFor: string;
  error?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}

/**
 * Splits a trailing "(optional)" (case-insensitive) off a string label so it
 * can be rendered de-emphasized next to the bold label text. Returns null
 * when the label has no such suffix (or isn't a plain string).
 */
export function splitOptionalLabel(label: ReactNode): { base: string; suffix: string } | null {
  if (typeof label !== "string") return null;
  const match = /^(.*\S)\s*(\(optional\))$/i.exec(label);
  return match ? { base: match[1]!, suffix: match[2]! } : null;
}

/**
 * Label + control + error/hint wrapper. Wraps whatever control is passed as
 * `children` (typically `Input` or `Select`, but any labeled control works)
 * so every hand-rolled form in the app shares one label/spacing/error
 * treatment instead of re-implementing it per page. A trailing "(optional)"
 * in a string label renders quiet — normal weight, muted color — so the
 * field name carries the visual emphasis, not the qualifier.
 */
export function Field({ label, htmlFor, error, hint, children }: FieldProps) {
  const optional = splitOptionalLabel(label);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-[var(--color-text)]">
        {optional ? (
          <>
            {optional.base}{" "}
            <span className="font-normal text-[var(--color-text-muted)]">{optional.suffix}</span>
          </>
        ) : (
          label
        )}
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
