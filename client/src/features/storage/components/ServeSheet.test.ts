import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { StorageItem } from "@blw/shared";
import { CelebrationProvider } from "../../../components/ui/Celebration.js";
import { SheetPanel } from "../../../components/ui/Sheet.js";
import {
  buildServeInput,
  ServeControl,
  ServeSheet,
  serveRatingRows,
  serveRatingsInput,
  servedRecipes,
  type ServePart,
} from "./ServeSheet.js";

const BASE_ITEM: StorageItem = {
  id: "11111111-1111-1111-1111-111111111111",
  label: null,
  foods: [{ id: "food-1", slug: "avocado", name: "Avocado", emoji: null }],
  recipeId: null,
  recipeTitle: null,
  preparedAt: "2026-08-20T10:00:00.000Z",
  location: "fridge",
  status: "active",
  statusChangedAt: "2026-08-20T10:00:00.000Z",
  expiresAt: "2026-08-23T10:00:00.000Z",
  useSoon: false,
  expired: false,
  quantityNote: null,
  servingsTotal: null,
  servingsLeft: null,
  bestBy: null,
  notes: null,
};

// MR-Serve's sitting: two recipe containers, a container of foods, and a
// fresh banana. Egg is in "Broccoli + Egg" AND an ingredient of Salmon Cakes.
const LENTIL = "aaaaaaaa-0000-0000-0000-000000000001";
const SALMON = "aaaaaaaa-0000-0000-0000-000000000002";
const LENTIL_ITEM: StorageItem = {
  ...BASE_ITEM,
  id: "bbbbbbbb-0000-0000-0000-000000000001",
  foods: [],
  recipeId: LENTIL,
  recipeTitle: "Lentil Patties",
  servingsTotal: 8,
  servingsLeft: 7,
};
const SALMON_ITEM: StorageItem = {
  ...LENTIL_ITEM,
  id: "bbbbbbbb-0000-0000-0000-000000000002",
  recipeId: SALMON,
  recipeTitle: "Salmon Cakes",
  location: "freezer",
};
const BROCCOLI_EGG: StorageItem = {
  ...BASE_ITEM,
  id: "bbbbbbbb-0000-0000-0000-000000000003",
  foods: [
    { id: "food-broccoli", slug: "broccoli", name: "Broccoli", emoji: null },
    { id: "food-egg", slug: "egg", name: "Egg", emoji: null },
  ],
};
const BANANA = { id: "food-banana", slug: "banana", name: "Banana", category: "fruit" as const, emoji: null };
const PARTS: ServePart[] = [
  { item: LENTIL_ITEM, servings: 1 },
  { item: SALMON_ITEM, servings: 2 },
  { item: BROCCOLI_EGG, servings: 1 },
];

function render(element: ReturnType<typeof createElement>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(CelebrationProvider, null, createElement(MemoryRouter, null, element)),
    ),
  );
}

const SERVED_AT = new Date("2026-08-21T12:34:00.000Z");

describe("buildServeInput (ledger 760: POST /api/storage/serve)", () => {
  it("sends every container with its own servings, in the Serving list's order, and trims both notes to null when blank", () => {
    expect(buildServeInput("baby-1", PARTS, [], [], "  ", "", SERVED_AT)).toEqual({
      babyId: "baby-1",
      parts: [
        { storageItemId: LENTIL_ITEM.id, servings: 1 },
        { storageItemId: SALMON_ITEM.id, servings: 2 },
        { storageItemId: BROCCOLI_EGG.id, servings: 1 },
      ],
      servedAt: "2026-08-21T12:34:00.000Z",
      reactionNote: null,
      notes: null,
    });
  });

  it("adds fresh foods and recipes only when there are some, and keeps trimmed note text", () => {
    expect(
      buildServeInput("baby-1", PARTS.slice(0, 1), [BANANA], [{ id: SALMON, title: "Salmon Cakes" }], " mild rash ", " froze the rest ", SERVED_AT),
    ).toEqual({
      babyId: "baby-1",
      parts: [{ storageItemId: LENTIL_ITEM.id, servings: 1 }],
      foodIds: ["food-banana"],
      recipeIds: [SALMON],
      servedAt: "2026-08-21T12:34:00.000Z",
      reactionNote: "mild rash",
      notes: "froze the rest",
    });
  });

  it("sends the chosen time as an ISO string, so the server takes it verbatim (item 354)", () => {
    const chosen = new Date("2026-08-21T09:05:00.000Z");
    expect(buildServeInput("baby-1", PARTS, [], [], "", "", chosen).servedAt).toBe(chosen.toISOString());
  });
});

