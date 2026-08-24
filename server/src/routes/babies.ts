import { and, asc, eq, isNull } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  babyIdParamSchema,
  babyListQuerySchema,
  createBabyInputSchema,
  updateBabyInputSchema,
  type Baby,
} from "@blw/shared";
import { notFound } from "../plugins/auth.js";
import type { Database } from "../db/index.js";
import { babies } from "../db/schema.js";

type BabyRow = typeof babies.$inferSelect;

function toBaby(row: BabyRow): Baby {
  return {
    id: row.id,
    name: row.name,
    birthDate: row.birthDate,
    notes: row.notes,
    archived: row.archivedAt !== null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function badRequest(reply: FastifyReply, details: unknown): FastifyReply {
  return reply.code(400).send({ error: "invalid_request", details });
}

/** Every handler behind `requireAuth` has a user; this makes that explicit. */
function currentUserId(request: FastifyRequest): string {
  const id = request.user?.id;
  if (!id) {
    // Unreachable: requireAuth already rejected the request. Throwing beats
    // silently querying with `undefined`, which would match other users' rows.
    throw new Error("currentUserId called on an unauthenticated request");
  }
  return id;
}

/**
 * Baby profiles CRUD.
 *
 * Ownership rule for the whole file: every statement is filtered by
 * `user_id`, and a miss is a 404 — never a 403. A 403 would tell the caller
 * that the id exists and belongs to somebody else.
 */
export function registerBabyRoutes(app: FastifyInstance, db: Database): void {
  app.get("/api/babies", { preHandler: app.requireAuth }, async (request, reply) => {
    const query = babyListQuerySchema.safeParse(request.query);
    if (!query.success) {
      return badRequest(reply, query.error.flatten());
    }

    const owned = eq(babies.userId, currentUserId(request));
    const rows = await db
      .select()
      .from(babies)
      .where(query.data.includeArchived ? owned : and(owned, isNull(babies.archivedAt)))
      .orderBy(asc(babies.birthDate), asc(babies.createdAt));

    return reply.send(rows.map(toBaby));
  });

  app.post("/api/babies", { preHandler: app.requireAuth }, async (request, reply) => {
    const body = createBabyInputSchema.safeParse(request.body);
    if (!body.success) {
      return badRequest(reply, body.error.flatten());
    }

    const inserted = await db
      .insert(babies)
      .values({
        userId: currentUserId(request),
        name: body.data.name,
        birthDate: body.data.birthDate,
        notes: body.data.notes,
      })
      .returning();

    const row = inserted[0];
    if (!row) {
      throw new Error("Insert of baby returned no row");
    }
    return reply.code(201).send(toBaby(row));
  });

  app.patch("/api/babies/:id", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = babyIdParamSchema.safeParse(request.params);
    // A malformed id cannot name a row this user owns, so it is a miss
    // rather than a validation error — same response either way.
    if (!params.success) {
      return notFound(reply);
    }

    const body = updateBabyInputSchema.safeParse(request.body);
    if (!body.success) {
      return badRequest(reply, body.error.flatten());
    }

    const patch: Partial<typeof babies.$inferInsert> = {};
    if (body.data.name !== undefined) patch.name = body.data.name;
    if (body.data.birthDate !== undefined) patch.birthDate = body.data.birthDate;
    if (body.data.notes !== undefined) patch.notes = body.data.notes;
    if (body.data.archived !== undefined) {
      patch.archivedAt = body.data.archived ? new Date() : null;
    }

    const updated = await db
      .update(babies)
      .set(patch)
      .where(and(eq(babies.id, params.data.id), eq(babies.userId, currentUserId(request))))
      .returning();

    const row = updated[0];
    if (!row) {
      return notFound(reply);
    }
    return reply.send(toBaby(row));
  });

  app.delete("/api/babies/:id", { preHandler: app.requireAuth }, async (request, reply) => {
    const params = babyIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return notFound(reply);
    }

    // Cascades through serve_logs, symptom_checks and chat threads by
    // foreign key, so this really does remove the child's whole record.
    const deleted = await db
      .delete(babies)
      .where(and(eq(babies.id, params.data.id), eq(babies.userId, currentUserId(request))))
      .returning();

    if (deleted.length === 0) {
      return notFound(reply);
    }
    return reply.code(204).send();
  });
}
