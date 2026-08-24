import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SymptomCheckRequest } from "@blw/shared";
import { fetchSymptomChecks, runSymptomCheck } from "./api.js";

export const symptomKeys = {
  history: (babyId: string) => ["symptom-checks", babyId] as const,
};

export function useSymptomChecks(babyId: string | undefined) {
  return useQuery({
    queryKey: symptomKeys.history(babyId ?? "none"),
    queryFn: () => fetchSymptomChecks(babyId!),
    enabled: Boolean(babyId),
  });
}

/**
 * Deliberately not optimistic and not retried. The answer is produced
 * server-side — including the triage decision — so there is nothing sensible
 * to render before it arrives, and an automatic retry would spend a second
 * slice of the user's own API budget without them asking.
 */
export function useRunSymptomCheck(babyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: (survey: SymptomCheckRequest["survey"]) => runSymptomCheck({ babyId: babyId!, survey }),
    onSuccess: () => {
      if (babyId) void queryClient.invalidateQueries({ queryKey: symptomKeys.history(babyId) });
    },
  });
}