describe("servedRecipes — the meal's recipes in the server's order (DESIGN-B §5)", () => {
  it("lists each container's recipes in Serving order, then the fresh ones, once each", () => {
    expect(servedRecipes(PARTS, [{ id: "r-fresh", title: "Oat Pancakes" }])).toEqual([
      { id: LENTIL, title: "Lentil Patties" },
      { id: SALMON, title: "Salmon Cakes" },
      { id: "r-fresh", title: "Oat Pancakes" },
    ]);
    // Fridge and freezer containers of one recipe, and a fresh one of it too:
    // one recipe on the meal, so one star row.
    const freezerLentils = { item: { ...LENTIL_ITEM, id: "bbbbbbbb-0000-0000-0000-000000000009" }, servings: 1 };
    expect(servedRecipes([PARTS[0]!, freezerLentils], [{ id: LENTIL, title: "Lentil Patties" }])).toEqual([
      { id: LENTIL, title: "Lentil Patties" },
    ]);
  });

  it("reads every recipe of a several-recipe leftovers container (ledger 753)", () => {
    const both = { ...LENTIL_ITEM, recipes: [{ id: LENTIL, title: "Lentil Patties" }, { id: SALMON, title: "Salmon Cakes" }] };
    expect(servedRecipes([{ item: both, servings: 1 }], []).map((recipe) => recipe.id)).toEqual([LENTIL, SALMON]);
  });
});

describe("serveRatingRows — DESIGN-B §2's one rule (ledger 760)", () => {
  const SALMON_INGREDIENTS = new Set(["food-salmon", "food-egg", "food-oats"]);

  it("MR-Serve: one row per recipe, then one per food not in any served recipe (Egg is rated through Salmon Cakes)", () => {
    expect(serveRatingRows(PARTS, [BANANA], [], SALMON_INGREDIENTS, {})).toEqual([
      { key: `recipe:${LENTIL}`, label: "Lentil Patties", value: null },
      { key: `recipe:${SALMON}`, label: "Salmon Cakes", value: null },
      { key: "food-broccoli", label: "Broccoli", value: null },
      { key: "food-banana", label: "Banana", value: null },
    ]);
  });

  it("shows no food row while a served recipe's ingredients are still loading", () => {
    expect(serveRatingRows(PARTS, [BANANA], [], null, {}).map((row) => row.key)).toEqual([`recipe:${LENTIL}`, `recipe:${SALMON}`]);
  });

  it("rates a food-only serve per food, without waiting on anything", () => {
    expect(serveRatingRows([{ item: BASE_ITEM, servings: 1 }], [], [], null, { "food-1": 4 })).toEqual([
      { key: "food-1", label: "Avocado", value: 4 },
    ]);
  });

  it("a fresh food that is also in a container gets one row", () => {
    const egg = { id: "food-egg", slug: "egg", name: "Egg", category: "protein" as const, emoji: null };
    expect(serveRatingRows([PARTS[2]!], [egg], [], new Set(), {}).map((row) => row.key)).toEqual(["food-broccoli", "food-egg"]);
  });
});

describe("serveRatingsInput — only stars the parent chose, on rows they can see", () => {
  it("sends nothing when no star is chosen, so an unrated serve has no rating key", () => {
    expect(serveRatingsInput(serveRatingRows(PARTS, [BANANA], [], new Set(), {}))).toEqual({});
    expect(serveRatingsInput([{ key: "food-1", label: "Avocado", value: null }])).toEqual({});
  });

  it("splits recipe rows into recipeRatings and food rows into foodRatings", () => {
    const rows = serveRatingRows(PARTS, [BANANA], [], new Set(["food-egg"]), {
      [`recipe:${SALMON}`]: 5,
      "food-broccoli": 3,
      "food-egg": 2, // not a row (an ingredient), so never sent
    });
    expect(serveRatingsInput(rows)).toEqual({ recipeRatings: { [SALMON]: 5 }, foodRatings: { "food-broccoli": 3 } });
  });
});

