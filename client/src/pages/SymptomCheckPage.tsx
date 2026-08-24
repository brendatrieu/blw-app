import { useState } from "react";
import {
  isAlarmLevel,
  resultTriageLevel,
  type SymptomCheckRequest,
  type SymptomCheckResponse,
  type TriageLevel,
} from "@blw/shared";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { useRunSymptomCheck, useSymptomChecks } from "../features/symptom/hooks.js";
import { DisclaimerBanner } from "../features/symptom/components/DisclaimerBanner.js";
import { EmergencyCard } from "../features/symptom/components/EmergencyCard.js";
import { SymptomHistoryList } from "../features/symptom/components/SymptomHistoryList.js";
import { SymptomResultView } from "../features/symptom/components/SymptomResultView.js";
import { SymptomSurveyForm } from "../features/symptom/components/SymptomSurveyForm.js";
import { ApiError } from "../lib/api.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { Button, ButtonLink } from "../components/ui/Button.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import { Skeleton } from "../components/ui/Skeleton.js";

/** Server error codes turned into something a parent can act on. */
function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return "You have used this hour's symptom checks. The triage safety check still works — try again shortly.";
    }
    if (error.status === 400) {
      return "Something in the form could not be read. Check the symptoms and the time it started.";
    }
    if (error.status === 404) {
      return "That baby profile could not be found. Pick a baby again from the header.";
    }
  }
  return "The check could not be completed. Please try again.";
}

/** The alarm overlay needs the reasons and steps out of whichever result kind produced it. */
function alarmContent(response: SymptomCheckResponse): { reasons: string[]; steps: string[] } {
  const { result } = response;
  if (result.kind === "triage") return { reasons: result.reasons, steps: result.whileWaiting };
  if (result.kind === "ai") return { reasons: [result.narrative], steps: result.whenToSeekHelp };
  return { reasons: [], steps: result.whenToSeekHelp };
}

export function SymptomCheckPage() {
  const { activeBaby, isLoading: babyLoading } = useActiveBaby();
  const babyId = activeBaby?.id;

  const runCheck = useRunSymptomCheck(babyId);
  const history = useSymptomChecks(babyId);

  const [response, setResponse] = useState<SymptomCheckResponse | null>(null);
  const [alarmOpen, setAlarmOpen] = useState(false);

  function handleSubmit(survey: SymptomCheckRequest["survey"]) {
    setResponse(null);
    setAlarmOpen(false);
    runCheck.mutate(survey, {
      onSuccess: (result) => {
        setResponse(result);
        // The full-screen card opens itself. A parent who has just reported
        // trouble breathing must not have to find a button.
        setAlarmOpen(isAlarmLevel(resultTriageLevel(result.result)));
      },
    });
  }

  if (babyLoading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  if (!activeBaby) {
    return (
      <div className="p-4">
        <EmptyState
          title="No baby profile yet"
          description="Add a baby profile first — the check reads that baby's food log for the last seven days."
          action={<ButtonLink to="/settings">Add a baby</ButtonLink>}
        />
      </div>
    );
  }

  const alarmLevel: TriageLevel | null = response ? resultTriageLevel(response.result) : null;

  return (
    <div className="flex flex-col gap-6 p-4">
      <DisclaimerBanner />

      {alarmOpen && response && alarmLevel && isAlarmLevel(alarmLevel) && (
        <EmergencyCard
          level={alarmLevel === "emergency" ? "emergency" : "urgent_care"}
          reasons={alarmContent(response).reasons}
          steps={alarmContent(response).steps}
          disclaimer={response.result.disclaimer}
          onDismiss={() => setAlarmOpen(false)}
        />
      )}

      <PageHeader
        title={`Symptom check — ${activeBaby.name}`}
        description={`Tell us what you are seeing and we will line it up against everything ${activeBaby.name} has eaten in the last seven days.`}
      />

      {!response && !runCheck.isPending && (
        <SymptomSurveyForm
          onSubmit={handleSubmit}
          isPending={runCheck.isPending}
          errorMessage={runCheck.isError ? errorMessage(runCheck.error) : null}
        />
      )}

      {runCheck.isPending && (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4"
        >
          <p className="text-sm font-medium text-[var(--color-text)]">Reviewing the last 7 days of foods…</p>
          <p className="text-xs text-[var(--color-text-muted)]">
            Checking the safety list first, then ranking every food by how new it is, whether it is a top-9 allergen,
            and how the timing fits.
          </p>
        </div>
      )}

      {response && (
        <section className="flex flex-col gap-4">
          <SymptomResultView result={response.result} onReopenAlarm={() => setAlarmOpen(true)} />
          <Button
            type="button"
            variant="secondary"
            className="self-start"
            onClick={() => {
              setResponse(null);
              setAlarmOpen(false);
              runCheck.reset();
            }}
          >
            Start another check
          </Button>
        </section>
      )}

      <section className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-4">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Previous checks</h2>
        {history.isLoading && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
        {history.isError && <p className="text-sm text-[var(--color-danger)]">Couldn't load past checks.</p>}
        {history.data && <SymptomHistoryList items={history.data.items} />}
      </section>
    </div>
  );
}
