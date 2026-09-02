import { Link } from "react-router-dom";
import { isAlarmLevel, resultTriageLevel, type SymptomResult } from "@blw/shared";
import { alarmStyle } from "../alarmColors.js";
import { CandidateList } from "./CandidateCard.js";
import { DisclaimerFootnote } from "./DisclaimerBanner.js";

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{title}</h3>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed text-[var(--color-text)]">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

/** Reopens the full-screen card, which is the whole point of an alarm result. */
function AlarmRecap({ result, onReopen }: { result: SymptomResult; onReopen: () => void }) {
  const emergency = resultTriageLevel(result) === "emergency";
  return (
    <div
      className="flex flex-col gap-2 rounded-lg p-4"
      style={alarmStyle(emergency ? "emergency" : "urgent_care")}
    >
      <p className="text-sm font-semibold">
        {emergency ? "This needs emergency help now." : "This needs a clinician today."}
      </p>
      <button
        type="button"
        onClick={onReopen}
        className="self-start rounded-lg border border-white/60 px-3 py-1.5 text-xs font-medium"
      >
        Show the instructions again
      </button>
    </div>
  );
}

interface SymptomResultViewProps {
  result: SymptomResult;
  onReopenAlarm: () => void;
}

export function SymptomResultView({ result, onReopenAlarm }: SymptomResultViewProps) {
  const alarm = isAlarmLevel(resultTriageLevel(result));

  if (result.kind === "triage") {
    return (
      <div className="flex flex-col gap-4">
        <AlarmRecap result={result} onReopen={onReopenAlarm} />
        <Section title="Why" items={result.reasons} />
        <Section title="What to do" items={result.whileWaiting} />
        <p className="text-xs text-[var(--color-text-muted)]">
          Because of what you reported, this was answered from a fixed safety checklist — no food history was analysed.
        </p>
        <DisclaimerFootnote text={result.disclaimer} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {alarm && <AlarmRecap result={result} onReopen={onReopenAlarm} />}

      {result.kind === "ai" && (
        <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--color-text)]">{result.narrative}</p>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Foods that fit the timing
        </h3>
        <CandidateList candidates={result.candidates} />
      </section>

      {result.kind === "fallback" && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3">
          <p className="text-sm text-[var(--color-text)]">
            {result.reason === "no_ai_key"
              ? "This list came from a fixed rule the app applies on its own: how new each food is, whether it is a top-9 allergen, and how well the timing fits."
              : "The AI analysis could not be completed this time, so this list came from the same fixed rule the app uses without a key."}
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            Adding your own Anthropic API key adds a written explanation on top of this list. The ranking above does not
            need one.
          </p>
          <Link to="/settings" className="self-start text-xs font-medium text-[var(--color-accent)] underline">
            {result.reason === "no_ai_key" ? "Add an API key in Settings" : "Check your API key in Settings"}
          </Link>
        </div>
      )}

      <Section title="What to do next" items={result.nextSteps} />
      <Section title="When to get help" items={result.whenToSeekHelp} />
      <DisclaimerFootnote text={result.disclaimer} />
    </div>
  );
}
