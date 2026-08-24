import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api.js";
import { streamChatMessage } from "./api.js";
import { chatKeys, useThreadMessages } from "./hooks.js";

/**
 * Drives one thread's live turn: posts a message, streams the reply, and
 * hands the view everything it needs to render the in-flight state
 * (disclaimer, a tool-status line, the streaming text so far, or the
 * emergency triage card) without touching the persisted-message cache until
 * the turn is actually done.
 */
export function useChatSession(threadId: string | undefined) {
  const queryClient = useQueryClient();
  const messagesQuery = useThreadMessages(threadId);

  const [pendingUserText, setPendingUserText] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [triage, setTriage] = useState<string | null>(null);
  const [disclaimer, setDisclaimer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  // Abort an in-flight stream when the thread changes or the page unmounts —
  // nobody is listening to it any more.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, [threadId]);

  function resetTurnState() {
    setPendingUserText(null);
    setStreamingText("");
    setToolStatus(null);
    setTriage(null);
    setError(null);
  }

  async function sendMessage(text: string): Promise<void> {
    if (!threadId || isStreaming) return;

    resetTurnState();
    setPendingUserText(text);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChatMessage(
        threadId,
        text,
        {
          onDisclaimer: (data) => setDisclaimer(data.text),
          onTriage: (data) => setTriage(data.message),
          onToolStatus: (data) => setToolStatus(data.label),
          onText: (data) => {
            setToolStatus(null);
            setStreamingText((prev) => prev + data.delta);
          },
          onDone: () => {
            // Wait for the canonical history to land before dropping the
            // optimistic turn, so the view never flashes an empty gap.
            void (async () => {
              await queryClient.invalidateQueries({ queryKey: chatKeys.messages(threadId) });
              resetTurnState();
            })();
          },
          onError: (data) => setError(data.message),
        },
        controller.signal,
      );
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof ApiError ? err.message : "Couldn't reach the server. Check your connection and try again.");
      }
    } finally {
      setIsStreaming(false);
      setToolStatus(null);
    }
  }

  return {
    messages: messagesQuery.data?.messages ?? [],
    isLoadingHistory: messagesQuery.isPending,
    historyError: messagesQuery.isError,
    pendingUserText,
    streamingText,
    toolStatus,
    triage,
    disclaimer,
    error,
    isStreaming,
    sendMessage,
  };
}
