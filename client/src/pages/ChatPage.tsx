import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ChatKind } from "@blw/shared";
import { useAiKeyStatus } from "../features/ai/hooks.js";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { useCreateThread, useDeleteThread, useThreads } from "../features/chat/hooks.js";
import { useChatSession } from "../features/chat/useChatSession.js";
import { MessageBubble } from "../features/chat/components/MessageBubble.js";

const MAX_MESSAGE_LENGTH = 2000;

const KIND_LABEL: Record<ChatKind, string> = { recipe: "Recipe helper", blw: "BLW questions" };
const KIND_DESCRIPTION: Record<ChatKind, string> = {
  recipe: "Find and adapt recipes using your pantry and your baby's profile.",
  blw: "Ask anything about baby-led weaning, answered from our safety library.",
};

function formatThreadDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Locked state — no AI key on file
// ---------------------------------------------------------------------------

function LockedChat() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Chat</h1>
      <div className="flex flex-col gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
        <p className="text-sm text-[var(--color-text)]">
          Chat uses your own Anthropic API key so nobody else's usage affects your bill. Add one in Settings to unlock the
          recipe assistant and the ask-anything BLW chat — everything else in the app works fine without it.
        </p>
        <Link to="/settings" className="w-fit text-sm font-medium text-[var(--color-primary)] underline">
          Add your key in Settings →
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thread list — /chat
// ---------------------------------------------------------------------------

function ThreadList() {
  const navigate = useNavigate();
  const { activeBaby } = useActiveBaby();
  const { data, isLoading, isError } = useThreads();
  const createThread = useCreateThread();
  const deleteThread = useDeleteThread();
  const [picking, setPicking] = useState(false);

  function startThread(kind: ChatKind) {
    createThread.mutate(
      { kind, babyId: activeBaby?.id ?? null },
      { onSuccess: (thread) => navigate(`/chat/${thread.id}`) },
    );
  }

  function handleDelete(id: string) {
    if (!window.confirm("Delete this chat? This can't be undone.")) return;
    deleteThread.mutate(id);
  }

  const threads = data?.threads ?? [];

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Chat</h1>
        {!picking && (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-[var(--color-primary-contrast)]"
          >
            + New chat
          </button>
        )}
      </div>

      {picking && (
        <div className="flex flex-col gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3">
          <p className="text-sm font-medium text-[var(--color-text)]">Start a new chat</p>
          {(["recipe", "blw"] as const satisfies readonly ChatKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              disabled={createThread.isPending}
              onClick={() => startThread(kind)}
              className="flex flex-col items-start gap-0.5 rounded-lg border border-[var(--color-border)] p-3 text-left transition-colors hover:border-[var(--color-primary)] disabled:opacity-60"
            >
              <span className="text-sm font-semibold text-[var(--color-text)]">{KIND_LABEL[kind]}</span>
              <span className="text-xs text-[var(--color-text-muted)]">{KIND_DESCRIPTION[kind]}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPicking(false)}
            className="w-fit text-xs font-medium text-[var(--color-text-muted)] underline"
          >
            Cancel
          </button>
        </div>
      )}

      {isLoading && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
      {isError && <p className="text-sm text-[var(--color-danger)]">Couldn't load your chats.</p>}

      {!isLoading && !isError && threads.length === 0 && !picking && (
        <p className="p-4 text-center text-sm text-[var(--color-text-muted)]">
          No chats yet — start one above with a recipe question or anything about baby-led weaning.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {threads.map((thread) => (
          <li key={thread.id} className="flex items-center gap-2">
            <Link
              to={`/chat/${thread.id}`}
              className="flex flex-1 items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 transition-colors hover:border-[var(--color-primary)]"
            >
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-[var(--color-text)]">{KIND_LABEL[thread.kind]}</span>
                <span className="text-xs text-[var(--color-text-muted)]">{formatThreadDate(thread.createdAt)}</span>
              </span>
              <span className="inline-flex items-center rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text-muted)]">
                {thread.kind === "recipe" ? "Recipe" : "BLW Q&A"}
              </span>
            </Link>
            <button
              type="button"
              aria-label="Delete chat"
              onClick={() => handleDelete(thread.id)}
              className="rounded-lg border border-[var(--color-border)] p-2 text-[var(--color-text-muted)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Emergency triage card
// ---------------------------------------------------------------------------

function EmergencyCard({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-1 rounded-xl border-2 p-3"
      style={{ borderColor: "var(--color-danger)", backgroundColor: "var(--color-callout-bg)" }}
    >
      <p className="text-sm font-bold text-[var(--color-danger)]">Possible emergency</p>
      <p className="text-sm text-[var(--color-text)]">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One thread — /chat/:threadId
// ---------------------------------------------------------------------------

function ThreadConversation({ threadId }: { threadId: string }) {
  const { data: threads } = useThreads();
  const thread = threads?.threads.find((t) => t.id === threadId);

  const {
    messages,
    isLoadingHistory,
    historyError,
    pendingUserText,
    streamingText,
    toolStatus,
    triage,
    disclaimer,
    error,
    isStreaming,
    sendMessage,
  } = useChatSession(threadId);

  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, streamingText, pendingUserText, toolStatus, triage, error]);

  function submitDraft() {
    const trimmed = draft.trim();
    if (!trimmed || isStreaming) return;
    setDraft("");
    void sendMessage(trimmed);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submitDraft();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitDraft();
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] p-4">
        <Link to="/chat" className="text-sm font-medium text-[var(--color-primary)] underline">
          {"← Chats"}
        </Link>
        {thread && (
          <span className="inline-flex items-center rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text-muted)]">
            {KIND_LABEL[thread.kind]}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {disclaimer && <p className="text-center text-xs text-[var(--color-text-muted)]">{disclaimer}</p>}

        {isLoadingHistory && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
        {historyError && <p className="text-sm text-[var(--color-danger)]">Couldn't load this chat.</p>}

        {messages.map((message) => (
          <MessageBubble key={message.id} role={message.role} text={message.content.map((b) => b.text).join("\n\n")} />
        ))}

        {pendingUserText && <MessageBubble role="user" text={pendingUserText} pending />}
        {triage && <EmergencyCard message={triage} />}
        {!triage && (pendingUserText || isStreaming) && <MessageBubble role="assistant" text={streamingText} pending />}
        {toolStatus && <p className="text-xs italic text-[var(--color-text-muted)]">{toolStatus}</p>}
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

        <div ref={scrollRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-[var(--color-border)] p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
          onKeyDown={handleKeyDown}
          disabled={isStreaming}
          rows={1}
          placeholder="Ask a question…"
          className="min-h-[2.5rem] flex-1 resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isStreaming || draft.trim().length === 0}
          className="rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-contrast)] disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function ChatPage() {
  const { threadId } = useParams<{ threadId?: string }>();
  const { data: keyStatus, isPending } = useAiKeyStatus();

  if (isPending) {
    return <p className="p-4 text-sm text-[var(--color-text-muted)]">Loading…</p>;
  }

  if (keyStatus?.configured !== true) {
    return <LockedChat />;
  }

  return threadId ? <ThreadConversation threadId={threadId} /> : <ThreadList />;
}
