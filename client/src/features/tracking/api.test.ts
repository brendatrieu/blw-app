// The WIRE pin for the allergen override routes (items 364/365).
//
// Everything above this file mocks it: the hook suite mocks `./api.js`, the
// sheet's handler suite mocks the hook. So nothing else in the client can see
// what actually leaves the browser — and a build that PUT the mark with no
// body at all kept every other gate green (verify-1, mutation #9). It is the
// worst possible silent failure: the server reads an absent `establishedAt`
// as "now", so a parent who backdates the mark to March gets a row dated
// today and a maintenance countdown that restarts this week, with no error
// anywhere.
//
// Hence: assert on the `fetch` call itself — path, method, body, headers.
// Stub idiom from features/storage/api.test.ts.
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api.js";
import { deleteAllergenOverride, putAllergenOverride, putFavorite } from "./api.js";

const BABY_ID = "22222222-2222-2222-2222-222222222222";
const MARKED_IN_MARCH = "2026-03-04T08:15:00.000Z";

type Call = [string, RequestInit | undefined];

function stubFetch(response: Partial<Response> = {}): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", (path: string, init?: RequestInit) => {
    calls.push([path, init]);
    return Promise.resolve({
      ok: true,
      status: 204,
      statusText: "No Content",
      json: () => Promise.reject(new Error("a 204 has no body to parse")),
      ...response,
    } as Response);
  });
  return calls;
}

function headersOf(init: RequestInit | undefined): Record<string, string> {
  return (init?.headers ?? {}) as Record<string, string>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("putAllergenOverride (the mark)", () => {
  it("PUTs to the established route for this baby and allergen", async () => {
    const calls = stubFetch();
    await putAllergenOverride(BABY_ID, "peanut", { establishedAt: MARKED_IN_MARCH });

    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe(`/api/babies/${BABY_ID}/allergens/peanut/established`);
    expect(calls[0]![1]!.method).toBe("PUT");
  });

  it("sends the parent's instant on the wire, verbatim — never an empty body the server would read as now", async () => {
    const calls = stubFetch();
    await putAllergenOverride(BABY_ID, "peanut", { establishedAt: MARKED_IN_MARCH });

    const body = calls[0]![1]!.body;
    expect(body, "the mark must carry a body — an absent one means `now` server-side").toBeDefined();
    expect(JSON.parse(String(body))).toEqual({ establishedAt: MARKED_IN_MARCH });
  });

  it("declares JSON when it sends one, so Fastify parses the body instead of ignoring it", async () => {
    const calls = stubFetch();
    await putAllergenOverride(BABY_ID, "peanut", { establishedAt: MARKED_IN_MARCH });

    expect(headersOf(calls[0]![1])["Content-Type"]).toBe("application/json");
  });

  it("resolves on the route's 204 without trying to parse a body", async () => {
    stubFetch();
    await expect(putAllergenOverride(BABY_ID, "egg", { establishedAt: MARKED_IN_MARCH })).resolves.toBeUndefined();
  });

  it("surfaces the route's 400 (a future date) as an ApiError carrying its message", async () => {
    stubFetch({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: () => Promise.resolve({ error: "establishedAt cannot be more than 24h in the future" }),
    });

    const error: unknown = await putAllergenOverride(BABY_ID, "peanut", {
      establishedAt: "2027-01-01T00:00:00.000Z",
    }).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
    // The sheet shows "Couldn't save that", but the route's reason has to
    // survive the client so a 400 is debuggable at all.
    expect((error as ApiError).message).toBe("establishedAt cannot be more than 24h in the future");
  });
});

describe("the bodiless PUT (favorites)", () => {
  // The other half of the same wrapper: a caller with nothing to say must
  // send NO body and NOT claim JSON. An empty string with a JSON
  // Content-Type is a Fastify 400 before any handler runs.
  it("sends no body and claims no JSON", async () => {
    const calls = stubFetch();
    await putFavorite("recipe-1");

    expect(calls[0]![0]).toBe("/api/recipes/recipe-1/favorite");
    expect(calls[0]![1]!.method).toBe("PUT");
    expect(calls[0]![1]!.body).toBeUndefined();
    expect(headersOf(calls[0]![1])["Content-Type"]).toBeUndefined();
  });
});

describe("deleteAllergenOverride (undo)", () => {
  it("DELETEs the very same path the mark PUT, so undo can only ever remove the row it wrote", async () => {
    const calls = stubFetch();
    await deleteAllergenOverride(BABY_ID, "peanut");

    expect(calls[0]![0]).toBe(`/api/babies/${BABY_ID}/allergens/peanut/established`);
    expect(calls[0]![1]!.method).toBe("DELETE");
    expect(calls[0]![1]!.body).toBeUndefined();
  });
});
