import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { ALLERGEN_MAINTENANCE_DAYS, type AllergenDetail, type MealItem } from "@blw/shared";
import { ApiError } from "../lib/api.js";
import { trackingKeys } from "../features/tracking/hooks.js";
import { formatAllergenDate } from "../features/tracking/allergenRow.js";
import { AllergenDetailPage } from "./AllergenDetailPage.js";

/** SSR escapes the apostrophe, so match the copy through it. */
const NOT_FOUND_COPY = /Couldn(?:&#x27;|')t find that allergen\./;

const BABY_ID = "22222222-2222-2222-2222-222222222222";
const SLUG = "egg";
const CATALOG_FOOD_ID = "33333333-3333-3333-3333-333333333333";
const CUSTOM_FOOD_ID = "44444444-4444-4444-4444-444444444444";
const MEAL_ID = "55555555-5555-5555-5555-555555555555";

/** Local date-field arithmetic (DST-safe), so the day counts these fixtures
 * imply are the ones the row helpers compute. */
function agoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

/** The `dueAt` the server derives for an established row — the shared rule,
 * not a second copy of it. */
function dueFrom(lastExposureIso: string): string {
  return new Date(
    Date.parse(lastExposureIso) + ALLERGEN_MAINTENANCE_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
}

function detail(overrides: Partial<AllergenDetail> = {}): AllergenDetail {
  return {
    progress: {
      allergenSlug: SLUG,
      allergenName: "Egg",
      introGuidance: "Offer well-cooked egg in the morning at home.",
      exposures: 2,
      firstAt: "2026-08-01T09:00:00.000Z",
      lastServedAt: "2026-08-20T09:00:00.000Z",
      establishedAt: null,
      lastExposureAt: "2026-08-20T09:00:00.000Z",
      reactionNotedAt: null,
      dueAt: null,
      status: "started",
      overridden: false,
    },
    foods: [
      {
        id: CATALOG_FOOD_ID,
        slug: "scrambled-egg",
        name: "Scrambled egg",
        category: "protein",
        emoji: null,
        isCustom: false,
      },
      {
        id: CUSTOM_FOOD_ID,
        slug: "nans-omelette",
        name: "Nan's omelette",
        category: "protein",
        emoji: "🍳",
        isCustom: true,
      },
    ],
    exposures: [
      {
        mealId: MEAL_ID,
        servedAt: "2026-08-20T09:00:00.000Z",
        foods: [{ id: CATALOG_FOOD_ID, name: "Scrambled egg", emoji: null }],
        reaction: "mild rash",
        notes: null,
      },
    ],
    ...overrides,
  };
}

/** `useParams` only resolves inside a matching `<Route>`, so every render
 * here goes through the real `/babies/:id/allergens/:slug` path. */
function renderAtRoute(queryClient: QueryClient, slug = SLUG) {
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        MemoryRouter,
        { initialEntries: [`/babies/${BABY_ID}/allergens/${slug}`] },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: "/babies/:id/allergens/:slug",
            element: createElement(AllergenDetailPage, null),
          }),
        ),
      ),
    ),
  );
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/** A meal as GET /api/meals returns it: plate items in order, each item's id `item-<name>`. */
function mealOf(id: string, servedAt: string, names: string[], extra: Partial<MealItem> = {}): MealItem {
  const foods = names.map((name) => ({ id: `food-${name}`, slug: name.toLowerCase(), name, category: "protein" as const, storageItemId: null }));
  return {
    id,
    babyId: BABY_ID,
    servedAt,
    reactionNote: null,
    notes: null,
    recipeId: null,
    recipeTitle: null,
    foods,
    items: foods.map((food) => ({ kind: "food" as const, id: `item-${food.name}`, food, rating: null })),
    ...extra,
  };
}

/** The meals of `detail()`'s exposures, as the meals list (Home's) caches them. */
const DEFAULT_MEALS = (): MealItem[] => [
  mealOf(MEAL_ID, "2026-08-20T09:00:00.000Z", ["Banana", "Scrambled egg"], { reactionNote: "mild rash" }),
];

