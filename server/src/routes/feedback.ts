// Parent feedback, and the admin inbox that reads it (items 358–359).
//
// Invariants this file exists to hold:
//
//   * **Nothing under `/api/admin/feedback*` exists for a non-admin.** The
//     three admin routes sit behind the same `createRequireAdmin` guard as
//     `routes/admin.ts`, which answers through the app's own not-found
//     handler — same status, same body, same headers as a URL that was never
//     registered. Their budgets are installed AFTER that guard on purpose: a
//     429 from a route a parent cannot see would tell them it is there.
//   * **Free text is admin-only, and never analytics.** A message is written
//     by its author and read by an admin; `feedback_sent` carries no props at
//     all, so nothing of what was typed can reach a usage event.
//   * **Clear archives, it never deletes.** Every write here is reversible,
//     and the only thing that removes a row is the account's own cascade.
import { and, count, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  adminFeedbackFilterSchema,
  createFeedbackInputSchema,
  updateFeedbackInputSchema,
  type AdminFeedbackItem,
  type AdminFeedbackSummary,
  type FeedbackFilter,
} from "@blw/shared";
import { createRequireAdmin, currentAdmin } from "../admin/access.js";
import { createPerUserRateLimit, perUserRateLimitHook } from "../ai/client.js";
import type { Env } from "../config.js";
import type { Database } from "../db/index.js";
import { adminAudit, feedback, user } from "../db/schema.js";

/**
 * What one account may send in an hour. Deliberately small: this is a box a
 * person types prose into, and five messages an hour is already an unusual
 * day for the most engaged parent we have.
 */
const FEEDBACK_PER_HOUR = 5;

/**
 * The inbox's own hourly read budget, mirroring `ADMIN_REQUESTS_PER_HOUR`
 * rather than sharing it: an admin working through a full inbox must not
 * spend the metrics dashboard's allowance, or vice versa.
 */
const ADMIN_FEEDBACK_REQUESTS_PER_HOUR = 120;

/**
 * And the write budget. Far more generous than `routes/admin.ts`'s ten
 * grants per window, because these writes are triage rather than access
 * control — every one of them is reversible from the next tab over.
 */
const ADMIN_FEEDBACK_WRITES_PER_WINDOW = 60;
const ADMIN_FEEDBACK_WRITE_WINDOW_MS = 15 * 60 * 1000;

/** Newest-first page size. One screenful of scrolling, never a table scan
 * an admin's browser then has to render. */
const FEEDBACK_LIST_LIMIT = 200;

/** Absent `?filter=` means the tab that needs a human: the `DEFAULT_RANGE`
 * idiom from `routes/admin.ts`. */
const DEFAULT_FILTER: FeedbackFilter = "open";

/** Shape-only check on the `:id` path parameter; see the PATCH handler. */
const uuidSchema = z.string().uuid();

/** The row shape every read here selects, joined to its sender. */
interface FeedbackRow {
  id: string;
  message: string;
  senderEmail: string;
  routePattern: string | null;
  appVersion: string;
  status: "new" | "read" | "resolved";
  archivedAt: Date | null;
  createdAt: Date;
  readAt: Date | null;
  resolvedAt: Date | null;
}

