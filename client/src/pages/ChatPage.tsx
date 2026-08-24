import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ChatKind } from "@blw/shared";
import { useAiKeyStatus } from "../features/ai/hooks.js";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { useCreateThread, useDeleteThread, useThreads } from "../features/chat/hooks.js";
import { useChatSession } from "../features/chat/useChatSession.js";
import { MessageBubble } from "../features/chat/components/MessageBubble.js";
import { Composer } from "../features/chat/components/Composer.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { Button, ButtonLink } from "../components/ui/Button.js";
import { Card, CardLink } from "../components/ui/Card.js";
import { Badge } from "../components/ui/Badge.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import { SkeletonList, Skeleton } from "../components/ui/Skeleton.js";

const MAX_MESSAGE_LENGTH = 2000;

const KIND_LABEL: Record<ChatKind, string> = { recipe: "Recipe helper", blw: "BLW questions" };
const KIND_DESCRIPTION: Record<ChatKind, string> = {
  recipe: "Find and adapt recipes using your pantry and your baby's profile.",
  blw: "Ask anything about baby-led weaning, answered from our safety library.",
};
const KIND_EMOJI: Record<ChatKind, string> = { recipe: "🍳", blw: "🌱" };
const KIND_BADGE_TONE: Record<ChatKind, "sunshine" | "leaf"> = { recipe: "sunshine", blw: "leaf" };

function formatThreadDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Locked state — no AI key on file
// ---------------------------------------------------------------------------

function LockedChat() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader title="Chat" emoji="💬" />
      <EmptyState
        icon="🔑"
        title="Add a key to unlock chat"
        description="Chat uses your own Anthropic API key so nobody else's usage affects your bill. Add one in Settings to unlock the recipe assistant and the ask-anything BLW chat — everything else in the app works fine without it."
        action={
          <ButtonLink to="/settings" size="sm">
            Add your key in Settings →
          </ButtonLink>
        }
      />
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
      <PageHeader
        title="Chat"
        emoji="💬"
        action={
          !picking && (
            <Button size="sm" onClick={() => setPicking(true)}>
              + New chat
            </Button>
          )
        }
      />

      {picking && (
        <Card className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-[var(--color-text)]">Start a new chat</p>
          {(["recipe", "blw"] as const satisfies readonly ChatKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              disabled={createThread.isPending}
              onClick={() => startThread(kind)}
              className="flex min-h-11 items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 text-left transition-[transform,border-color] duration-[var(--duration-fast)] ease-[var(--ease-spring)] hover:border-[var(--color-primary)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:opacity-60"
            >
              <span aria-hidden="true" className="text-2xl leading-none">
                {KIND_EMOJI[kind]}
              </span>
              <span className="flex flex-col items-start gap-0.5">
                <span className="text-sm font-semibold text-[var(--color-text)]">{KIND_LABEL[kind]}</span>
                <span className="text-xs text-[var(--color-text-muted)]">{KIND_DESCRIPTION[kind]}</span>
              </span>
            </button>
          ))}
          <Button variant="ghost" size="sm" className="w-fit" onClick={() => setPicking(false)}>
            Cancel
          </Button>
        </Card>
      )}

      {isLoading && <SkeletonList count={3} />}
      {isError && <p className="text-sm text-[var(--color-danger)]">Couldn't load your chats.</p>}

      {!isLoading && !isError && threads.length === 0 && !picking && (
        <EmptyState
          icon="💬"
          title="No chats yet"
          description="Start one above with a recipe question or anything about baby-led weaning."
        />
      )}

      <ul className="flex flex-col gap-2">
        {threads.map((thread) => (
          <li key={thread.id} className="flex items-center gap-2">
            <CardLink
              to={`/chat/${thread.id}`}
              padding="sm"
              className="flex flex-1 items-center gap-3"
            >
              <span aria-hidden="true" className="text-2xl leading-none">
                {KIND_EMOJI[thread.kind]}
              </span>
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-sm font-semibold text-[var(--color-text)]">{KIND_LABEL[thread.kind]}</span>
                <span className="text-xs text-[var(--color-text-muted)]">{formatThreadDate(thread.createdAt)}</span>
              </span>
              <Badge tone={KIND_BADGE_TONE[thread.kind]}>{thread.kind === "recipe" ? "Recipe" : "BLW Q&A"}</Badge>
            </CardLink>
            <button
              type="button"
              aria-label="Delete chat"
              onClick={() => handleDelete(thread.id)}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text-muted)] transition-colors duration-[var(--duration-fast)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
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
      className="flex flex-col gap-1 rounded-[var(--radius-lg)] border-2 border-[var(--color-danger)] bg-[var(--color-callout-bg)] p-3"
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
        <Link
          to="/chat"
          className="text-sm font-semibold text-[var(--color-primary)] underline-offset-2 hover:underline"
        >
          {"← Chats"}
        </Link>
        {thread && <Badge tone={KIND_BADGE_TONE[thread.kind]}>{KIND_LABEL[thread.kind]}</Badge>}
      </div>

      <div className="scroll-momentum flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {disclaimer && <p className="text-center text-xs text-[var(--color-text-muted)]">{disclaimer}</p>}

        {isLoadingHistory && <SkeletonList count={3} />}
        {historyError && <p className="text-sm text-[var(--color-danger)]">Couldn't load this chat.</p>}

        {messages.map((message) => (
          <MessageBubble key={message.id} role={message.role} text={message.content.map((b) => b.text).join("\n\n")} />
        ))}

        {pendingUserText && <MessageBubble role="user" text={pendingUserText} pending />}
        {triage && <EmergencyCard message={triage} />}
        {!triage && (pendingUserText || isStreaming) && <MessageBubble role="assistant" text={streamingText} pending />}
        {toolStatus && <p className="text-xs text-[var(--color-text-muted)] italic">{toolStatus}</p>}
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

        <div ref={scrollRef} />
      </div>

      <Composer value={draft} onChange={setDraft} onSubmit={submitDraft} disabled={isStreaming} maxLength={MAX_MESSAGE_LENGTH} />
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
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-6 w-1/3" />
        <SkeletonList count={2} />
      </div>
    );
  }

  if (keyStatus?.configured !== true) {
    return <LockedChat />;
  }

  return threadId ? <ThreadConversation threadId={threadId} /> : <ThreadList />;
}
