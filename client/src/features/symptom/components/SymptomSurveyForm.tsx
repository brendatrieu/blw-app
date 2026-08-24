import { useMemo, useState } from "react";
import { alarmStyle } from "../alarmColors.js";
import {
  BODY_AREA_LABELS,
  MEAL_TIMING_LABELS,
  SEVERITY_LABELS,
  SYMPTOM_CATALOG,
  SYMPTOM_GROUP_LABELS,
  bodyAreaSchema,
  mealTimingSchema,
  severitySchema,
  symptomGroupSchema,
  type BodyArea,
  type MealTiming,
  type Severity,
  type Symptom,
  type SymptomCheckRequest,
} from "@blw/shared";

/** `<input type="datetime-local">` wants local wall-clock time, no offset. */
function nowForDateTimeLocal(): string {
  const now = new Date();
  now.setSeconds(0, 0);
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

const inputClass =
  "rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm text-[var(--color-text)]";

interface SymptomSurveyFormProps {
  onSubmit: (survey: SymptomCheckRequest["survey"]) => void;
  isPending: boolean;
  errorMessage: string | null;
}

export function SymptomSurveyForm({ onSubmit, isPending, errorMessage }: SymptomSurveyFormProps) {
  const [symptoms, setSymptoms] = useState<Set<Symptom>>(new Set());
  const [severity, setSeverity] = useState<Severity>("mild");
  const [onsetAt, setOnsetAt] = useState(() => nowForDateTimeLocal());
  const [mealTiming, setMealTiming] = useState<MealTiming>("unknown");
  const [bodyAreas, setBodyAreas] = useState<Set<BodyArea>>(new Set());
  const [notes, setNotes] = useState("");

  // Grouped by body system so a parent scans the part of the body they are
  // looking at rather than a flat list of twenty checkboxes.
  const groups = useMemo(
    () =>
      symptomGroupSchema.options.map((group) => ({
        group,
        entries: SYMPTOM_CATALOG.filter((entry) => entry.group === group),
      })),
    [],
  );

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (symptoms.size === 0) return;
    onSubmit({
      symptoms: [...symptoms],
      severity,
      onsetAt: new Date(onsetAt).toISOString(),
      mealTiming,
      bodyAreas: [...bodyAreas],
      notes: notes.trim() || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-4">
        <legend className="text-sm font-semibold text-[var(--color-text)]">What are you seeing?</legend>
        {groups.map(({ group, entries }) => (
          <div key={group} className="flex flex-col gap-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              {SYMPTOM_GROUP_LABELS[group]}
            </h3>
            <div className="flex flex-col gap-1">
              {entries.map((entry) => (
                <label
                  key={entry.value}
                  className="flex items-center gap-2 rounded-lg bg-[var(--color-bg-elevated)] px-3 py-2 text-sm text-[var(--color-text)]"
                >
                  <input
                    type="checkbox"
                    checked={symptoms.has(entry.value)}
                    onChange={() => setSymptoms((current) => toggle(current, entry.value))}
                  />
                  <span className="flex-1">{entry.label}</span>
                  {entry.soloTriage && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                      style={alarmStyle(entry.soloTriage)}
                    >
                      {entry.soloTriage === "emergency" ? "999" : "Today"}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>
        ))}
      </fieldset>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--color-text-muted)]">How bad is it?</span>
        <select
          value={severity}
          onChange={(event) => setSeverity(event.target.value as Severity)}
          className={inputClass}
        >
          {severitySchema.options.map((option) => (
            <option key={option} value={option}>
              {SEVERITY_LABELS[option]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--color-text-muted)]">When did it start?</span>
        <input
          type="datetime-local"
          value={onsetAt}
          max={nowForDateTimeLocal()}
          onChange={(event) => setOnsetAt(event.target.value)}
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--color-text-muted)]">
          How long after the last meal did it start?
        </span>
        <select
          value={mealTiming}
          onChange={(event) => setMealTiming(event.target.value as MealTiming)}
          className={inputClass}
        >
          {mealTimingSchema.options.map((option) => (
            <option key={option} value={option}>
              {MEAL_TIMING_LABELS[option]}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-xs font-medium text-[var(--color-text-muted)]">Where on the body? (optional)</legend>
        <div className="flex flex-wrap gap-1.5">
          {bodyAreaSchema.options.map((area) => {
            const selected = bodyAreas.has(area);
            return (
              <button
                key={area}
                type="button"
                aria-pressed={selected}
                onClick={() => setBodyAreas((current) => toggle(current, area))}
                className="rounded-full border px-3 py-1 text-xs"
                style={{
                  borderColor: selected ? "var(--color-primary)" : "var(--color-border)",
                  backgroundColor: selected ? "var(--color-primary)" : "transparent",
                  color: selected ? "var(--color-primary-contrast)" : "var(--color-text)",
                }}
              >
                {BODY_AREA_LABELS[area]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--color-text-muted)]">
          Anything else you noticed? (optional)
        </span>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value.slice(0, 1000))}
          rows={3}
          maxLength={1000}
          placeholder="e.g. it started while she was still in the high chair and faded after an hour"
          className={inputClass}
        />
        <span className="self-end text-[11px] text-[var(--color-text-muted)]">{notes.length}/1000</span>
      </label>

      {errorMessage && <p className="text-sm text-[var(--color-danger)]">{errorMessage}</p>}

      <button
        type="submit"
        disabled={symptoms.size === 0 || isPending}
        className="rounded-lg bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-[var(--color-primary-contrast)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Checking…" : "Check the last 7 days"}
      </button>
    </form>
  );
}
