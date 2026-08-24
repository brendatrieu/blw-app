import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChatThreadsResponse, CreateChatThreadInput } from "@blw/shared";
import { createThread, deleteThread, fetchThreadMessages, fetchThreads } from "./api.js";

export const chatKeys = {
  threads: ["chat-threads"] as const,
  messages: (threadId: string) => ["chat-messages", threadId] as const,
};

export function useThreads() {
  return useQuery({
    queryKey: chatKeys.threads,
    queryFn: fetchThreads,
    staleTime: 15_000,
  });
}

export function useThreadMessages(threadId: string | undefined) {
  return useQuery({
    queryKey: chatKeys.messages(threadId ?? ""),
    queryFn: () => fetchThreadMessages(threadId as string),
    enabled: Boolean(threadId),
    // The streaming send flow invalidates this itself once a turn finishes;
    // no need to poll or refetch on focus while a reply is in flight.
    staleTime: 15_000,
  });
}

export function useCreateThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateChatThreadInput) => createThread(input),
    onSuccess: (thread) => {
      queryClient.setQueryData<ChatThreadsResponse>(chatKeys.threads, (current) => ({
        threads: [thread, ...(current?.threads ?? [])],
      }));
    },
  });
}

export function useDeleteThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteThread(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: chatKeys.threads });
      const previous = queryClient.getQueryData<ChatThreadsResponse>(chatKeys.threads);
      queryClient.setQueryData<ChatThreadsResponse>(chatKeys.threads, (current) => ({
        threads: (current?.threads ?? []).filter((thread) => thread.id !== id),
      }));
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(chatKeys.threads, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.threads });
    },
  });
}
