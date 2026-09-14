// Item 302: per-user app preferences behind GET/PATCH /api/preferences.
//
// The behaviour worth pinning is not "a column can be written" but the three
// rules the first-run tour depends on: an account with no row still gets an
// answer, the "seen" timestamp is written exactly once however many times
// the endpoint is called, and neither endpoint can be reached — or steered
// at somebody else's row — without a session.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { userPreferencesSchema, type UserPreferences } from "@blw/shared";
import { createTestApp, signUpUser, usageEnvelope, type TestUser } from "./helpers.js";
import type { Database } from "../db/index.js";
import * as schema from "../db/schema.js";

describe("preferences API", () => {
  let app: FastifyInstance;
  let db: Database;
  let close: () => Promise<void>;
  let user: TestUser;

  beforeEach(async () => {
    ({ app, db, close } = await createTestApp());
    user = await signUpUser(app);
  });

  afterEach(async () => {
    await close();
  });

  const get = (cookie: string) =>
    app.inject({ method: "GET", url: "/api/preferences", headers: { cookie } });

  const patch = (cookie: string, payload: Record<string, unknown> = { tourCompleted: true }) =>
    app.inject({ method: "PATCH", url: "/api/preferences", headers: { cookie }, payload });

  it("answers with the defaults for an account that has never written a preference", async () => {
    const response = await get(user.cookie);

    expect(response.statusCode).toBe(200);
    expect(userPreferencesSchema.parse(response.json())).toEqual({
      tourCompletedAt: null,
      // Sharing is on unless the parent turns it off, and "no row" is the
      // same answer as "a row that has never been touched".
      shareUsageData: true,
    });

    // And it really is "no row", not a row quietly created by the read: a
    // GET must not have a write side effect.
    const rows = await db.select().from(schema.userPreferences);
    expect(rows).toHaveLength(0);
  });

  it("creates the row and stamps the tour as seen", async () => {
    const before = Date.now();
    const response = await patch(user.cookie);
    const after = Date.now();

    expect(response.statusCode).toBe(200);
    const body = userPreferencesSchema.parse(response.json());
    expect(body.tourCompletedAt).not.toBeNull();

    const stamped = Date.parse(body.tourCompletedAt!);
    // Second-resolution slack either side: the timestamp comes from this
    // process, so it can only sit inside the request's own window.
    expect(stamped).toBeGreaterThanOrEqual(before - 1000);
    expect(stamped).toBeLessThanOrEqual(after + 1000);

    // The next read agrees with what the write answered.
    expect((await get(user.cookie)).json<UserPreferences>()).toEqual(body);
  });

  it("never moves the timestamp on a second PATCH", async () => {
    const first = (await patch(user.cookie)).json<UserPreferences>();

    // Far enough apart that a re-stamp would be unmistakable.
    await new Promise((resolve) => setTimeout(resolve, 25));

    const second = (await patch(user.cookie)).json<UserPreferences>();
    const third = (await patch(user.cookie)).json<UserPreferences>();

    expect(second.tourCompletedAt).toBe(first.tourCompletedAt);
    expect(third.tourCompletedAt).toBe(first.tourCompletedAt);
    expect((await get(user.cookie)).json<UserPreferences>().tourCompletedAt).toBe(first.tourCompletedAt);

    // One account, one row — the repeats upserted rather than inserting.
    const rows = await db.select().from(schema.userPreferences);
    expect(rows).toHaveLength(1);
  });

  it("bumps updated_at on a repeat even though the tour timestamp is frozen", async () => {
    await patch(user.cookie);
    const [initial] = await db.select().from(schema.userPreferences);

    await new Promise((resolve) => setTimeout(resolve, 25));
    await patch(user.cookie);

    const [repeated] = await db.select().from(schema.userPreferences);
    expect(repeated!.tourCompletedAt?.toISOString()).toBe(initial!.tourCompletedAt?.toISOString());
    expect(repeated!.updatedAt.getTime()).toBeGreaterThan(initial!.updatedAt.getTime());
  });

  it("keeps one account's preferences out of another's", async () => {
    const other = await signUpUser(app, "Other Parent");

    await patch(user.cookie);

    // Not merely "null because it is always null": the account next door has
    // a stamped row, so an unscoped query would surface it here.
    expect((await get(other.cookie)).json<UserPreferences>()).toEqual({
      tourCompletedAt: null,
      shareUsageData: true,
    });

    await patch(other.cookie);
    const rows = await db.select().from(schema.userPreferences);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.userId)).size).toBe(2);

    // The first account's own timestamp is untouched by the neighbour's write.
    const mine = (await get(user.cookie)).json<UserPreferences>();
    const theirs = (await get(other.cookie)).json<UserPreferences>();
    expect(mine.tourCompletedAt).not.toBe(theirs.tourCompletedAt);
  });

  it("rejects an unauthenticated read or write", async () => {
    const read = await app.inject({ method: "GET", url: "/api/preferences" });
    expect(read.statusCode).toBe(401);
    expect(read.json()).toEqual({ error: "unauthorized" });

    const write = await app.inject({
      method: "PATCH",
      url: "/api/preferences",
      payload: { tourCompleted: true },
    });
    expect(write.statusCode).toBe(401);

    // A rejected write changed nothing.
    expect(await db.select().from(schema.userPreferences)).toHaveLength(0);
  });

  it("rejects a body that changes nothing, or that means 'un-see the tour'", async () => {
    for (const payload of [
      {},
      { tourCompleted: false },
      { tourCompleted: "yes" },
      { other: true },
      { shareUsageData: "no" },
      // A typo'd key would otherwise be a 200 that wrote nothing.
      { shareUsage: false },
    ]) {
      const response = await patch(user.cookie, payload);
      expect(response.statusCode).toBe(400);
      expect(response.json<{ error: string }>().error).toBe("invalid_request");
    }

    expect(await db.select().from(schema.userPreferences)).toHaveLength(0);
  });

  it("goes away with the account it belongs to", async () => {
    await patch(user.cookie);

    const [row] = await db.select().from(schema.userPreferences);
    await db.delete(schema.user).where(eq(schema.user.id, row!.userId));

    expect(await db.select().from(schema.userPreferences)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Item 317: the Privacy switch
// ---------------------------------------------------------------------------
// What is worth pinning here is not that a boolean round-trips, but the
// promise the Settings copy makes: "Turning this off also deletes what was
// already collected." That has to be one transaction, it has to be scoped to
// the caller, and it must not disturb the tour flag on the way past.
describe("usage sharing", () => {
  let app: FastifyInstance;
  let db: Database;
  let close: () => Promise<void>;
  let user: TestUser;

  beforeEach(async () => {
    ({ app, db, close } = await createTestApp());
    user = await signUpUser(app);
  });

  afterEach(async () => {
    await close();
  });

  const get = (cookie: string) =>
    app.inject({ method: "GET", url: "/api/preferences", headers: { cookie } });

  const patch = (cookie: string, payload: Record<string, unknown>) =>
    app.inject({ method: "PATCH", url: "/api/preferences", headers: { cookie }, payload });

  const seedEvents = async (userId: string | null, count = 3) => {
    await db.insert(schema.usageEvents).values(
      Array.from({ length: count }, () => {
        const envelope = usageEnvelope() as {
          id: string;
          name: string;
          props: unknown;
          route: string;
          appVersion: string;
          context: unknown;
          occurredAt: string;
        };
        return {
          id: envelope.id,
          userId,
          name: envelope.name,
          props: envelope.props,
          route: envelope.route,
          appVersion: envelope.appVersion,
          context: envelope.context,
          occurredAt: new Date(envelope.occurredAt),
        };
      }),
    );
  };

  it("turns sharing off and deletes what was already collected", async () => {
    await seedEvents(await currentUserId(db, user.email));

    const response = await patch(user.cookie, { shareUsageData: false });

    expect(response.statusCode).toBe(200);
    expect(userPreferencesSchema.parse(response.json())).toEqual({
      tourCompletedAt: null,
      shareUsageData: false,
    });
    expect(await db.select().from(schema.usageEvents)).toHaveLength(0);
    expect((await get(user.cookie)).json<UserPreferences>().shareUsageData).toBe(false);
  });

  it("deletes only the caller's events", async () => {
    const other = await signUpUser(app, "Other Parent");
    const mine = await currentUserId(db, user.email);
    const theirs = await currentUserId(db, other.email);
    await seedEvents(mine, 2);
    await seedEvents(theirs, 2);
    // Anonymous rows (the sign-in screen) belong to nobody and stay.
    await seedEvents(null, 1);

    await patch(user.cookie, { shareUsageData: false });

    const left = await db.select().from(schema.usageEvents);
    expect(left).toHaveLength(3);
    expect(left.every((row) => row.userId !== mine)).toBe(true);
  });

  it("turns sharing back on without resurrecting anything", async () => {
    await seedEvents(await currentUserId(db, user.email));
    await patch(user.cookie, { shareUsageData: false });

    const back = await patch(user.cookie, { shareUsageData: true });

    expect(userPreferencesSchema.parse(back.json()).shareUsageData).toBe(true);
    // Deleted is deleted: consenting again starts from empty.
    expect(await db.select().from(schema.usageEvents)).toHaveLength(0);
  });

  it("updates only the key it was given, in both directions", async () => {
    // Sharing off first, then the tour finishes: the tour must not switch
    // sharing back on.
    await patch(user.cookie, { shareUsageData: false });
    const afterTour = userPreferencesSchema.parse((await patch(user.cookie, { tourCompleted: true })).json());
    expect(afterTour.shareUsageData).toBe(false);
    expect(afterTour.tourCompletedAt).not.toBeNull();

    // And the Privacy switch must not blank the tour stamp on the way back.
    const afterShare = userPreferencesSchema.parse(
      (await patch(user.cookie, { shareUsageData: true })).json(),
    );
    expect(afterShare.shareUsageData).toBe(true);
    expect(afterShare.tourCompletedAt).toBe(afterTour.tourCompletedAt);
  });

  it("creates the row from a sharing change alone, leaving the tour unseen", async () => {
    await patch(user.cookie, { shareUsageData: false });

    const [row] = await db.select().from(schema.userPreferences);
    expect(row?.tourCompletedAt).toBeNull();
    expect(row?.shareUsageData).toBe(false);
  });
});

/** The id better-auth assigned to a signed-up test user. */
async function currentUserId(db: Database, email: string): Promise<string> {
  const [row] = await db.select().from(schema.user).where(eq(schema.user.email, email)).limit(1);
  if (!row) throw new Error(`no user row for ${email}`);
  return row.id;
}
