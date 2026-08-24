import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AiKeyStatus } from "@blw/shared";
import { deleteAiKey, fetchAiKeyStatus, saveAiKey } from "./api.js";

export const aiKeys = {
  status: () => ["ai-key"] as const,
};

/**
 * Whether this account has an Anthropic key on file. Every AI surface in the
 * app gates on this, so it is cached generously — it only changes when the
 * user edits it here in Settings.
 */
export function useAiKeyStatus() {
  return useQuery({
    queryKey: aiKeys.status(),
    queryFn: fetchAiKeyStatus,
    staleTime: 5 * 60_000,
  });
}

export function useSaveAiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (apiKey: string) => saveAiKey(apiKey),
    onSuccess: ({ last4 }) => {
      // The server has just validated the key, so the status is known
      // exactly — write it straight in rather than round-tripping.
      queryClient.setQueryData<AiKeyStatus>(aiKeys.status(), {
        configured: true,
        last4,
        lastValidatedAt: new Date().toISOString(),
      });
    },
  });
}

export function useDeleteAiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteAiKey(),
    onSuccess: () => {
      queryClient.setQueryData<AiKeyStatus>(aiKeys.status(), { configured: false });
    },
  });
}