/** `meals`: the meals list's window (null = still loading); `single`: meals fetched on their own. */
function renderWithDetail(
  data: AllergenDetail,
  slug = SLUG,
  { meals = DEFAULT_MEALS(), single = [] }: { meals?: MealItem[] | null; single?: MealItem[] } = {},
) {
  const queryClient = newClient();
  queryClient.setQueryData(trackingKeys.allergenDetail(BABY_ID, slug), data);
  if (meals) queryClient.setQueryData([...trackingKeys.meals(BABY_ID), { limit: 100 }], { items: meals });
  for (const meal of single) queryClient.setQueryData(trackingKeys.meal(meal.id), meal);
  return renderAtRoute(queryClient, slug);
}

/** The only way to express a failed query for an SSR render — `setQueryData`
 * can only seed success. Mirrors what a 404 from the detail route produces.
 * `retryOnMount: false` keeps the observer from optimistically re-opening the
 * query (which would report `pending` again) the moment the page mounts. */
function renderWithError() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
  const key = trackingKeys.allergenDetail(BABY_ID, SLUG);
  queryClient
    .getQueryCache()
    .build(queryClient, { queryKey: key })
    .setState({ status: "error", error: new Error("not_found"), fetchStatus: "idle" });
  return renderAtRoute(queryClient);
}

describe("AllergenDetailPage states (item 189)", () => {
  it("renders skeletons and a way back while the query is still pending", () => {
    const html = renderAtRoute(newClient());
    expect(html).toContain('<span class="sr-only">Back</span>');
    expect(html).toContain('aria-label="Loading"');
    expect(html).not.toContain("Egg");
    expect(html).not.toMatch(NOT_FOUND_COPY);
  });

  it("renders 'Couldn't find that allergen.' with a BackButton for an unknown slug (404)", () => {
    const html = renderWithError();
    expect(html).toMatch(NOT_FOUND_COPY);
    expect(html).toContain('<span class="sr-only">Back</span>');
    expect(html).not.toMatch(/Meals with /);
  });
});

