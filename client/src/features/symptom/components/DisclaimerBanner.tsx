/**
 * The one piece of copy that must never be scrolled off the screen: the
 * feature spots timing coincidences, and a tired parent reading a ranked
 * list of foods at 2am should not have to remember that on their own.
 */
export function DisclaimerBanner() {
  return (
    <div
      role="note"
      className="sticky top-0 z-20 -mx-4 -mt-4 mb-1 border-b border-[var(--color-callout-border)] bg-[var(--color-callout-bg)] px-4 py-2 text-xs font-medium text-[var(--color-callout-icon)]"
    >
      Not medical advice — pattern-spotting only. It cannot diagnose an allergy.
    </div>
  );
}

/** The longer wording, repeated at the foot of every result. */
export function DisclaimerFootnote({ text }: { text: string }) {
  return <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">{text}</p>;
}
