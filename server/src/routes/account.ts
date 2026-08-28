// Account-wide operations: take everything out, or remove everything.
//
// Invariants this file exists to hold:
//   * the export covers every table the account owns, and carries no key
//     material — `user_ai_keys` contributes a status line, never a secret;
//   * deletion proves the person at the keyboard is the account holder
//     *right now*, not merely that a stolen cookie is being replayed;
//   * a failed proof changes nothing at all.
import { and, asc, eq, inArray } from "drizzle-orm";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  ACCOUNT_EXPORT_VERSION,
  ACCOUNT_REAUTH_MAX_AGE_MS,
  accountExportFilename,
  deleteAccountInputSchema,
  type AccountExport,
  type ExportChatMessage,
} from "@blw/shared";
import { createPerUserRateLimit, perUserRateLimitHook } from "../ai/client.js";
import type { Database } from "../db/index.js";
import {
  babies,
  chatMessages,
  chatThreads,
  favorites,
  foods,
  mealFoods,
  meals,
  pantryItems,
  recipes,
  session,
  symptomChecks,
  user,
  userAiKeys,
} from "../db/schema.js";

/**
 * Deletion verifies a password, which makes it a credential oracle. The
 * global 300/min/IP ceiling is far too generous for that, and the auth
 * route's per-IP budget does not cover this path — so the endpoint carries
 * its own tight per-user budget.
 */
const DELETE_ATTEMPTS_PER_WINDOW = 5;
const DELETE_WINDOW_MS = 15 * 60 * 1000;

/** Every handler here sits behind requireAuth; this makes that explicit. */
function currentUserId(request: FastifyRequest): string {
  const id = request.user?.id;
  if (!id) {
    throw new Error("currentUserId called on an unauthenticated request");
  }
  return id;
}