const RATING_HEADING = 'Rating<!-- --> <span class="font-normal text-[var(--color-text-muted)]">(optional)</span>';

describe("ServeControl — the serve sheet's body (MR-Serve, ledger 760)", () => {
  const html = render(createElement(ServeControl, { item: { ...BASE_ITEM, servingsTotal: 8, servingsLeft: 7 }, babyId: "baby-1" }));

  it("opens on the Serving list: the tapped container with its own −/+ and its place and servings left", () => {
    expect(html).toContain('id="serve-serving"');
    expect(html).toContain(">Serving</span>");
    expect(html).toContain('aria-label="Servings: Avocado"');
    expect(html).toContain('aria-label="Decrease servings"');
    expect(html).toContain('aria-label="Increase servings"');
    expect(html).toContain(">Fridge · 7 of 8 left</span>");
    // Item 651: the stepper count is tabular, so 9 -> 10 doesn't jiggle.
    expect(html).toMatch(/<span aria-live="polite" class="[^"]*\btabular-nums\b[^"]*">1<\/span>/);
    expect(html).not.toContain(">Confirm<");
  });

  it("offers '+ Add more' under the list, before When", () => {
    expect(html).toContain(">+ Add more</button>");
    expect(html.indexOf(">+ Add more<")).toBeLessThan(html.indexOf('id="serve-when"'));
    expect(html.indexOf(">Serving<")).toBeLessThan(html.indexOf(">+ Add more<"));
    // The Add more sheet only exists once it is tapped.
    expect(html).not.toContain('role="dialog"');
  });

  it("shows both note fields inline, label normal and '(optional)' muted (item 736)", () => {
    expect(html).toContain('Reaction<!-- --> <span class="font-normal text-[var(--color-text-muted)]">(optional)</span>');
    expect(html).toContain("Only for hives, vomiting, rash or other reaction signs.");
    expect(html).toContain('Note<!-- --> <span class="font-normal text-[var(--color-text-muted)]">(optional)</span>');
    expect((html.match(/<textarea/g) ?? []).length).toBe(2);
  });

  it("puts the notes ABOVE a single primary Serve button, with no Cancel", () => {
    expect(html).toContain(">Serve</button>");
    expect(html.lastIndexOf("<textarea")).toBeLessThan(html.indexOf(">Serve</button>"));
    expect(html).not.toContain(">Cancel<");
    // How-to (1) + stepper (2) + Add more (1) + When (1) + 5 stars + Serve (1).
    expect((html.match(/<button/g) ?? []).length).toBe(11);
  });

  it("keeps the stepper and stars at the 44px tap target, and Add more 48px tall", () => {
    expect((html.match(/h-11 w-11/g) ?? []).length).toBe(7);
    expect(html).toMatch(/class="flex min-h-12 [^"]*border-dashed[^"]*"[^>]*>\+ Add more/);
    expect(html).toMatch(/id="serve-when"[^>]*class="[^"]*min-h-11/);
  });

  it("asks WHEN it was served, above the stars and the note fields (item 354)", () => {
    expect(html).toContain(">When</label>");
    expect(html.indexOf('id="serve-when"')).toBeLessThan(html.indexOf(RATING_HEADING));
    expect(html.indexOf(RATING_HEADING)).toBeLessThan(html.indexOf("<textarea"));
  });
});

describe("ServeControl offline, through the real online signal (ledger 766)", () => {
  it("renders Serve disabled with \"You're offline.\" under it, described by it; online it has neither", () => {
    const control = () => render(createElement(ServeControl, { item: BASE_ITEM, babyId: "baby-1" }));
    const online = control();
    const serveButton = (html: string) => html.match(/<button ([^>]*)>Serve<\/button><div role="status">(.*?)<\/div>/)!;
    expect(serveButton(online)[1]).not.toContain('disabled=""');
    expect(serveButton(online)[1]).not.toContain("aria-describedby");
    expect(serveButton(online)[2]).toBe("");
    onlineManager.setOnline(false);
    try {
      const [, attrs, status] = serveButton(control());
      expect(attrs).toContain('disabled=""');
      expect(attrs).toContain('aria-describedby="serve-offline"');
      expect(status).toMatch(/^<p id="serve-offline" class="[^"]*">You&#x27;re offline\.<\/p>$/);
    } finally {
      onlineManager.setOnline(true);
    }
  });
});