describe("AllergenDetailPage header + facts (item 187)", () => {
  it("shows the allergen emoji, name, status badge, facts line, and guidance", () => {
    const html = renderWithDetail(detail());
    // Item 673: the allergen's 40px plate on its allergen tint (egg = dairy), in the h1.
    expect(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)![1]).toMatch(/^<span aria-hidden="true" class="flex shrink-0 [^"]*" style="width:40px;height:40px;font-size:20px;background:var\(--color-plate-dairy\)">🥚<\/span>/);
    expect(html).toContain("Egg");
    expect(html).toContain("Started");
    expect(html).toContain("2 of 3 servings");
    // Item 651: the facts row is tabular.
    expect(html).toMatch(/<div class="[^"]*\btabular-nums\b[^"]*"><span>2 of 3 servings<\/span>/);
    expect(html).toMatch(new RegExp(`First: (?:<!-- -->)?${formatAllergenDate("2026-08-01T09:00:00.000Z")}`));
    expect(html).toMatch(new RegExp(`Last served: (?:<!-- -->)?${formatAllergenDate("2026-08-20T09:00:00.000Z")}`));
    expect(html).toContain("Offer well-cooked egg in the morning at home.");
    expect(html).toContain('<div class="flex flex-col gap-[18px] p-4">'); // item 681: A-Salmon 18px sections
  });

  // Defensive: the server cannot actually produce this row any more (an
  // override row always carries an `establishedAt`, which becomes the
  // `lastExposureAt`), but an older bundle or a hand-built cache entry can,
  // and "no serves logged yet" beats "Last served: —".
  it("falls back to the recency helper's phrasing for a row with nothing behind it at all", () => {
    const html = renderWithDetail(
      detail({
        progress: {
          ...detail().progress,
          status: "established",
          overridden: true,
          exposures: 0,
          firstAt: null,
          lastServedAt: null,
          establishedAt: null,
          lastExposureAt: null,
          dueAt: null,
        },
        exposures: [],
      }),
    );
    expect(html).toContain("no serves logged yet");
    expect(html).not.toContain("Last served:");
    expect(html).toContain("Established");
  });

  it("names the date the parent marked it, beside (not instead of) the meal log's own dates", () => {
    const marked = agoIso(3);
    const html = renderWithDetail(
      detail({
        progress: {
          ...detail().progress,
          status: "established",
          overridden: true,
          exposures: 0,
          firstAt: null,
          lastServedAt: null,
          establishedAt: marked,
          lastExposureAt: marked,
          dueAt: dueFrom(marked),
        },
        exposures: [],
      }),
    );
    expect(html).toMatch(new RegExp(`Marked established: (?:<!-- -->)?${formatAllergenDate(marked)}`));
    // The relative fact is the ladder row's job — the detail page has room
    // for the exact date, so it does not print both.
    expect(html).not.toContain("marked 3d ago");
    expect(html).not.toContain("no serves logged yet");
  });

  // The line used to be inferred from `lastExposureAt`, so it vanished the
  // moment a logged serve overtook the mark — on exactly the rows where the
  // parent has most reason to ask "when did I say this was established?".
  it("names the mark AND the last serve when the serve is the newer of the two", () => {
    const marked = agoIso(90);
    const last = agoIso(1);
    const html = renderWithDetail(
      detail({
        progress: {
          ...detail().progress,
          status: "established",
          overridden: true,
          exposures: 1,
          firstAt: marked,
          lastServedAt: last,
          establishedAt: marked,
          lastExposureAt: last,
          dueAt: dueFrom(last),
        },
      }),
    );
    expect(html).toMatch(new RegExp(`Last served: (?:<!-- -->)?${formatAllergenDate(last)}`));
    expect(html).toMatch(new RegExp(`Marked established: (?:<!-- -->)?${formatAllergenDate(marked)}`));
  });

  it("keeps the exact 'Last served' date and no mark line for a row the log established", () => {
    const html = renderWithDetail(detail());
    expect(html).toMatch(new RegExp(`Last served: (?:<!-- -->)?${formatAllergenDate("2026-08-20T09:00:00.000Z")}`));
    expect(html).not.toContain("Marked established");
  });

  it("counts down to the day the maintenance week is up", () => {
    const last = agoIso(2);
    const html = renderWithDetail(
      detail({
        progress: {
          ...detail().progress,
          status: "established",
          exposures: 3,
          lastServedAt: last,
          lastExposureAt: last,
          dueAt: dueFrom(last),
        },
      }),
    );
    expect(html).toContain("Serve again by ");
    expect(html).not.toContain("Serve again soon");
  });

  it("shows the caution badge, with the old sentence as its title, once the week is up", () => {
    const last = agoIso(ALLERGEN_MAINTENANCE_DAYS + 1);
    const html = renderWithDetail(
      detail({
        progress: {
          ...detail().progress,
          status: "established",
          exposures: 3,
          lastServedAt: last,
          lastExposureAt: last,
          dueAt: dueFrom(last),
        },
      }),
    );
    expect(html).toContain("Serve again soon");
    expect(html).toContain('title="Consider serving again soon to maintain tolerance."');
    expect(html).toContain("bg-[var(--color-caution-soft)]");
    expect(html).not.toContain("Serve again by");
  });
});

