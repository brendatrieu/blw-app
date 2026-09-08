import { useMemo, useState } from "react";
import { TriageBadge, TriageLegend } from "./TriageBadge.js";
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
import { DateTimeField, nowAtMinute } from "../../../components/ui/DateTimeField.js";
import { useSubmitValidation, type FormErrors } from "../../../lib/forms.js";

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

const inputClass =
  "rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-base text-[var(--color-text)]";

export type SymptomSurveyField = "symptoms";
export type SymptomSurveyErrors = FormErrors<SymptomSurveyField>;

/** Visual field order — what a failed submit focuses first (item 235). */
export const SYMPTOM_SURVEY_FIELD_ORDER: readonly SymptomSurveyField[] = ["symptoms"];

/** The id of one symptom checkbox — also what a failed submit focuses. */
export function symptomCheckboxId(symptom: Symptom): string {
  return `symptom-${symptom}`;
}

/**
 * The survey's required-field rules (item 235). Only the symptom list is
 * required: severity and meal timing are selects with a default, onset is
 * seeded with the current minute, and body areas and notes are optional.
 *
 * Takes the symptoms as an array rather than the component's `Set` so it
 * stays pure and trivially unit-testable. An empty object means valid.
 */
export function validateSymptomSurvey(values: { symptoms: Symptom[] }): SymptomSurveyErrors {
  const errors: SymptomSurveyErrors = {};
  if (values.symptoms.length === 0) errors.symptoms = "Add at least one symptom";
  return errors;
}

interface SymptomSurveyFormProps {
  onSubmit: (survey: SymptomCheckRequest["survey"]) => void;
  isPending: boolean;
  errorMessage: string | null;
}

export function SymptomSurveyForm({ onSubmit, isPending, errorMessage }: SymptomSurveyFormProps) {
  const [symptoms, setSymptoms] = useState<Set<Symptom>>(new Set());
  const [severity, setSeverity] = useState<Severity>("mild");
  const [onsetAt, setOnsetAt] = useState(() => nowAtMinute());
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

  // Item 235: the submit stays enabled, "Add at least one symptom" shows
  // beneath the checkbox list, and a failed submit focuses the first box.
  const selectedSymptoms = [...symptoms];
  const { errors: shownErrors, attemptSubmit } = useSubmitValidation(
    { symptoms: selectedSymptoms },
    validateSymptomSurvey,
    SYMPTOM_SURVEY_FIELD_ORDER,
    { symptoms: symptomCheckboxId(SYMPTOM_CATALOG[0]!.value) },
  );

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isPending) return;
    if (!attemptSubmit()) return;
    onSubmit({
      symptoms: selectedSymptoms,
      severity,
      onsetAt: onsetAt.toISOString(),
      mealTiming,
      bodyAreas: [...bodyAreas],
      notes: notes.trim() || null,
    });
  }

  return (
    // `noValidate`: this survey answers its own required list inline, and its
    // checkboxes carry no native constraint to fall back on anyway (item 236).
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {/* Pulled up to sit closer to the page header (half the page gap) and
          pushed down so the questionnaire reads as a distinct block. */}
      <div className="-mt-3 mb-3">
        <TriageLegend />
      </div>
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
                    id={symptomCheckboxId(entry.value)}
                    type="checkbox"
                    checked={symptoms.has(entry.value)}
                    onChange={() => setSymptoms((current) => toggle(current, entry.value))}
                  />
                  <span className="flex-1">{entry.label}</span>
                  {entry.soloTriage && <TriageBadge level={entry.soloTriage} />}
                </label>
              ))}
            </div>
          </div>
        ))}
        {/* Beneath the list, per the list-error half of item 235. */}
        {shownErrors.symptoms ? (
          <p role="alert" className="text-xs font-medium text-[var(--color-danger)]">
            {shownErrors.symptoms}
          </p>
        ) : null}
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
        {/* The server rejects an onset more than 14 days back — don't offer
            wheel rows that can only produce a 400. */}
        <DateTimeField value={onsetAt} onChange={setOnsetAt} daysBack={14} />
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
                className={`rounded-full border px-3 py-1 text-xs ${
                  selected
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-contrast)]"
                    : "border-[var(--color-border)] bg-transparent text-[var(--color-text)]"
                }`}
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

      {/* The server's own failure, not a required-field message. */}
      {errorMessage && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {errorMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-[var(--color-primary-contrast)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Checking…" : "Check the last 7 days"}
      </button>
    </form>
  );
}