function isoOrNull(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

export function registerAccountRoutes(app: FastifyInstance, db: Database): void {
  const deleteRateLimit = perUserRateLimitHook(
    createPerUserRateLimit(DELETE_ATTEMPTS_PER_WINDOW, DELETE_WINDOW_MS),
  );

  // -----------------------------------------------------------------------
  // GET /api/account/export — one JSON bundle of everything this user owns
  // -----------------------------------------------------------------------
  app.get("/api/account/export", { preHandler: app.requireAuth }, async (request, reply) => {
    const userId = currentUserId(request);

    const [profileRow] = await db
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    // requireAuth resolved a session, so the row is there; the guard is for
    // the race where the account is deleted mid-request.
    if (!profileRow) {
      return reply.code(404).send({ error: "not_found" });
    }

    // Each block below is scoped to this user by its own where-clause or by
    // an id list derived from one — no query trusts a parent query's join to
    // do the ownership filtering for it.
    const babyRows = await db
      .select()
      .from(babies)
      .where(eq(babies.userId, userId))
      .orderBy(asc(babies.createdAt));

    const babyIds = babyRows.map((row) => row.id);

    // Meals and symptom checks hang off babies, not off the user, so an
    // account with no babies has none of either — and `inArray` with an
    // empty list is not worth asking the database about.
    const mealRows = babyIds.length
      ? await db
          .select({
            id: meals.id,
            babyId: meals.babyId,
            recipeId: meals.recipeId,
            recipeTitle: recipes.title,
            servedAt: meals.servedAt,
            reactionNote: meals.reactionNote,
            notes: meals.notes,
            createdAt: meals.createdAt,
          })
          .from(meals)
          .leftJoin(recipes, eq(meals.recipeId, recipes.id))
          .where(inArray(meals.babyId, babyIds))
          .orderBy(asc(meals.servedAt))
      : [];

    // Nested under their meal below; read in one pass rather than per meal.
    const mealFoodRows = mealRows.length
      ? await db
          .select({
            mealId: mealFoods.mealId,
            id: foods.id,
            slug: foods.slug,
            name: foods.name,
            pantryItemId: mealFoods.pantryItemId,
          })
          .from(mealFoods)
          .innerJoin(foods, eq(mealFoods.foodId, foods.id))
          .where(
            inArray(
              mealFoods.mealId,
              mealRows.map((row) => row.id),
            ),
          )
          .orderBy(asc(foods.name))
      : [];

    const foodsByMealId = new Map<
      string,
      { id: string; slug: string; name: string; pantryItemId: string | null }[]
    >();
    for (const row of mealFoodRows) {
      const entry = { id: row.id, slug: row.slug, name: row.name, pantryItemId: row.pantryItemId };
      const existing = foodsByMealId.get(row.mealId);
      if (existing) existing.push(entry);
      else foodsByMealId.set(row.mealId, [entry]);
    }

    const symptomCheckRows = babyIds.length
      ? await db
          .select()
          .from(symptomChecks)
          .where(inArray(symptomChecks.babyId, babyIds))
          .orderBy(asc(symptomChecks.createdAt))
      : [];

    const favoriteRows = await db
      .select({
        recipeId: favorites.recipeId,
        recipeSlug: recipes.slug,
        recipeTitle: recipes.title,
        createdAt: favorites.createdAt,
      })
      .from(favorites)
      .innerJoin(recipes, eq(favorites.recipeId, recipes.id))
      .where(eq(favorites.userId, userId))
      .orderBy(asc(favorites.createdAt));

    const pantryRows = await db
      .select({
        id: pantryItems.id,
        foodId: pantryItems.foodId,
        foodName: foods.name,
        recipeId: pantryItems.recipeId,
        recipeTitle: recipes.title,
        label: pantryItems.label,
        preparedAt: pantryItems.preparedAt,
        location: pantryItems.location,
        status: pantryItems.status,
        statusChangedAt: pantryItems.statusChangedAt,
        quantityNote: pantryItems.quantityNote,
        servingsTotal: pantryItems.servingsTotal,
        servingsLeft: pantryItems.servingsLeft,
        bestBy: pantryItems.bestBy,
        notes: pantryItems.notes,
      })
      .from(pantryItems)
      // Left joins: a pantry row can be a free-text label with neither a
      // catalog food nor a recipe behind it.
      .leftJoin(foods, eq(pantryItems.foodId, foods.id))
      .leftJoin(recipes, eq(pantryItems.recipeId, recipes.id))
      .where(eq(pantryItems.userId, userId))
      // Every row, `active` and closed alike — status history is the point.
      .orderBy(asc(pantryItems.preparedAt));

    const threadRows = await db
      .select()
      .from(chatThreads)
      .where(eq(chatThreads.userId, userId))
      .orderBy(asc(chatThreads.createdAt));

    const threadIds = threadRows.map((row) => row.id);

    // One query for every message rather than one per thread, then grouped
    // in memory — an export of a long-lived account should not fan out into
    // hundreds of round trips.
    const messageRows = threadIds.length
      ? await db
          .select()
          .from(chatMessages)
          .where(inArray(chatMessages.threadId, threadIds))
          .orderBy(asc(chatMessages.createdAt))
      : [];

    const messagesByThread = new Map<string, ExportChatMessage[]>();
    for (const row of messageRows) {
      const bucket = messagesByThread.get(row.threadId);
      const message: ExportChatMessage = {
        id: row.id,
        role: row.role,
        content: row.content,
        createdAt: row.createdAt.toISOString(),
      };
      if (bucket) bucket.push(message);
      else messagesByThread.set(row.threadId, [message]);
    }

    // Status only. `encryptedKey` is deliberately not selected: the column
    // never enters this process during an export, so it cannot leak from it.
    const [aiKeyRow] = await db
      .select({ keyLast4: userAiKeys.keyLast4, lastValidatedAt: userAiKeys.lastValidatedAt })
      .from(userAiKeys)
      .where(eq(userAiKeys.userId, userId))
      .limit(1);

    const bundle: AccountExport = {
      exportVersion: ACCOUNT_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      profile: {
        id: profileRow.id,
        email: profileRow.email,
        name: profileRow.name,
        emailVerified: profileRow.emailVerified,
        createdAt: profileRow.createdAt.toISOString(),
      },
      babies: babyRows.map((row) => ({
        id: row.id,
        name: row.name,
        birthDate: row.birthDate,
        notes: row.notes,
        archivedAt: isoOrNull(row.archivedAt),
        createdAt: row.createdAt.toISOString(),
      })),
      meals: mealRows.map((row) => ({
        id: row.id,
        babyId: row.babyId,
        recipeId: row.recipeId,
        recipeTitle: row.recipeTitle,
        servedAt: row.servedAt.toISOString(),
        reactionNote: row.reactionNote,
        notes: row.notes,
        createdAt: row.createdAt.toISOString(),
        foods: foodsByMealId.get(row.id) ?? [],
      })),
      favorites: favoriteRows.map((row) => ({
        recipeId: row.recipeId,
        recipeSlug: row.recipeSlug,
        recipeTitle: row.recipeTitle,
        createdAt: row.createdAt.toISOString(),
      })),
      pantryItems: pantryRows.map((row) => ({
        id: row.id,
        foodId: row.foodId,
        foodName: row.foodName,
        recipeId: row.recipeId,
        recipeTitle: row.recipeTitle,
        label: row.label,
        preparedAt: row.preparedAt.toISOString(),
        location: row.location,
        status: row.status,
        statusChangedAt: row.statusChangedAt.toISOString(),
        quantityNote: row.quantityNote,
        servingsTotal: row.servingsTotal,
        servingsLeft: row.servingsLeft,
        bestBy: row.bestBy,
        notes: row.notes,
      })),
      symptomChecks: symptomCheckRows.map((row) => ({
        id: row.id,
        babyId: row.babyId,
        survey: row.survey,
        windowHours: row.windowHours,
        foodsConsidered: row.foodsConsidered,
        triageLevel: row.triageLevel,
        result: row.result,
        model: row.model,
        createdAt: row.createdAt.toISOString(),
      })),
      chatThreads: threadRows.map((row) => ({
        id: row.id,
        babyId: row.babyId,
        kind: row.kind,
        createdAt: row.createdAt.toISOString(),
        messages: messagesByThread.get(row.id) ?? [],
      })),
      aiKey: aiKeyRow
        ? {
            configured: true,
            last4: aiKeyRow.keyLast4,
            lastValidatedAt: isoOrNull(aiKeyRow.lastValidatedAt),
          }
        : { configured: false, last4: null, lastValidatedAt: null },
    };

    // Serialised once, by hand: returning the object would have Fastify
    // stringify it a second time after this handler has already built it.
    return reply
      .header("content-type", "application/json; charset=utf-8")
      .header("content-disposition", `attachment; filename="${accountExportFilename()}"`)
      // A data export is per-user and must never sit in a shared cache.
      .header("cache-control", "no-store")
      .send(JSON.stringify(bundle));
  });

  // -----------------------------------------------------------------------
  // DELETE /api/account — fresh re-auth, then a cascading wipe
  // -----------------------------------------------------------------------
  app.delete(
    "/api/account",
    { preHandler: [app.requireAuth, deleteRateLimit] },
    async (request, reply) => {
      const userId = currentUserId(request);

      const parsed = deleteAccountInputSchema.safeParse(request.body);
      if (!parsed.success) {
        // Covers the missing/mistyped confirmation phrase. Checked before
        // the password so a script cannot use this endpoint as a bare
        // password oracle without also knowing the phrase.
        return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten().fieldErrors });
      }

      const authContext = await app.auth.$context;

      // Which proof this account owes depends on how it signs in. A
      // credential account has a password hash to check; an OAuth-only
      // account has nothing to compare against, so freshness of the session
      // stands in for it.
      const credentialAccount = await authContext.internalAdapter.findCredentialAccount(userId);
      const passwordHash = credentialAccount?.password;

      if (passwordHash) {
        if (!parsed.data.password) {
          return reply.code(401).send({ error: "reauth_required" });
        }
        // better-auth's own hasher, reached through the public context, so
        // this stays correct if the hashing algorithm is ever reconfigured.
        const ok = await authContext.password.verify({
          hash: passwordHash,
          password: parsed.data.password,
        });
        if (!ok) {
          // Nothing has been written at this point, and nothing will be.
          return reply.code(401).send({ error: "invalid_password" });
        }
      } else {
        const sessionId = request.sessionId;
        const [sessionRow] = sessionId
          ? await db
              .select({ createdAt: session.createdAt })
              .from(session)
              .where(and(eq(session.id, sessionId), eq(session.userId, userId)))
              .limit(1)
          : [];

        const signedInAt = sessionRow?.createdAt.getTime();
        if (signedInAt === undefined || Date.now() - signedInAt > ACCOUNT_REAUTH_MAX_AGE_MS) {
          // The UI turns this into "sign in again, then delete".
          return reply.code(401).send({ error: "reauth_required" });
        }
      }

      // Sign out first: it revokes the session through better-auth and hands
      // back the exact Set-Cookie lines that clear its cookies. Doing it
      // before the wipe means a failure here leaves the account intact
      // rather than orphaning a deleted user's live cookie.
      let clearedCookies: string[] = [];
      try {
        const signOutResponse = await app.auth.api.signOut({
          headers: fromNodeHeaders(request.headers),
          asResponse: true,
        });
        clearedCookies = signOutResponse.headers.getSetCookie();
      } catch {
        // Best effort. The session row is about to be cascaded away
        // regardless, so the cookie is dead either way; the explicit clear
        // is what stops the browser from replaying it.
        const { name, attributes } = authContext.authCookies.sessionToken;
        clearedCookies = [
          [
            `${name}=`,
            "Max-Age=0",
            "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
            `Path=${attributes.path ?? "/"}`,
            attributes.httpOnly ? "HttpOnly" : "",
            attributes.secure ? "Secure" : "",
            attributes.sameSite ? `SameSite=${String(attributes.sameSite)}` : "",
          ]
            .filter(Boolean)
            .join("; "),
        ];
      }

      // One statement, therefore one transaction. Every table the account
      // owns hangs off `user` by an ON DELETE CASCADE chain, so this single
      // delete takes all of them atomically:
      //   user -> babies -> meals -> meal_foods, babies -> symptom_checks
      //   user -> favorites, pantry_items, user_ai_keys
      //   user -> chat_threads -> chat_messages
      //   user -> session, account            (better-auth's own tables)
      // Deleting rows that are already gone is a no-op, which is what makes
      // a retried request safe.
      await db.delete(user).where(eq(user.id, userId));

      if (clearedCookies.length > 0) {
        reply.header("set-cookie", clearedCookies);
      }

      return reply.code(204).send();
    },
  );
}