// The detail page mirrors the ladder row it opens from — same helpers, same
// copy — so the one count and the reaction badge show up here too.
describe("AllergenDetailPage serving count + reaction badge (items 370, 518)", () => {
  it("prints the count once, with no 'exposures' count below the rule", () => {
    // The fixture is a started row with two exposures.
    const html = renderWithDetail(detail());
    expect(html.split("2 of 3 servings").length - 1).toBe(1);
    expect(html).not.toMatch(/\d(?:<!-- -->)? exposures?\b/);
  });

  it("counts a not-started allergen as 0 of 3", () => {
    const html = renderWithDetail(
      detail({ progress: { ...detail().progress, status: "not_started", exposures: 0, firstAt: null, lastServedAt: null, lastExposureAt: null } }),
    );
    expect(html.split("0 of 3 servings").length - 1).toBe(1);
  });

  it("prints no count on a row the parent marked on one serve, just 'Marked by you'", () => {
    const html = renderWithDetail(
      detail({ progress: { ...detail().progress, status: "established", overridden: true, exposures: 1 } }),
    );
    expect(html).toContain("Marked by you");
    expect(html).not.toContain("of 3 servings");
    expect(html).not.toMatch(/\d(?:<!-- -->)? exposures?\b/);
  });

  it("prints no count once the log has established it", () => {
    const html = renderWithDetail(detail({ progress: { ...detail().progress, status: "established", exposures: 7 } }));
    expect(html).not.toContain("of 3 servings");
    expect(html).not.toMatch(/\d(?:<!-- -->)? exposures?\b/);
  });

  it("badges a paused row with the chip and the doctor sentence, and keeps the count (item 519)", () => {
    const reacted = agoIso(2);
    const html = renderWithDetail(
      detail({
        progress: { ...detail().progress, exposures: 1, reactionNotedAt: reacted },
      }),
    );
    expect(html).toContain("Reaction noted");
    expect(html).toContain("Consider talking to your doctor.");
    expect(html).toContain("bg-[var(--color-caution-soft)]");
    expect(html).toContain("Started");
    expect(html).toContain("1 of 3 servings");
  });

  it("badges an established row whose log holds a later reaction, without downgrading it", () => {
    const reacted = agoIso(1);
    const html = renderWithDetail(
      detail({
        progress: {
          ...detail().progress,
          status: "established",
          exposures: 4,
          lastExposureAt: reacted,
          dueAt: dueFrom(reacted),
          reactionNotedAt: reacted,
        },
      }),
    );
    expect(html).toContain("Established");
    expect(html).toContain("Reaction noted");
    expect(html).toContain("Consider talking to your doctor.");
    expect(html).not.toContain("of 3 servings");
  });

  it("stops a paused row's count at 3 of 3", () => {
    const html = renderWithDetail(
      detail({ progress: { ...detail().progress, exposures: 4, reactionNotedAt: agoIso(2) } }),
    );
    expect(html.split("3 of 3 servings").length - 1).toBe(1);
    expect(html).toContain("Reaction noted");
  });

  it("drops the badge once the parent has marked the allergen themselves", () => {
    const marked = agoIso(1);
    const html = renderWithDetail(
      detail({
        progress: {
          ...detail().progress,
          status: "established",
          overridden: true,
          establishedAt: marked,
          lastExposureAt: marked,
          dueAt: dueFrom(marked),
          reactionNotedAt: agoIso(4),
        },
      }),
    );
    expect(html).not.toContain("Reaction noted");
    expect(html).not.toContain("Consider talking to your doctor.");
  });
});

describe("AllergenDetailPage foods section (item 187)", () => {
  it("links each food to its food page and offers a 'Log meal' shortcut carrying the food id", () => {
    const html = renderWithDetail(detail());
    expect(html).toMatch(/Foods with (?:<!-- -->)?egg/);
    expect(html).toContain('href="/foods/scrambled-egg"');
    expect(html).toContain('href="/foods/nans-omelette"');
    expect(html).toContain(`href="/log-meal?food=${CATALOG_FOOD_ID}"`);
    expect(html).toContain(`href="/log-meal?food=${CUSTOM_FOOD_ID}"`);
    expect(html).toContain(">Log meal<");
    // Item 659: each food row leads with a plate (an unmapped slug falls back to its category).
    expect(html).toContain("width:32px;height:32px;font-size:16px;background:var(--color-plate-protein)");
  });

  it("badges a custom food and leaves the catalog food unbadged", () => {
    const html = renderWithDetail(detail());
    expect((html.match(/>Custom</g) ?? []).length).toBe(1);
    // Item 637: information, so the outline badge, not a tint.
    expect(html).toMatch(/class="[^"]*inset-ring-\[var\(--color-border\)\][^"]*"[^>]*>Custom</);
  });

  it("keeps the 'Log meal' link OUTSIDE the food anchor — nothing interactive nested in a link", () => {
    const html = renderWithDetail(detail());
    const anchorClose = html.indexOf("</a>");
    expect(anchorClose).toBeGreaterThan(-1);
    expect(html).not.toMatch(/<a [^>]*>(?:(?!<\/a>).)*<(?:button|a|input)\b/s);
  });
});