describe("the Serve sheet's How-to link (item 714)", () => {
  it("lifts its text 2.5px above center inside the same 44px box (pb-[5px] on a centered min-h-11)", () => {
    const html = render(createElement(ServeControl, { item: BASE_ITEM, babyId: "baby-1" }));
    const button = html.match(/<button[^>]*>(?=<span aria-hidden="true">📖)/)?.[0] ?? "";
    expect(button).toMatch(/class="-my-3 inline-flex min-h-11 items-center [^"]* pb-\[5px\]"/);
    expect(button).not.toMatch(/\bp[ty]-|\bpb-(?!\[5px\])|\bm[tb]-/);
    expect(html).toContain("How to serve from storage");
  });
});

describe("the Serve sheet's star rows on first open", () => {
  it("rates a food container per food", () => {
    const html = render(createElement(ServeControl, { item: BASE_ITEM, babyId: "baby-1" }));
    expect((html.match(/role="radiogroup"/g) ?? []).length).toBe(1);
    expect(html).toContain('aria-label="Rating for Avocado"');
    expect(html).not.toContain('aria-checked="true"');
    expect(html).not.toContain(">Clear<");
  });

  it("rates a recipe container once, as the recipe", () => {
    const html = render(createElement(ServeControl, { item: SALMON_ITEM, babyId: "baby-1" }));
    expect((html.match(/role="radiogroup"/g) ?? []).length).toBe(1);
    expect(html).toContain('aria-label="Rating for Salmon Cakes"');
    // Its plate is the stand-in a recipe container gets on Storage.
    expect(html).toContain(">🍲</span>");
  });
});

describe("ServeSheet", () => {
  it("renders nothing while closed", () => {
    const html = render(createElement(ServeSheet, { item: BASE_ITEM, babyId: "baby-1", open: false, onClose: () => {} }));
    expect(html).not.toContain('role="dialog"');
  });

  // The open sheet portals into `document.body`, which the node test env
  // doesn't have — so the wiring is read off the element ServeSheet returns.
  it("is titled just 'Serve' (MR-Serve) and asks for the header X", () => {
    const element = ServeSheet({ item: BASE_ITEM, babyId: "baby-1", open: true, onClose: () => {} }) as ReactElement<{
      title: string;
      showClose: boolean;
      open: boolean;
    }>;
    expect(element.props.title).toBe("Serve");
    expect(element.props.showClose).toBe(true);
    expect(element.props.open).toBe(true);
  });

  it("closes itself, then hands the serve to the page's Undo", () => {
    const calls: string[] = [];
    const element = ServeSheet({
      item: BASE_ITEM,
      babyId: "baby-1",
      open: true,
      onClose: () => calls.push("close"),
      onServed: (response) => calls.push(`served ${response.meal.id}`),
    }) as ReactElement<{ children: ReactElement<{ onServed: (response: unknown) => void }> }>;
    element.props.children.props.onServed({ meal: { id: "m1" }, items: [] });
    expect(calls).toEqual(["close", "served m1"]);
  });

  it("puts the sheet's close X at the LEFT of its header row, before the title", () => {
    const html = renderToString(createElement(SheetPanel, { title: "Serve", showClose: true, onClose: () => {}, children: "body" }));
    expect(html).toContain('aria-label="Serve"');
    expect(html.indexOf('aria-label="Close"')).toBeLessThan(html.indexOf("Serve</h2>"));
    expect(html).toMatch(/aria-label="Close"[^>]*class="[^"]*h-11 w-11/);
    // Item 737: the header stays pinned while the long sheet scrolls.
    expect(html).toMatch(/data-sheet-header="" class="sticky top-0/);
  });
});