function toItem(row: FeedbackRow): AdminFeedbackItem {
  return {
    id: row.id,
    message: row.message,
    senderEmail: row.senderEmail,
    routePattern: row.routePattern,
    appVersion: row.appVersion,
    status: row.status,
    // Derived, not stored: "Cleared" is a timestamp, and the client only
    // ever needs to know which tab the row belongs in.
    archived: row.archivedAt !== null,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

/** `open` is "not archived and nobody has finished with it yet". */
function filterCondition(filter: FeedbackFilter) {
  if (filter === "archived") return isNotNull(feedback.archivedAt);
  if (filter === "resolved") {
    return and(isNull(feedback.archivedAt), eq(feedback.status, "resolved"));
  }
  return and(isNull(feedback.archivedAt), inArray(feedback.status, ["new", "read"]));
}

export function registerFeedbackRoutes(app: FastifyInstance, db: Database, env: Env): void {
  const requireAdmin = createRequireAdmin(db, env);
  // resolveOptionalUser, not requireAuth: a 401 would announce the route.
  const guards = [
    app.resolveOptionalUser,
    requireAdmin,
    perUserRateLimitHook(createPerUserRateLimit(ADMIN_FEEDBACK_REQUESTS_PER_HOUR)),
  ];
  const writeGuards = [
    ...guards,
    perUserRateLimitHook(
      createPerUserRateLimit(ADMIN_FEEDBACK_WRITES_PER_WINDOW, ADMIN_FEEDBACK_WRITE_WINDOW_MS),
    ),
  ];

  /** Every admin read selects the sender's address alongside the row.
   * `inner`, because `feedback.user_id` is NOT NULL and cascades — a message
   * without a sender cannot exist, and a left join would force a fake empty
   * address into the contract. */
  const selectWithSender = () =>
    db
      .select({
        id: feedback.id,
        message: feedback.message,
        senderEmail: user.email,
        routePattern: feedback.routePattern,
        appVersion: feedback.appVersion,
        status: feedback.status,
        archivedAt: feedback.archivedAt,
        createdAt: feedback.createdAt,
        readAt: feedback.readAt,
        resolvedAt: feedback.resolvedAt,
        // Not part of the item: the audit row records whose message an
        // action was about, and the response never carries an id of the
        // person who sent it.
        userId: feedback.userId,
      })
      .from(feedback)
      .innerJoin(user, eq(feedback.userId, user.id));

  // -----------------------------------------------------------------------
  // POST /api/feedback — the parent's side, and the only unguarded route here
  // -----------------------------------------------------------------------
  app.post(
    "/api/feedback",
    {
      preHandler: [app.requireAuth, perUserRateLimitHook(createPerUserRateLimit(FEEDBACK_PER_HOUR))],
    },
    async (request, reply) => {
      const parsed = createFeedbackInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten().fieldErrors });
      }

      // The sender is the session and nothing else. The body is `.strict()`
      // and has nowhere to put a user id, so there is no version of this
      // request that files a message under somebody else's name.
      const userId = request.user?.id;
      if (!userId) throw new Error("POST /api/feedback reached without a session");

      const [row] = await db
        .insert(feedback)
        .values({
          userId,
          message: parsed.data.message,
          routePattern: parsed.data.routePattern,
          appVersion: parsed.data.appVersion,
        })
        // Whole row rather than a projection: `Database` is a union of the
        // node-postgres and PGlite builders, and the field-projection overload
        // of `returning()` does not resolve across it.
        .returning();

      if (!row) throw new Error("feedback insert returned no row");
      // No email goes out. The inbox is where this is read, and an alert that
      // nobody asked for is a setting nobody can turn off.
      return reply.code(201).send({ id: row.id });
    },
  );

  // -----------------------------------------------------------------------
  // GET /api/admin/feedback?filter= — one tab of the inbox
  // -----------------------------------------------------------------------
  app.get("/api/admin/feedback", { preHandler: guards }, async (request, reply) => {
    const { filter } = request.query as { filter?: string };
    const parsed =
      filter === undefined
        ? ({ success: true, data: DEFAULT_FILTER } as const)
        : adminFeedbackFilterSchema.safeParse(filter);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const rows = await selectWithSender()
      .where(filterCondition(parsed.data))
      .orderBy(desc(feedback.createdAt))
      .limit(FEEDBACK_LIST_LIMIT);

    // Never a shared cache: this is somebody's prose, behind an access check.
    return reply.header("cache-control", "no-store").send({ items: rows.map(toItem) });
  });

  // -----------------------------------------------------------------------
  // GET /api/admin/feedback/summary — the four tab counts
  // -----------------------------------------------------------------------
  // Registered before the `:id` route for readability; Fastify's radix router
  // prefers the static segment either way.
  app.get("/api/admin/feedback/summary", { preHandler: guards }, async (_request, reply) => {
    // One pass over the table rather than four round trips. The three status
    // counts are live messages only — an archived row is in the `archived`
    // bucket and nowhere else, so the four always sum to the table.
    const [row] = await db
      .select({
        new: count(sql`case when ${feedback.archivedAt} is null and ${feedback.status} = 'new' then 1 end`),
        read: count(sql`case when ${feedback.archivedAt} is null and ${feedback.status} = 'read' then 1 end`),
        resolved: count(
          sql`case when ${feedback.archivedAt} is null and ${feedback.status} = 'resolved' then 1 end`,
        ),
        archived: count(sql`case when ${feedback.archivedAt} is not null then 1 end`),
      })
      .from(feedback);

    const body: AdminFeedbackSummary = {
      new: Number(row?.new ?? 0),
      read: Number(row?.read ?? 0),
      resolved: Number(row?.resolved ?? 0),
      archived: Number(row?.archived ?? 0),
    };
    return reply.header("cache-control", "no-store").send(body);
  });

  // -----------------------------------------------------------------------
  // PATCH /api/admin/feedback/:id — mark read, resolve, reopen, clear, restore
  // -----------------------------------------------------------------------
  //
  // No re-auth, unlike the collaborator routes: every action here is
  // reversible from the next tab over and none of them changes anybody's
  // access, so the freshness check those two carry would buy nothing and
  // would push admins towards leaving a window open instead.
  app.patch<{ Params: { id: string } }>(
    "/api/admin/feedback/:id",
    { preHandler: writeGuards },
    async (request, reply) => {
      const admin = currentAdmin(request);

      const parsed = updateFeedbackInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten().fieldErrors });
      }

      // `feedback.id` is a uuid column, so a malformed id would reach
      // Postgres as a failed cast — a 500 for what is only ever "no such
      // row". (`/api/admin/collaborators/:userId` needs no such guard:
      // `user.id` is text.) A malformed id is simply an id that does not
      // exist, and it is answered that way.
      if (!uuidSchema.safeParse(request.params.id).success) {
        return reply.code(404).send({ error: "not_found" });
      }

      const [row] = await selectWithSender().where(eq(feedback.id, request.params.id)).limit(1);
      if (!row) {
        return reply.code(404).send({ error: "not_found" });
      }

      const wasArchived = row.archivedAt !== null;
      const nextStatus = parsed.data.status ?? row.status;
      const nextArchived = parsed.data.archived ?? wasArchived;
      const statusChanged = nextStatus !== row.status;
      const archiveChanged = nextArchived !== wasArchived;

      if (!statusChanged && !archiveChanged) {
        // A PATCH that asks for what is already true writes nothing — and
        // therefore records nothing. An audit trail full of no-ops is an
        // audit trail nobody reads.
        return reply.header("cache-control", "no-store").send(toItem(row));
      }

      const now = new Date();
      const set: Record<string, unknown> = {};

      if (statusChanged) {
        set.status = nextStatus;
        if (row.status === "new") {
          // Leaving `new` is the moment somebody read it. `coalesce` rather
          // than a plain write so two admins opening the inbox at once
          // cannot move the timestamp a third time.
          set.readAt = sql`coalesce(${feedback.readAt}, ${now})`;
        }
        if (nextStatus === "resolved") {
          set.resolvedAt = now;
          set.resolvedBy = admin.id;
        } else if (row.status === "resolved") {
          // Reopening takes the resolution back with it: a `resolved_at`
          // left behind on an open message is a lie the inbox would render.
          set.resolvedAt = null;
          set.resolvedBy = null;
        }
      }

      if (archiveChanged) {
        set.archivedAt = nextArchived ? now : null;
      }

      // One audit row per changed dimension. The inbox only ever sends one
      // key, so in practice this is always exactly one row; a hand-made
      // request carrying both lands on both names rather than on a
      // synthesised verb nothing reads.
      const actions: string[] = [];
      if (statusChanged) {
        actions.push(
          row.status === "resolved"
            ? "feedback_reopened"
            : nextStatus === "resolved"
              ? "feedback_resolved"
              : "feedback_read",
        );
      }
      if (archiveChanged) {
        actions.push(nextArchived ? "feedback_archived" : "feedback_restored");
      }

      const updated = await db.transaction(async (tx) => {
        // Whole row: drizzle's field-projection overload of `returning()`
        // does not resolve once `set` carries a raw `sql` fragment (the same
        // reason routes/preferences.ts takes the whole row).
        const [next] = await tx.update(feedback).set(set).where(eq(feedback.id, row.id)).returning();
        if (!next) throw new Error("feedback update returned no row");

        await tx.insert(adminAudit).values(
          actions.map((action) => ({
            actorUserId: admin.id,
            action,
            // Whose message it was, and which message. `target_ref` has no
            // FK, so the record survives the row it names.
            targetUserId: row.userId,
            targetRef: row.id,
          })),
        );

        return next;
      });

      // The address came from the pre-update join; nothing in this handler
      // can have changed it.
      return reply.header("cache-control", "no-store").send(
        toItem({
          id: updated.id,
          message: updated.message,
          senderEmail: row.senderEmail,
          routePattern: updated.routePattern,
          appVersion: updated.appVersion,
          status: updated.status,
          archivedAt: updated.archivedAt,
          createdAt: updated.createdAt,
          readAt: updated.readAt,
          resolvedAt: updated.resolvedAt,
        }),
      );
    },
  );
}