// Ledger 540/543: a deleted food still counts (its meals are exposures), so it
// stays listed — marked, and with nothing to log it again from.
describe("AllergenDetailPage — a deleted food", () => {
  const withDeleted = () => {
    const base = detail();
    return detail({
      foods: base.foods.map((food) => (food.id === CUSTOM_FOOD_ID ? { ...food, deleted: true } : food)),
      exposures: [{ ...base.exposures[0]!, foods: [{ id: CUSTOM_FOOD_ID, name: "Nan's omelette", emoji: null, deleted: true }] }],
    });
  };

  it("marks it (deleted) and offers no Log meal for it", () => {
    const html = renderWithDetail(withDeleted());
    expect(html).toContain('href="/foods/nans-omelette"');
    expect(html).toMatch(/Nan&#x27;s omelette(?:<!-- -->)?<span[^>]*>\u00a0(?:<!-- -->)?\(deleted\)/);
    expect(html).not.toContain(`href="/log-meal?food=${CUSTOM_FOOD_ID}"`);
    expect(html).toContain(`href="/log-meal?food=${CATALOG_FOOD_ID}"`);
  });

  it("marks it in the exposure history too, with the same muted mark as its row (ledger 555)", () => {
    const omelette = { id: CUSTOM_FOOD_ID, slug: "nans-omelette", name: "Nan's omelette", category: "protein" as const, deleted: true };
    const meal = { ...DEFAULT_MEALS()[0]!, items: [{ kind: "food" as const, id: "item-omelette", food: omelette, rating: null }] };
    const marks = renderWithDetail(withDeleted(), SLUG, { meals: [meal] }).match(
      /Nan&#x27;s omelette<span class="font-normal text-\[var\(--color-text-muted\)\]">\u00a0(?:<!-- -->)?\(deleted\)<\/span>/g,
    );
    // The food row and the meal's row.
    expect(marks).toHaveLength(2);
  });
});

// Ledger 1146: the history is the Food log's one-line rows: a tap opens the
// meal's sheet, ⋮ has Edit and Delete, the carrying item is named first.
describe("AllergenDetailPage exposure history (items 187, 1146)", () => {
  const row = (html: string, mealName: string) => {
    const start = html.lastIndexOf("<li", html.indexOf(mealName));
    return html.slice(start, html.indexOf("</li>", start));
  };
  const names = (html: string) =>
    [...html.replace(/<!-- -->/g, "").matchAll(/<span class="min-w-0 truncate text-sm[^"]*">([\s\S]*?)<\/span>/g)].map((m) => m[1]);

  it("lists each exposure as a one-line row with the Reaction label, ⋮ Actions, and no edit link", () => {
    const html = renderWithDetail(detail()).replace(/<!-- -->/g, "");
    expect(html).toMatch(/Meals with [a-z]/);
    expect(html).not.toContain(`href="/log-meal?edit=${MEAL_ID}"`);
    expect(html).toContain('<button type="button" aria-haspopup="dialog"');
    expect(html).toContain(">Reaction</span>");
    expect(html).toContain('<span class="sr-only">Reaction: </span>');
    expect(html).not.toContain("mild rash");
    expect(html).toContain('aria-label="Actions"');
  });

  it("names the carrying item(s) first, from the server's itemIds; an older server's body keeps plate order", () => {
    const meal = mealOf(MEAL_ID, "2026-08-20T09:00:00.000Z", ["Pear", "Oats", "Scrambled egg", "Banana", "Omelette"]);
    const withItems = detail({ exposures: [{ ...detail().exposures[0]!, itemIds: ["item-Scrambled egg", "item-Omelette"] }] });
    expect(names(renderWithDetail(withItems, SLUG, { meals: [meal] }))).toEqual(["Scrambled egg, Omelette"]);
    // No itemIds (an older server, or a cached body): plate order, no failure.
    expect(names(renderWithDetail(detail(), SLUG, { meals: [meal] }))).toEqual(["Pear, Oats"]);
  });

  it("keeps the list newest-first, in the order the server returned", () => {
    const older = "2026-08-02T09:00:00.000Z";
    const olderMealId = "66666666-6666-6666-6666-666666666666";
    const html = renderWithDetail(
      detail({
        exposures: [
          ...detail().exposures,
          { mealId: olderMealId, servedAt: older, foods: [{ id: CUSTOM_FOOD_ID, name: "Nan's omelette", emoji: "🍳" }], reaction: null, notes: null },
        ],
      }),
      SLUG,
      { meals: [mealOf(olderMealId, older, ["Toast"]), ...DEFAULT_MEALS()] },
    );
    expect(names(html)).toEqual(["Banana, Scrambled egg", "Toast"]);
    expect(row(html, "Toast")).not.toContain("Reaction");
  });

  it("a meal outside the meals list's window renders as the same row, from its own GET /api/meals/:id", () => {
    const oldId = "77777777-7777-4777-8777-777777777777";
    const old = mealOf(oldId, "2025-12-01T09:00:00.000Z", ["Egg muffin"]);
    const data = detail({ exposures: [{ ...detail().exposures[0]!, mealId: oldId, servedAt: old.servedAt }] });
    const html = renderWithDetail(data, SLUG, { meals: DEFAULT_MEALS(), single: [old] });
    expect(names(html)).toEqual(["Egg muffin"]);
    expect(html).toContain('<button type="button" aria-haspopup="dialog"');
  });

  it("until the meals list answers, each row holds its place at the row's height", () => {
    const html = renderWithDetail(detail(), SLUG, { meals: null });
    expect(names(html)).toEqual([]);
    expect(html).toMatch(/<li class="app-card flex flex-col justify-center rounded-\[var\(--radius-lg\)\] border px-3 h-\[92px\]">/);
  });

  const renderWithMealError = (error: Error) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
    queryClient.setQueryData(trackingKeys.allergenDetail(BABY_ID, SLUG), detail());
    queryClient.setQueryData([...trackingKeys.meals(BABY_ID), { limit: 100 }], { items: [] });
    queryClient.getQueryCache().build(queryClient, { queryKey: trackingKeys.meal(MEAL_ID) }).setState({ status: "error", error, fetchStatus: "idle" });
    return renderAtRoute(queryClient);
  };

  it("a meal that is gone (404) leaves no row; any other failure says so on the row", () => {
    expect(renderWithMealError(new ApiError(404, "not_found"))).not.toContain("<li class=\"app-card flex flex-col justify-center");
    expect(renderWithMealError(new Error("offline"))).toMatch(/Couldn(?:&#x27;|')t load this meal\./);
  });

  it("shows the empty state with the guidance nudge when nothing has been logged", () => {
    const html = renderWithDetail(detail({ exposures: [] }));
    expect(html).toContain("No servings logged yet");
    expect(html).toContain("Offer well-cooked egg in the morning at home.");
    expect(html).not.toContain('aria-haspopup="dialog"');
  });
});

describe("AllergenDetailPage mark/undo actions (item 187)", () => {
  it("offers the shared 'Mark as established' control for a not-yet-established allergen", () => {
    const html = renderWithDetail(detail());
    expect(html).toContain("Mark as established");
    expect(html).not.toContain("Marked by you");
  });

  it("offers the shared 'Marked by you · Undo' control for an override-established allergen", () => {
    const html = renderWithDetail(
      detail({ progress: { ...detail().progress, status: "established", overridden: true } }),
    );
    expect(html).toContain("Marked by you");
    expect(html).toContain(">Undo<");
    expect(html).not.toContain("Mark as established");
  });

  it("offers neither action once the meal log itself established the allergen", () => {
    const html = renderWithDetail(
      detail({ progress: { ...detail().progress, status: "established", overridden: false } }),
    );
    expect(html).not.toContain("Mark as established");
    expect(html).not.toContain("Marked by you");
  });
});

describe("AllergenDetailPage title plate follows the allergen (item 673)", () => {
  it("draws fish on the protein tint, not the egg's dairy one", () => {
    const base = detail();
    const html = renderWithDetail({ ...base, progress: { ...base.progress, allergenSlug: "fish", allergenName: "Fish" } }, "fish");
    expect(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)![1]).toMatch(
      /^<span aria-hidden="true" class="flex shrink-0 [^"]*" style="[^"]*background:var\(--color-plate-protein\)">🐟<\/span>/,
    );
  });
});

describe("AllergenDetailPage — foods that never move the ladder (ledger 836, 838)", () => {
  const MILK_ID = "66666666-6666-4666-8666-666666666666";
  const BUTTER_ID = "77777777-7777-4777-8777-777777777777";
  const YOGURT_ID = "88888888-8888-4888-8888-888888888888";
  const milkDetail = (): AllergenDetail => {
    const base = detail();
    return {
      ...base,
      progress: { ...base.progress, allergenSlug: "milk", allergenName: "Milk" },
      foods: [
        { id: BUTTER_ID, slug: "unsalted_butter", name: "Unsalted Butter", category: "dairy", emoji: null, isCustom: false, countsTowardProgress: false },
        { id: MILK_ID, slug: "milk", name: "Whole Milk", category: "dairy", emoji: null, isCustom: false, countsTowardProgress: false, countsWhenAlone: true },
        { id: YOGURT_ID, slug: "yogurt", name: "Yogurt", category: "dairy", emoji: null, isCustom: false, countsTowardProgress: true },
      ],
      exposures: [
        { mealId: MEAL_ID, servedAt: "2026-08-20T09:00:00.000Z", foods: [{ id: BUTTER_ID, name: "Unsalted Butter", emoji: null }], counted: false, reaction: null, notes: null },
        { mealId: "99999999-9999-4999-8999-999999999999", servedAt: "2026-08-19T09:00:00.000Z", foods: [{ id: YOGURT_ID, name: "Yogurt", emoji: null }], counted: true, reaction: null, notes: null },
      ],
    };
  };

  const milkMeals = () => [
    mealOf(MEAL_ID, "2026-08-20T09:00:00.000Z", ["Oats", "Unsalted Butter"]),
    mealOf("99999999-9999-4999-8999-999999999999", "2026-08-19T09:00:00.000Z", ["Yogurt"]),
  ];

  it("says why under butter, and nothing under whole milk (ledger 881b) or yogurt", () => {
    const html = renderWithDetail(milkDetail(), "milk", { meals: milkMeals() });
    expect(html).toMatch(/Doesn(?:&#x27;|')t count toward the 3 servings: almost no milk protein\./);
    expect(html).not.toContain("when served on its own");
    expect(html).not.toContain("Counts toward the 3 servings");
    // Butter's line and the one meal that didn't count.
    expect(html.match(/ount toward the 3 servings/g)).toHaveLength(2);
  });

  it("offers Log meal for whole milk (ledger 855), butter and yogurt", () => {
    const html = renderWithDetail(milkDetail(), "milk");
    expect(html).toContain(`/log-meal?food=${MILK_ID}`);
    expect(html).toContain(`/log-meal?food=${BUTTER_ID}`);
    expect(html).toContain(`/log-meal?food=${YOGURT_ID}`);
  });

  it("marks only the meal that did not count, under its food line", () => {
    const html = renderWithDetail(milkDetail(), "milk", { meals: milkMeals() });
    expect(html.match(/Didn(?:&#x27;|')t count toward the 3 servings/g)).toHaveLength(1);
    expect(html).toMatch(/<\/button><p class="text-xs text-\[var\(--color-text-muted\)\]">Didn(?:&#x27;|')t count toward the 3 servings<\/p><\/li>/);
    // Its placeholder, while the meal loads, is that row's height.
    expect(renderWithDetail(milkDetail(), "milk", { meals: null })).toContain("h-[108px]");
    // A body cached before the flag (no `counted`) reads as counted.
    const cached = milkDetail();
    cached.exposures = cached.exposures.map(({ counted: _counted, ...rest }) => rest);
    expect(renderWithDetail(cached, "milk", { meals: milkMeals() })).not.toMatch(/Didn(?:&#x27;|')t count/);
  });
});
