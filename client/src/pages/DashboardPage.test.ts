import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { ALLERGEN_MAINTENANCE_DAYS, type AllergenProgressItem, type Baby, type StorageItem } from "@blw/shared";
import { babyKeys } from "../features/babies/api.js";
import { storageKeys } from "../features/storage/hooks.js";
import { trackingKeys } from "../features/tracking/hooks.js";
import { DashboardPage, HOME_STORAGE_LIMIT, UP_NEXT_LIMIT, upNextRows } from "./DashboardPage.js";
import type { MealItem } from "@blw/shared";

describe("DashboardPage", () => {
  it("renders without throwing (no active baby yet, in the loading/empty states)", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, null, createElement(DashboardPage, null)),
      ),
    );
    // With no babies loaded yet the page is in its loading skeleton state —
    // this is primarily a smoke test that the new sheet-based wiring doesn't
    // crash render, matching the loading branch already covered elsewhere.
    expect(typeof html).toBe("string");
  });

  it("renders an Expiring soon row's Actions menu trigger once a baby and a storage item are loaded", () => {
    const baby: Baby = {
      id: "baby-1",
      name: "Baby",
      birthDate: "2026-01-01",
      notes: null,
      archived: false,
      archivedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const item: StorageItem = {
      id: "11111111-1111-1111-1111-111111111111",
      label: null,
      foods: [{ id: "food-1", slug: "avocado", name: "Avocado", emoji: null }],
      recipeId: null,
      recipeTitle: null,
      preparedAt: "2026-08-20T10:00:00.000Z",
      location: "fridge",
      status: "active",
      statusChangedAt: "2026-08-20T10:00:00.000Z",
      expiresAt: new Date(Date.now() + 30 * 60 * 60 * 1000).toISOString(),
      useSoon: false,
      expired: false,
      quantityNote: null,
      servingsTotal: null,
      servingsLeft: null,
      bestBy: null,
      notes: null,
    };

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(babyKeys.list(false), [baby]);
    queryClient.setQueryData(storageKeys.list("active"), { items: [item] });
    queryClient.setQueryData(trackingKeys.allergenProgress(baby.id), { items: [] });
    queryClient.setQueryData([...trackingKeys.meals(baby.id), { limit: 100 }], { items: [] });

    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, null, createElement(DashboardPage, null)),
      ),
    );

    // Item 660: each Home kebab is named after its row (no two "Actions").
    expect(html).toContain('aria-label="Avocado actions"');
    expect(html).not.toContain('aria-label="Actions"');
    expect(html).toContain('aria-haspopup="menu"');
  });

  it("titles the storage section 'Storage' with a See all link to /storage, and no leftover greeting card", () => {
    const baby: Baby = {
      id: "baby-1",
      name: "Baby",
      birthDate: "2026-01-01",
      notes: null,
      archived: false,
      archivedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(babyKeys.list(false), [baby]);
    queryClient.setQueryData(storageKeys.list("active"), { items: [] });
    queryClient.setQueryData(trackingKeys.allergenProgress(baby.id), { items: [] });
    queryClient.setQueryData([...trackingKeys.meals(baby.id), { limit: 100 }], { items: [] });

    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, null, createElement(DashboardPage, null)),
      ),
    );

    expect(html).toContain(">Storage<");
    expect(html).toContain(">See all<");
    expect(html).not.toContain("Expiring soon");
    expect(html).not.toContain("See storage");
    expect(html).not.toContain("👋");
    expect(html).not.toContain("months old");
    // Item 649: the shared section heading, 10px under it, 24px between sections.
    expect(html).toMatch(/^<div class="flex flex-col gap-6 p-4">/);
    for (const title of ["Storage", "Allergens", "Food log"]) {
      expect(html, title).toContain(`<h2 class="font-h2 text-[var(--color-text)]">${title}</h2>`);
    }
    expect(html.match(/<section class="flex flex-col gap-2\.5">/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("caps Home at three storage items and three meals, each section with a See all link", () => {
    const baby: Baby = {
      id: "baby-1",
      name: "Baby",
      birthDate: "2026-01-01",
      notes: null,
      archived: false,
      archivedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const storageItem = (i: number): StorageItem => ({
      id: `storage-${i}`,
      label: null,
      foods: [{ id: `food-${i}`, slug: "avocado", name: `Storage food ${i}`, emoji: null }],
      recipeId: null,
      recipeTitle: null,
      preparedAt: "2026-08-20T10:00:00.000Z",
      location: "fridge",
      status: "active",
      statusChangedAt: "2026-08-20T10:00:00.000Z",
      expiresAt: "2099-08-23T10:00:00.000Z",
      useSoon: false,
      expired: false,
      quantityNote: null,
      servingsTotal: null,
      servingsLeft: null,
      bestBy: null,
      notes: null,
    });
    const meal = (i: number): MealItem => ({
      id: `meal-${i}`,
      babyId: baby.id,
      servedAt: new Date(2026, 7, 26 - i, 12, 0).toISOString(),
      reactionNote: null,
      notes: null,
      recipeId: null,
      recipeTitle: null,
      foods: [{ id: `food-${i}`, slug: "avocado", name: `Meal food ${i}`, category: "fruit", storageItemId: null }],
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(babyKeys.list(false), [baby]);
    queryClient.setQueryData(storageKeys.list("active"), { items: Array.from({ length: 5 }, (_, i) => storageItem(i)) });
    queryClient.setQueryData(trackingKeys.allergenProgress(baby.id), { items: [] });
    queryClient.setQueryData([...trackingKeys.meals(baby.id), { limit: 100 }], {
      items: Array.from({ length: 5 }, (_, i) => meal(i)),
    });

    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, null, createElement(DashboardPage, null)),
      ),
    );

    expect(HOME_STORAGE_LIMIT).toBe(3);
    expect((html.match(/href="\/storage\/storage-/g) ?? []).length).toBe(3);
    expect(html).not.toContain("Storage food 3");
    expect((html.match(/href="\/log-meal\?edit=meal-/g) ?? []).length).toBe(3);
    expect(html).not.toContain("Meal food 3");
    expect(html).toMatch(/<a [^>]*href="\/storage"[^>]*>See all<span aria-hidden="true">\u00a0›<\/span><\/a>/);
    expect(html).toMatch(/<a [^>]*href="\/meals"[^>]*>See all<span aria-hidden="true">\u00a0›<\/span><\/a>/);
    // Item 664: Home's food log is the grouped one.
    expect(html).toContain('aria-label="Meal food 0 actions"');
  });
});

// Item 333: Home shows the top three of the SAME ordered list the Storage
// tab does, because the order now lives in `useStorageItems`' select rather
// than in either page — so "the three most urgent" can't mean two things.
describe("DashboardPage storage ordering (item 333)", () => {
  it("takes its top three from the freshness order, not the cache's order", () => {
    const baby: Baby = {
      id: "baby-1",
      name: "Baby",
      birthDate: "2026-01-01",
      notes: null,
      archived: false,
      archivedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const hoursOut = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    const today = new Date();
    const ymdToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate(),
    ).padStart(2, "0")}`;
    const base: Omit<StorageItem, "id" | "label" | "expiresAt" | "bestBy"> = {
      foods: [],
      recipeId: null,
      recipeTitle: null,
      preparedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      location: "fridge",
      status: "active",
      statusChangedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      useSoon: false,
      expired: false,
      quantityNote: null,
      servingsTotal: null,
      servingsLeft: null,
      notes: null,
    };
    const items: StorageItem[] = [
      { ...base, id: "s-far", label: "Five days of window", expiresAt: hoursOut(120), bestBy: null },
      { ...base, id: "s-mid", label: "Three days of window", expiresAt: hoursOut(72), bestBy: null },
      { ...base, id: "s-near", label: "Thirty hours of window", expiresAt: hoursOut(30), bestBy: null },
      // Best by today ends at the next local midnight: at most 24h out,
      // whatever time this runs — so it is always first.
      { ...base, id: "s-first", label: "Best by today", expiresAt: hoursOut(120), bestBy: ymdToday },
    ];

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(babyKeys.list(false), [baby]);
    queryClient.setQueryData(storageKeys.list("active"), { items });
    queryClient.setQueryData(trackingKeys.allergenProgress(baby.id), { items: [] });
    queryClient.setQueryData([...trackingKeys.meals(baby.id), { limit: 100 }], { items: [] });

    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, null, createElement(DashboardPage, null)),
      ),
    );

    const order = ["s-first", "s-near", "s-mid", "s-far"]
      .map((id) => ({ id, at: html.indexOf(`/storage/${id}`) }))
      .filter((entry) => entry.at >= 0)
      .sort((a, b) => a.at - b.at)
      .map((entry) => entry.id);
    expect(order).toEqual(["s-first", "s-near", "s-mid"]);
    // The five-day item is the one the HOME_STORAGE_LIMIT slice drops — it
    // would have survived under the cache's own order.
    expect(html).not.toContain("Five days of window");
  });
});


// Items 660-664: the "Today" layout per A-Home.
describe("DashboardPage Today layout (items 660-664)", () => {
  const BABY: Baby = {
    id: "baby-1",
    name: "Baby",
    birthDate: "2026-01-01",
    notes: null,
    archived: false,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const hoursOut = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

  function stored(id: string, overrides: Partial<StorageItem> = {}): StorageItem {
    return {
      id,
      label: null,
      foods: [{ id: `food-${id}`, slug: "sweet-potato", name: `Food ${id}`, emoji: null }],
      recipeId: null,
      recipeTitle: null,
      preparedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      location: "fridge",
      status: "active",
      statusChangedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      expiresAt: hoursOut(24 * 10),
      useSoon: false,
      expired: false,
      quantityNote: null,
      servingsTotal: null,
      servingsLeft: null,
      bestBy: null,
      notes: null,
      ...overrides,
    };
  }
  const useSoon = (id: string, overrides: Partial<StorageItem> = {}) =>
    stored(id, { useSoon: true, expiresAt: hoursOut(20), ...overrides });

  function agoIso(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
  }

  /** An established allergen last met `days` ago, with the server's `dueAt`. */
  function allergen(slug: string, days: number, status: AllergenProgressItem["status"] = "established"): AllergenProgressItem {
    const last = agoIso(days);
    return {
      allergenSlug: slug,
      allergenName: slug[0]!.toUpperCase() + slug.slice(1),
      introGuidance: "Guidance.",
      exposures: 3,
      firstAt: last,
      lastServedAt: last,
      establishedAt: null,
      lastExposureAt: last,
      reactionNotedAt: null,
      dueAt:
        status === "established"
          ? new Date(Date.parse(last) + ALLERGEN_MAINTENANCE_DAYS * 24 * 60 * 60 * 1000).toISOString()
          : null,
      status,
      overridden: false,
    };
  }
  const due = (slug: string) => allergen(slug, ALLERGEN_MAINTENANCE_DAYS + 2);

  function render({
    storage = [],
    allergens = [],
    meals = [],
  }: {
    storage?: StorageItem[] | null;
    allergens?: AllergenProgressItem[] | null;
    meals?: MealItem[];
  }): string {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(babyKeys.list(false), [BABY]);
    if (storage) queryClient.setQueryData(storageKeys.list("active"), { items: storage });
    if (allergens) queryClient.setQueryData(trackingKeys.allergenProgress(BABY.id), { items: allergens });
    queryClient.setQueryData([...trackingKeys.meals(BABY.id), { limit: 100 }], { items: meals });
    return renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, null, createElement(DashboardPage, null)),
      ),
    );
  }

  /** The Up next card's own markup, or null when it is not rendered. */
  function upNext(html: string): string | null {
    const start = html.indexOf('aria-labelledby="up-next"');
    if (start === -1) return null;
    return html.slice(start, html.indexOf("</section>", start));
  }

  describe("Up next (item 660)", () => {
    it("is hidden when nothing is due — no card, no old 'N allergens due' line", () => {
      const html = render({ storage: [stored("fresh")], allergens: [allergen("peanut", 1), allergen("egg", 3, "started")] });
      expect(upNext(html)).toBeNull();
      expect(html).not.toContain("Up next");
      expect(html).not.toContain("due for a serve");
    });

    it("is hidden while either list is still loading", () => {
      expect(upNext(render({ storage: [useSoon("a")], allergens: null }))).toBeNull();
      expect(upNext(render({ storage: null, allergens: [due("peanut")] }))).toBeNull();
    });

    it("comes first, under an apricot uppercase 'Up next' label, above the two buttons", () => {
      const html = render({ storage: [useSoon("a")] });
      const card = upNext(html)!;
      expect(card).toContain(
        '<h2 id="up-next" class="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--color-apricot-text)]">Up next</h2>',
      );
      expect(html.indexOf("up-next")).toBeLessThan(html.indexOf('href="/log-meal"'));
      expect(html.indexOf('href="/log-meal"')).toBeLessThan(html.indexOf(">Storage<"));
    });

    it("has no big action button: one kebab and one link per row, dividers from the text", () => {
      const card = upNext(render({ storage: [useSoon("a"), useSoon("b")], allergens: [due("peanut")] }))!;
      const rows = card.match(/<li /g)?.length ?? 0;
      expect(rows).toBe(3);
      expect(card.match(/<button /g)?.length).toBe(rows);
      expect(card.match(/<a /g)?.length).toBe(rows);
      expect(card.match(/not-first:before:left-\[60px\]/g)?.length).toBe(rows);
    });

    it("a storage row: plates, name, the Use soon chip and 'N servings left' on one line, its own kebab", () => {
      const card = upNext(render({ storage: [useSoon("a", { servingsTotal: 4, servingsLeft: 3 })] }))!;
      expect(card).toContain("Food a");
      expect(card).toMatch(
        /<span class="flex items-center gap-1\.5 text-sm whitespace-nowrap text-\[var\(--color-text-muted\)\]"><span class="[^"]*">(?:(?!<\/span>).)*<\/svg>Use soon<\/span><span>3 servings<!-- --> left<\/span><\/span>/s,
      );
      expect(card).toContain('href="/storage/a"');
      expect(card).toContain('aria-label="Up next: Food a actions"');
      expect(card).toContain('aria-hidden="true" class="relative block h-[44px] w-[48px] shrink-0"');
    });

    it("leaves the servings out when they are not tracked, and says 1 serving in the singular", () => {
      expect(upNext(render({ storage: [useSoon("a")] }))!).not.toContain("serving");
      expect(upNext(render({ storage: [useSoon("a", { servingsTotal: 2, servingsLeft: 1 })] }))!).toContain(
        "1 serving<!-- --> left",
      );
    });

    it("an allergen row: '<Name> is due for a serve', when it was last served, a Log meal / Open kebab", () => {
      const card = upNext(render({ allergens: [due("peanut")] }))!;
      expect(card).toContain("Peanut is due for a serve");
      expect(card).toContain(`Last served ${ALLERGEN_MAINTENANCE_DAYS + 2} days ago`);
      expect(card).toContain('href="/babies/baby-1/allergens/peanut"');
      expect(card).toContain('aria-label="Peanut actions"');
      expect(card).toContain("🥜");
    });

    it("lists storage first, then allergens, and caps at three with See all to Storage when storage spills", () => {
      const html = render({
        storage: [useSoon("a"), useSoon("b"), useSoon("c"), useSoon("d")],
        allergens: [due("peanut")],
      });
      const card = upNext(html)!;
      expect((card.match(/<li /g) ?? []).length).toBe(UP_NEXT_LIMIT);
      expect(card).not.toContain("Food d");
      expect(card).not.toContain("Peanut");
      expect(card).toMatch(/<a [^>]*href="\/storage"[^>]*>See all<span aria-hidden="true">/);
    });

    it("sends See all to the ladder when only allergens are hidden, and shows none when nothing is", () => {
      const spill = upNext(render({ storage: [useSoon("a")], allergens: [due("peanut"), due("egg"), due("milk")] }))!;
      expect(spill.indexOf("Food a")).toBeLessThan(spill.indexOf("Peanut is due"));
      expect(spill).toContain("Egg is due");
      expect(spill).not.toContain("Milk is due");
      expect(spill).toMatch(/<a [^>]*href="\/babies\/baby-1\/allergens"[^>]*>See all<span/);
      const fits = upNext(render({ storage: [useSoon("a")], allergens: [due("peanut")] }))!;
      expect(fits).not.toContain("See all");
    });

    it("leaves expired items to Storage", () => {
      expect(upNext(render({ storage: [stored("x", { expired: true, useSoon: true, expiresAt: hoursOut(-5) })] }))).toBeNull();
    });

    it("nests no link or button inside a link", () => {
      const html = render({ storage: [useSoon("a")], allergens: [due("peanut")] });
      expect(html).not.toMatch(/<a [^>]*>(?:(?!<\/a>).)*<(?:button|a|input)\b/s);
    });
  });

  describe("upNextRows", () => {
    const now = new Date();
    it("orders use-soon storage before due allergens and says where the hidden rows are", () => {
      const result = upNextRows([stored("fresh"), useSoon("a")], [due("peanut")], now);
      expect(result.rows.map((row) => row.kind)).toEqual(["storage", "allergen"]);
      expect(result.more).toBeNull();
      expect(upNextRows([useSoon("a"), useSoon("b"), useSoon("c"), useSoon("d")], [], now).more).toBe("storage");
      expect(upNextRows([], [due("a"), due("b"), due("c"), due("d")], now).more).toBe("allergens");
      expect(upNextRows([useSoon("a"), useSoon("b"), useSoon("c")], [due("peanut")], now).more).toBe("allergens");
    });
  });

  describe("Storage rows (item 662)", () => {
    function storageSection(html: string): string {
      const start = html.indexOf(">Storage</h2>");
      return html.slice(start, html.indexOf("</section>", start));
    }

    it("is one rounded card of divided rows, not a card per item", () => {
      const section = storageSection(render({ storage: [stored("a"), stored("b")] }));
      expect((section.match(/<ul\b/g) ?? []).length).toBe(1);
      expect(section).toMatch(/<ul class="rounded-\[var\(--radius-lg\)\] border border-\[var\(--color-border\)\] bg-\[var\(--color-bg-elevated\)\]/);
      expect((section.match(/not-first:before:h-px/g) ?? []).length).toBe(2);
    });

    it("reads 'Fridge · 3 servings', or the quantity note, or just the place", () => {
      const html = render({
        storage: [
          stored("a", { servingsTotal: 4, servingsLeft: 3 }),
          stored("b", { location: "freezer", quantityNote: "6 cakes" }),
          stored("c", { location: "counter" }),
        ],
      });
      const section = storageSection(html);
      expect(section).toContain("Fridge<!-- --> · 3 servings");
      expect(section).toContain("Freezer<!-- --> · 6 cakes");
      expect(section).toMatch(/>Counter<\/span>/);
    });

    it("shows the days left big, apricot on the last day and ink before it", () => {
      const section = storageSection(
        render({ storage: [stored("one", { expiresAt: hoursOut(20) }), stored("two", { expiresAt: hoursOut(30) })] }),
      );
      expect(section).toMatch(/text-\[22px\] leading-tight font-black tabular-nums text-\[var\(--color-apricot-text\)\]">1<\/span><span class="[^"]*whitespace-nowrap[^"]*">day left</);
      expect(section).toMatch(/text-\[22px\] leading-tight font-black tabular-nums text-\[var\(--color-text\)\]">2<\/span><span class="[^"]*">days left</);
    });

    it("still says Expired for an expired item, with no day count", () => {
      const section = storageSection(render({ storage: [stored("x", { expired: true, expiresAt: hoursOut(-5) })] }));
      expect(section).toContain(">Expired<");
      expect(section).not.toContain("left<");
    });

    it("trusts the freshness rule's Expired even while the clock says time is left (server flag)", () => {
      const section = storageSection(render({ storage: [stored("x", { expired: true, expiresAt: hoursOut(30) })] }));
      expect(section).toContain(">Expired<");
      expect(section).not.toContain("left<");
    });

    it("keeps each row's stretched link and kebab", () => {
      const section = storageSection(render({ storage: [stored("a")] }));
      expect(section).toContain('href="/storage/a"');
      expect(section).toContain("after:absolute after:inset-0");
      expect(section).toMatch(/<div class="relative z-10 shrink-0"><div class="relative inline-block "><button[^>]*aria-label="Food a actions"/);
    });
  });

  describe("Allergens card (item 663)", () => {
    const ladder = [
      allergen("peanut", 1),
      allergen("egg", 2),
      allergen("milk", 3),
      allergen("wheat", 2, "started"),
      allergen("soy", 2, "started"),
      { ...allergen("fish", 0, "not_started"), exposures: 0 },
    ];

    it("titles the section 'Allergens' with a Ladder › link to the baby's ladder", () => {
      const html = render({ allergens: ladder });
      expect(html).toMatch(
        /<h2 class="font-h2 text-\[var\(--color-text\)\]">Allergens<\/h2><a class="inline-flex min-h-11 [^"]*" href="\/babies\/baby-1\/allergens"[^>]*>Ladder<span aria-hidden="true">\u00a0›<\/span><\/a>/,
      );
      expect(html).not.toContain("Allergen progress");
      expect(html).not.toContain("🌟");
    });

    it("centers the ESTABLISHED count, with the counts written out beside the ring", () => {
      const html = render({ allergens: ladder });
      expect(html).toContain('<span class="text-xl font-black tabular-nums text-[var(--color-text)]">3<!-- -->/<!-- -->9</span>');
      expect(html).toContain("3<!-- --> established");
      expect(html).toContain("2<!-- --> started · <!-- -->1<!-- --> not started yet");
      expect(html).toContain('aria-label="3 of 9 allergens established, 2 started"');
    });

    it("colors 9 segments: established, then started, then empty", () => {
      const html = render({ allergens: ladder });
      const strokes = [...html.matchAll(/<circle [^>]*stroke="var\(--color-ring-(\w+)\)"/g)].map((m) => m[1]);
      expect(strokes).toEqual([
        "established",
        "established",
        "established",
        "started",
        "started",
        "empty",
        "empty",
        "empty",
        "empty",
      ]);
    });
  });

  it("drops the emoji from the two buttons and keeps sky + mint (item 661)", () => {
    const html = render({});
    expect(html).toMatch(/<a [^>]*href="\/log-meal"[^>]*>Log meal<\/a>/);
    expect(html).toMatch(/<a [^>]*href="\/storage\/add"[^>]*>Add to storage<\/a>/);
    expect(html).not.toContain("🍽️ Log meal");
    expect(html).not.toContain("📦 Add to storage");
    // Sky and mint, 48px and 16px/800 as in A-Home.
    const logMeal = /<a [^>]*href="\/log-meal"[^>]*>/.exec(html)?.[0] ?? "";
    const addStorage = /<a [^>]*href="\/storage\/add"[^>]*>/.exec(html)?.[0] ?? "";
    expect(logMeal).toContain("bg-[var(--color-primary)]");
    expect(addStorage).toContain("bg-[var(--color-success)]");
    for (const a of [logMeal, addStorage]) expect(a).toContain("min-h-12 px-4 py-2.5 text-base font-extrabold");
  });
});
