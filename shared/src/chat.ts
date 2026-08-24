import { z } from "zod";

/**
 * The two AI chat surfaces: a recipe assistant (tool-backed, can search the
 * seed catalog and check the household's pantry/baby profile) and an
 * ask-anything BLW chat (answers only from the safety library corpus).
 * Shared between server/src/routes/chat.ts and the client's features/chat/**
 * query + streaming layer.
 */

export const chatKindSchema = z.enum(["recipe", "blw"]);
export type ChatKind = z.infer<typeof chatKindSchema>;

/** A message longer than this never reaches the model — enforced here so
 * client and server agree on the limit without duplicating the number. */
export const MAX_CHAT_MESSAGE_LENGTH = 2000;

/** Most recent rows loaded as conversation history for a model call. */
export const MAX_CHAT_HISTORY_TURNS = 30;

// ---------------------------------------------------------------------------
// POST /api/ai/threads
// ---------------------------------------------------------------------------

export const createChatThreadInputSchema = z.object({
  kind: chatKindSchema,
  babyId: z
    .string()
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
});
export type CreateChatThreadInput = z.input<typeof createChatThreadInputSchema>;

export const chatThreadSchema = z.object({
  id: z.string().uuid(),
  kind: chatKindSchema,
  babyId: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type ChatThread = z.infer<typeof chatThreadSchema>;

export const chatThreadsResponseSchema = z.object({ threads: z.array(chatThreadSchema) });
export type ChatThreadsResponse = z.infer<typeof chatThreadsResponseSchema>;

/** Route params shared by every `/api/ai/threads/:id...` endpoint. */
export const chatThreadIdParamSchema = z.object({ id: z.string().uuid() });

// ---------------------------------------------------------------------------
// POST /api/ai/threads/:id/messages
// ---------------------------------------------------------------------------

export const sendChatMessageInputSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Message is required")
    .max(MAX_CHAT_MESSAGE_LENGTH, `Message must be ${MAX_CHAT_MESSAGE_LENGTH} characters or fewer`),
});
export type SendChatMessageInput = z.input<typeof sendChatMessageInputSchema>;

// ---------------------------------------------------------------------------
// Message content + history (GET /api/ai/threads/:id/messages)
// ---------------------------------------------------------------------------

/**
 * Kept intentionally narrow (text-only) — every user and assistant turn in
 * this app is plain text today. Stored and echoed back as a content-block
 * array rather than collapsed to a bare string, so a future block type
 * (citations, images) never needs a storage migration, only a schema union.
 */
export const chatContentBlockSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});
export type ChatContentBlock = z.infer<typeof chatContentBlockSchema>;

export const chatRoleSchema = z.enum(["user", "assistant"]);
export type ChatRole = z.infer<typeof chatRoleSchema>;

export const chatMessageSchema = z.object({
  id: z.string().uuid(),
  role: chatRoleSchema,
  content: z.array(chatContentBlockSchema),
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatMessagesResponseSchema = z.object({ messages: z.array(chatMessageSchema) });
export type ChatMessagesResponse = z.infer<typeof chatMessagesResponseSchema>;

// ---------------------------------------------------------------------------
// SSE event contract for POST /api/ai/threads/:id/messages
// ---------------------------------------------------------------------------
// The response is `text/event-stream`, not JSON — these types describe the
// shape of each event's `data:` payload so the server and the client's
// stream parser agree on the wire format without a shared runtime.

export const CHAT_SSE_EVENTS = ["disclaimer", "triage", "tool_status", "text", "done", "error"] as const;
export type ChatSseEvent = (typeof CHAT_SSE_EVENTS)[number];

/** The persistent "not medical advice" footer, sent once per turn. */
export interface ChatDisclaimerData {
  text: string;
}

/** An active-emergency phrase was detected — render the emergency card and
 * stop; the model was never called for this turn. */
export interface ChatTriageData {
  message: string;
}

/** A tool call started — a short human-readable status line ("Checking
 * your pantry…") to show while the model waits on it. */
export interface ChatToolStatusData {
  label: string;
}

/** One streamed text chunk of the assistant's reply. */
export interface ChatTextData {
  delta: string;
}

/** The turn finished and both messages are persisted. */
export interface ChatDoneData {
  threadId: string;
}

/** The turn failed (refusal, model/network error, or an unfinished tool
 * loop) — nothing further will arrive on this stream. */
export interface ChatErrorData {
  message: string;
}
