import { z } from "zod";

import { appVersionSchema, routePatternSchema } from "./usage.js";

/**
 * Parent feedback to the admins: the send form's input, and the inbox the
 * admins read it in (item 358).
 *
 * **Why this is not a section of `shared/src/admin.ts`.** That file opens by
 * promising aggregates only — no id, no email, no name, "not because the
 * queries are careful, but because there is nowhere in these types to put
 * one". The inbox is the deliberate opposite: an admin reading a message
 * needs the words the parent wrote and the address to answer at. Putting
 * those shapes here keeps that promise literally true where it is made, and
 * keeps the exception somewhere it has to be read rather than stumbled on.
 *
 * The rules the shapes carry:
 *   * free text travels in exactly two directions — parent → database on
 *     POST, and database → an authenticated admin on the inbox routes. It is
 *     never in a usage event (`feedback_sent` has no props at all) and never
 *     in anything a non-admin can reach;
 *   * `senderEmail` exists only on the ADMIN item. The parent's own POST
 *     response is an id and nothing else;
 *   * the write side pins `routePattern` to the closed route enum; the read
 *     side does not — see `adminFeedbackItemSchema`.
 */

/** Longest message the box accepts. The client counts against the same number. */
export const FEEDBACK_MESSAGE_MAX = 2000;

// ---------------------------------------------------------------------------
// POST /api/feedback
// ---------------------------------------------------------------------------

/**
 * What the send form posts. `.strict()`, so there is nowhere to smuggle a
 * `userId` or a status — the server takes the sender from the session and
 * every message starts life as `new`.
 */
export const createFeedbackInputSchema = z
  .object({
    /** Trimmed first: a box holding three spaces is a blank box. */
    message: z.string().trim().min(1).max(FEEDBACK_MESSAGE_MAX),
    /** The screen they were on, as a PATTERN — never a real path, so a slug
     * or an id cannot ride along. Null when the client had none. */
    routePattern: routePatternSchema.nullable(),
    appVersion: appVersionSchema,
  })
  .strict();

export type CreateFeedbackInput = z.infer<typeof createFeedbackInputSchema>;

/** The whole 201 body. Nothing is echoed back: the parent already has their
 * own words, and the id is only useful for a later "we got it". */
export const feedbackCreatedResponseSchema = z.object({ id: z.string().uuid() }).strict();
export type FeedbackCreatedResponse = z.infer<typeof feedbackCreatedResponseSchema>;

// ---------------------------------------------------------------------------
// The admin inbox
// ---------------------------------------------------------------------------

export const feedbackStatusSchema = z.enum(["new", "read", "resolved"]);
export type FeedbackStatus = z.infer<typeof feedbackStatusSchema>;

/**
 * Which tab of the inbox. `open` is "still needs a human": not archived, and
 * not resolved. Absent on the wire means `open`.
 */
export const adminFeedbackFilterSchema = z.enum(["open", "resolved", "archived"]);
export type FeedbackFilter = z.infer<typeof adminFeedbackFilterSchema>;

/**
 * One message as an admin sees it.
 *
 * `routePattern` is a plain nullable string here while the write side keeps
 * the closed enum, and the asymmetry is on purpose: a stored pattern was
 * written by whatever build was live when the message was sent, and this
 * repo has already renamed route patterns twice (`/pantry/*` → `/fridge/*` →
 * `/storage`). Parsing the inbox against today's enum would turn a past
 * rename into a 500 on the admin's screen; coercing an unrecognised value to
 * null would quietly destroy the one fact the field carries.
 */
export const adminFeedbackItemSchema = z
  .object({
    id: z.string(),
    message: z.string(),
    /** The sender's address, so an admin can reply by mail. This is the one
     * place in the whole admin surface where a parent's address appears, and
     * it is what makes the inbox answerable at all. */
    senderEmail: z.string(),
    routePattern: z.string().nullable(),
    appVersion: z.string(),
    status: feedbackStatusSchema,
    /** "Cleared". Derived from `archived_at`, which is never unset by a
     * delete — Restore simply writes null back. */
    archived: z.boolean(),
    createdAt: z.string(),
    readAt: z.string().nullable(),
    resolvedAt: z.string().nullable(),
  })
  .strict();

export type AdminFeedbackItem = z.infer<typeof adminFeedbackItemSchema>;

/** Newest first, capped server-side (see `FEEDBACK_LIST_LIMIT`). */
export const adminFeedbackListResponseSchema = z
  .object({ items: z.array(adminFeedbackItemSchema) })
  .strict();
export type AdminFeedbackListResponse = z.infer<typeof adminFeedbackListResponseSchema>;

/**
 * The four numbers the tabs and the More-page chip are built from. The three
 * status counts cover live messages only; `archived` is its own bucket, so
 * the four always sum to the table.
 */
export const adminFeedbackSummarySchema = z
  .object({
    new: z.number().int().min(0),
    read: z.number().int().min(0),
    resolved: z.number().int().min(0),
    archived: z.number().int().min(0),
  })
  .strict();
export type AdminFeedbackSummary = z.infer<typeof adminFeedbackSummarySchema>;

/**
 * PATCH body. Both keys optional but at least one required (the
 * `updatePreferencesInputSchema` idiom): an empty body is a request that
 * asks for nothing, and answering 200 to it would make "nothing changed"
 * ambiguous between a no-op and a typo.
 */
export const updateFeedbackInputSchema = z
  .object({
    status: feedbackStatusSchema.optional(),
    archived: z.boolean().optional(),
  })
  .strict()
  .refine((value) => value.status !== undefined || value.archived !== undefined, {
    message: "at least one field must be given",
  });

export type UpdateFeedbackInput = z.infer<typeof updateFeedbackInputSchema>;
