import type {
  ChatDisclaimerData,
  ChatDoneData,
  ChatErrorData,
  ChatMessagesResponse,
  ChatSseEvent,
  ChatTextData,
  ChatThread,
  ChatThreadsResponse,
  ChatToolStatusData,
  ChatTriageData,
  CreateChatThreadInput,
} from "@blw/shared";
import { ApiError, apiDelete, apiGet, apiPost } from "../../lib/api.js";

export function fetchThreads(): Promise<ChatThreadsResponse> {
  return apiGet<ChatThreadsResponse>("/api/ai/threads");
}

export function createThread(input: CreateChatThreadInput): Promise<ChatThread> {
  return apiPost<ChatThread>("/api/ai/threads", input);
}

export function deleteThread(id: string): Promise<void> {
  return apiDelete<void>(`/api/ai/threads/${id}`);
}

export function fetchThreadMessages(id: string): Promise<ChatMessagesResponse> {
  return apiGet<ChatMessagesResponse>(`/api/ai/threads/${id}/messages`);
}

// ---------------------------------------------------------------------------
// Sending a message — SSE over a POST body, so it can't use EventSource
// (which only supports GET). Reads the fetch response body by hand and
// parses the same `event:`/`data:` frames the server writes in
// server/src/ai/stream.ts.
// ---------------------------------------------------------------------------

export interface ChatStreamHandlers {
  onDisclaimer?: (data: ChatDisclaimerData) => void;
  onTriage?: (data: ChatTriageData) => void;
  onToolStatus?: (data: ChatToolStatusData) => void;
  onText?: (data: ChatTextData) => void;
  onDone?: (data: ChatDoneData) => void;
  onError?: (data: ChatErrorData) => void;
}

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
      return body.error;
    }
  } catch {
    // Non-JSON or empty error body — fall through to the status text.
  }
  return response.statusText || `Request failed with status ${response.status}`;
}

function dispatchSseFrame(rawFrame: string, handlers: ChatStreamHandlers): void {
  let eventName: ChatSseEvent | null = null;
  let dataText = "";
  for (const line of rawFrame.split("\n")) {
    if (line.startsWith(":")) continue; // heartbeat comment
    if (line.startsWith("event:")) eventName = line.slice("event:".length).trim() as ChatSseEvent;
    else if (line.startsWith("data:")) dataText += line.slice("data:".length).trim();
  }
  if (!eventName || !dataText) return;

  let data: unknown;
  try {
    data = JSON.parse(dataText);
  } catch {
    return;
  }

  switch (eventName) {
    case "disclaimer":
      handlers.onDisclaimer?.(data as ChatDisclaimerData);
      break;
    case "triage":
      handlers.onTriage?.(data as ChatTriageData);
      break;
    case "tool_status":
      handlers.onToolStatus?.(data as ChatToolStatusData);
      break;
    case "text":
      handlers.onText?.(data as ChatTextData);
      break;
    case "done":
      handlers.onDone?.(data as ChatDoneData);
      break;
    case "error":
      handlers.onError?.(data as ChatErrorData);
      break;
  }
}

/**
 * Posts one message and streams the reply. Resolves once the stream ends
 * (either a `done`/`error` event or the connection closing); throws only for
 * a failure the server never got to answer as SSE at all (network error, or
 * a non-OK response before the stream opened — e.g. the 403 `ai_unavailable`
 * a locked account gets).
 */
export async function streamChatMessage(threadId: string, message: string, handlers: ChatStreamHandlers, signal: AbortSignal): Promise<void> {
  const response = await fetch(`/api/ai/threads/${threadId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ message }),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new ApiError(response.status, await extractErrorMessage(response));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let separatorIndex: number;
    while ((separatorIndex = buffer.indexOf("\n\n")) !== -1) {
      const rawFrame = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      dispatchSseFrame(rawFrame, handlers);
    }
  }
}
