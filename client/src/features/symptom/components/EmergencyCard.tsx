import { ALARM_COLORS, type AlarmLevel } from "../alarmColors.js";

interface EmergencyCardProps {
  level: AlarmLevel;
  reasons: string[];
  steps: string[];
  disclaimer: string;
  onDismiss: () => void;
}

/**
 * Full-screen and modal on purpose. When the deterministic triage table fires
 * — or the model comes back at urgent_care or emergency — this is the only
 * thing on the screen: no ranked food list to read first, no form to scroll
 * past, and the dismiss control sits at the very bottom under everything the
 * parent needs to do.
 */
export function EmergencyCard({ level, reasons, steps, disclaimer, onDismiss }: EmergencyCardProps) {
  const emergency = level === "emergency";
  const palette = ALARM_COLORS[level];

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="symptom-alert-heading"
      className="scroll-momentum fixed inset-0 z-50 overflow-y-auto"
      style={{ backgroundColor: palette.background, color: palette.text }}
    >
      <div className="mx-auto flex min-h-full max-w-lg flex-col gap-5 p-5">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-widest opacity-90">
            {emergency ? "Emergency" : "Needs to be seen today"}
          </span>
          <h1 id="symptom-alert-heading" className="text-2xl font-bold leading-tight">
            {emergency
              ? "Call emergency services now"
              : "Get your baby seen today"}
          </h1>
        </div>

        {emergency && (
          <div className="flex gap-2">
            <a
              href="tel:999"
              className="flex-1 rounded-lg bg-white px-4 py-3 text-center text-base font-bold"
              style={{ color: palette.background }}
            >
              Call 999 (UK)
            </a>
            <a
              href="tel:911"
              className="flex-1 rounded-lg bg-white px-4 py-3 text-center text-base font-bold"
              style={{ color: palette.background }}
            >
              Call 911 (US)
            </a>
          </div>
        )}

        {reasons.length > 0 && (
          <section className="rounded-lg bg-black/20 p-4">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide opacity-90">Why</h2>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed">
              {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-lg bg-black/20 p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide opacity-90">
            {emergency ? "While you wait for help" : "What to do now"}
          </h2>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        <p className="text-xs leading-relaxed opacity-90">{disclaimer}</p>

        <button
          type="button"
          onClick={onDismiss}
          className="mt-auto min-h-11 rounded-lg border border-white/60 px-4 py-2 text-sm font-medium"
        >
          Close this and go back
        </button>
      </div>
    </div>
  );
}
