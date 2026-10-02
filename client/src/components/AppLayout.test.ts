import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { ageInMonths, type Baby } from "@blw/shared";
import { babyKeys } from "../features/babies/api.js";
import { trackingKeys } from "../features/tracking/hooks.js";
import { AppLayout, shouldScrollToTop } from "./AppLayout.js";

function renderLayout(queryClient: QueryClient, pathname = "/") {
  return renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        MemoryRouter,
        { initialEntries: [pathname] },
        createElement(Routes, null, createElement(Route, { path: pathname, element: createElement(AppLayout, null) }, createElement(Route, { index: true, element: createElement("div", null, "content") }))),
      ),
    ),
  );
}

describe("AppLayout header", () => {
  it("renders a single gear settings link, not the old initial-circle avatar menu", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderLayout(queryClient);

    expect(html).toContain('aria-label="Settings"');
    expect(html).toContain('href="/settings"');
    expect(html).toMatch(/aria-label="Settings"[^>]*class="[^"]*min-h-11[^"]*min-w-11/);
    expect(html).not.toContain('aria-haspopup="menu"');
    expect(html).not.toContain("Sign out");
  });

  it("shows the time-of-day greeting alongside the baby's name and age", () => {
    const baby: Baby = {
      id: "baby-1",
      name: "Remy",
      birthDate: "2026-01-01",
      notes: null,
      archived: false,
      archivedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(babyKeys.list(false), [baby]);

    const html = renderLayout(queryClient);

    expect(html).toContain("Remy");
    expect(/Good morning|Good afternoon|Good evening/.test(html)).toBe(true);
  });

  // Item 650: the greeting is a small uppercase apricot label (no sun/moon
  // icon), and the age sits beside the Fraunces name, never inside it.
  const baby = (id: string, name: string): Baby => ({
    id,
    name,
    birthDate: "2026-01-01",
    notes: null,
    archived: false,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const GREETING = /<span class="([^"]*)">(Good morning|Good afternoon|Good evening)<\/span>/;

  for (const babies of [[baby("baby-1", "Remy")], [baby("baby-1", "Remy"), baby("baby-2", "Ada")]]) {
    it(`greeting is an 11px/800/0.14em uppercase apricot label with no icon (${babies.length} baby)`, () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      queryClient.setQueryData(babyKeys.list(false), babies);
      const html = renderLayout(queryClient);

      const greeting = GREETING.exec(html);
      expect(greeting, html.slice(0, 1200)).not.toBeNull();
      expect(greeting![1]!.split(" ")).toEqual(
        expect.arrayContaining(["text-[11px]", "leading-[normal]", "font-extrabold", "uppercase", "tracking-[0.14em]", "text-[var(--color-apricot-text)]"]),
      );
      const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
      // Only the gear icon is left in the header.
      expect(header.match(/<svg/g)).toHaveLength(1);
      // The age label is muted 14px, regular weight, and outside the name.
      expect(header).toMatch(/<span class="text-sm whitespace-nowrap text-\[var\(--color-text-muted\)\]">\d+ months?<\/span>/);
      expect(header).not.toMatch(/class="font-display[^"]*"[^>]*>[^<]*<span/);
      // Item 648: the baby name (or the multi-baby picker) is the Fraunces display face.
      expect(header).toMatch(babies.length === 1 ? /<span class="font-display [^"]*">Remy<\/span>/ : /<select class="font-display /);
    });
  }
});

describe("AppLayout Home header: foods tried (item 680)", () => {
  const mila: Baby = {
    id: "baby-1",
    name: "Mila",
    birthDate: "2026-01-01",
    notes: null,
    archived: false,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const months = ageInMonths(mila.birthDate);

  function homeWith(progress: unknown, babies: Baby[] = [mila]) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(babyKeys.list(false), babies);
    if (progress !== undefined) queryClient.setQueryData(trackingKeys.allergenProgress("baby-1"), progress);
    const html = renderLayout(queryClient);
    return html.slice(html.indexOf("<header"), html.indexOf("</header>"));
  }

  it("appends '· N foods tried' to the age, singular for one, for one baby or several", () => {
    for (const babies of [[mila], [mila, { ...mila, id: "baby-2", name: "Ada" }]]) {
      expect(homeWith({ items: [], foodsTried: 23 }, babies)).toContain(`>${months} months · 23 foods tried</span>`);
      expect(homeWith({ items: [], foodsTried: 1 }, babies)).toContain(`>${months} months · 1 food tried</span>`);
      expect(homeWith({ items: [], foodsTried: 0 }, babies)).toContain(`>${months} months · 0 foods tried</span>`);
    }
  });

  it("shows the age alone while loading or from an older cache without foodsTried", () => {
    for (const progress of [undefined, { items: [] }]) {
      const html = homeWith(progress);
      expect(html).toContain(`>${months} months</span>`);
      expect(html).not.toContain("tried");
    }
  });
});

describe("AppLayout slim inner-page header (items 654/655)", () => {
  const remy: Baby = {
    id: "baby-1",
    name: "Remy",
    birthDate: "2026-01-01",
    notes: null,
    archived: false,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const ada: Baby = { ...remy, id: "baby-2", name: "Ada", birthDate: "2025-06-01" };
  const GREETING = /Good morning|Good afternoon|Good evening/;

  function layoutWith(babies: Baby[], pathname: string) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(babyKeys.list(false), babies);
    return renderLayout(queryClient, pathname);
  }
  function header(html: string) {
    return html.slice(html.indexOf("<header"), html.indexOf("</header>"));
  }

  it("inner pages show the 'Name · N mo' apricot chip instead of the greeting", () => {
    const html = header(layoutWith([remy], "/foods"));
    // Only the name truncates; the age sits in its own non-shrinking span (N4).
    expect(html).toContain(
      `<span class="truncate">Remy</span><span class="shrink-0 whitespace-pre"> · ${ageInMonths(remy.birthDate)} mo</span>`,
    );
    expect(html).not.toMatch(GREETING);
    // Apricot soft chip with ink label; the avatar disc holds the initial in avatar ink (item 675).
    expect(html).toMatch(/class="[^"]*bg-\[var\(--color-apricot-soft\)\][^"]*text-\[var\(--color-text\)\]/);
    expect(html).toMatch(/<span aria-hidden="true" class="[^"]*bg-\[var\(--color-avatar\)\][^"]*text-\[var\(--color-avatar-ink\)\][^"]*">R<\/span>/);
    // One baby: nothing to pick, so no picker.
    expect(html).not.toContain("<select");
  });

  it("Home keeps the tall greeting header and no chip", () => {
    const html = header(layoutWith([remy], "/"));
    expect(html).toMatch(GREETING);
    expect(html).not.toContain(" mo<");
    expect(html).not.toContain("--color-apricot-soft");
  });

  it("several babies: the chip carries the same native switcher, labeled for assistive tech", () => {
    const html = header(layoutWith([remy, ada], "/foods"));
    expect(html).toContain('<span class="sr-only">Active baby</span>');
    expect(html).toContain("<select");
    expect(html).toMatch(/<option value="baby-1"[^>]*>Remy<\/option>/);
    expect(html).toMatch(/<option value="baby-2"[^>]*>Ada<\/option>/);
    // The 44px target is the select's wrapper; the visual chip is hidden from AT (the select names it).
    expect(html).toMatch(/<label class="relative flex min-h-11 /);
    expect(html).toMatch(/<span aria-hidden="true" class="inline-flex h-9 /);
  });

  it("no (unarchived) babies: the chip is the accent 'Add a baby' link to Settings", () => {
    const html = header(layoutWith([], "/foods"));
    const link = html.match(/<a [^>]*>Add a baby<\/a>/)?.[0] ?? "";
    expect(link).toContain('style="color:var(--color-accent)"');
    expect(link).toContain('href="/settings"');
    // A 44px target that still fits the 52px row (B1).
    expect(link).toMatch(/class="inline-flex min-h-11 items-center /);
    expect(html).not.toContain("--color-apricot-soft");
  });

  it("the gear is the kebab icon color and the header is sticky, never fixed, on every page", () => {
    for (const pathname of ["/", "/foods"]) {
      const html = layoutWith([remy], pathname);
      expect(html, pathname).toMatch(/aria-label="Settings"[^>]*class="[^"]*text-\[var\(--color-icon\)\]/);
      expect(html, pathname).not.toMatch(/aria-label="Settings"[^>]*class="[^"]*--color-text-muted/);
      // The gear itself goes to Settings (not just some other /settings link on the page).
      expect(html.match(/<a [^>]*aria-label="Settings"[^>]*>/)?.[0], pathname).toContain('href="/settings"');
      const headerClasses = html.match(/<header class="([^"]*)"/)![1]!.split(" ");
      expect(headerClasses, pathname).toContain("sticky");
      expect(headerClasses, pathname).not.toContain("fixed");
      expect(html.match(/<header [^>]*style="([^"]*)"/)![1], pathname).not.toContain("position");
    }
  });

  it("keeps the header pinned (sticky top-0) and in order: back slot, chip, gear on the right", () => {
    for (const p of ["/", "/foods"]) {
      expect(header(layoutWith([remy], p)), p).toMatch(/^<header class="sticky top-0 z-20 flex justify-between gap-3 px-4 /);
    }
    // A-Home tops the gear with the greeting; inner rows center (item 679).
    expect(header(layoutWith([remy], "/"))).toMatch(/^<header class="[^"]*\bitems-start py-2\.5"/);
    expect(header(layoutWith([remy], "/foods"))).toMatch(/^<header class="[^"]*\bitems-center py-1"/);
    expect(header(layoutWith([remy], "/foods"))).toMatch(
      /<div class="flex min-h-11 shrink-0 items-center"><\/div><div class="flex min-w-0 items-center gap-1"><span [^>]*>.*?Remy.*?<\/span><a [^>]*aria-label="Settings"/s,
    );
  });

  it("the header out-stacks card action rows, and the portaled overlays out-stack it (item 674)", () => {
    // Card action rows are \`relative z-10\` and come after the header in the
    // tree, so a tie let them paint over it while scrolling under it.
    const z = (source: string, re: RegExp) => Number(re.exec(source)?.[1]);
    const src = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
    const headerZ = z(header(layoutWith([remy], "/foods")), /^<header class="[^"]*\bz-(\d+)\b/);
    for (const card of ["../features/storage/components/StorageItemCard.tsx", "../features/tracking/components/ServeLogList.tsx"]) {
      expect(headerZ, card).toBeGreaterThan(z(src(card), /"relative z-(\d+) flex shrink-0/));
    }
    // Menu portals to body AFTER the header, so a tie still floats it above; Sheet/Dialog sit higher.
    expect(headerZ).toBeLessThanOrEqual(z(src("./ui/Menu.tsx"), /className="z-(\d+) min-w-40/));
    for (const overlay of ["./ui/Sheet.tsx", "./ui/Dialog.tsx"]) {
      expect(headerZ, overlay).toBeLessThan(z(src(overlay), /"fixed inset-0 z-(\d+) /));
    }
  });

  it("is the page's own color with no line on every page, like A-Home/A-Salmon (item 679)", () => {
    for (const p of ["/", "/foods"]) {
      const open = header(layoutWith([remy], p)).match(/^<header [^>]*>/)![0];
      expect(open, p).toContain("background-color:var(--color-bg);");
      expect(open, p).not.toContain("--color-bg-elevated");
      expect(open, p).not.toMatch(/\bborder/);
    }
  });

  it("inner pages are one slim row (py-1 + 44px targets = 52px); Home keeps its taller padding", () => {
    const inner = layoutWith([remy], "/foods");
    expect(inner).toMatch(/<header class="[^"]*\bpy-1\b/);
    expect(inner).toContain("padding-top:calc(0.25rem + env(safe-area-inset-top))");
    // The (empty) back-button slot keeps the row 44px tall.
    expect(header(inner)).toMatch(/<div class="flex min-h-11 shrink-0 items-center"><\/div>/);
    const home = layoutWith([remy], "/");
    expect(home).toMatch(/<header class="[^"]*\bpy-2\.5\b/);
    // A-Home: 18px 16px 10px, the notch inset on top.
    expect(home).toMatch(/<header class="[^"]*\bpx-4\b/);
    expect(home).toContain("padding-top:calc(1.125rem + env(safe-area-inset-top))");
  });

  it("--header-height matches that slim header, so the Foods/Recipes sticky bars dock flush under it", () => {
    // 0.25rem + 2.75rem (44px row) + 0.25rem = 3.25rem, + the notch inset; no border since item 679.
    const css = readFileSync(new URL("../styles/index.css", import.meta.url), "utf8");
    expect(css).toContain("--header-height: calc(3.25rem + env(safe-area-inset-top));");
  });
});

describe("AppLayout chrome (item 310 — the tour stopped being a route)", () => {
  it("renders the header and the bottom nav on every route", () => {
    // v1 had a chromeless branch for /tour. The tour is a dialog over the
    // app now, so there is no route left that hides the app's own chrome —
    // and /tour itself is just a Not found.
    for (const pathname of ["/", "/more", "/settings", "/storage", "/tour"]) {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const html = renderLayout(queryClient, pathname);

      expect(html, pathname).toContain("<nav");
      expect(html, pathname).toContain(">Home<");
      expect(html, pathname).toContain('aria-label="Settings"');
      // The outlet still renders under it.
      expect(html, pathname).toContain("content");
    }
  });
});

describe("AppLayout shell column (item 379 — the nav stopped being fixed)", () => {
  it("is at least a viewport tall, dvh preferred over the vh fallback, and reserves no bottom padding", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderLayout(queryClient);

    const column = html.match(/<div class="(mx-auto flex[^"]*max-w-lg flex-col)"/);
    expect(column, html.slice(0, 400)).not.toBeNull();
    const classes = column![1]!.split(" ");
    expect(classes).toContain("min-h-screen");
    // The dvh rule is wrapped in @supports, which is the only way round
    // Tailwind v4 emitting a bare `.min-h-[100dvh]` BEFORE `.min-h-screen` —
    // the fallback would otherwise override the thing it backs up.
    expect(classes).toContain("supports-[height:100dvh]:min-h-[100dvh]");
    expect(classes.indexOf("min-h-screen")).toBeLessThan(
      classes.indexOf("supports-[height:100dvh]:min-h-[100dvh]"),
    );

    // The nav occupies its own space now, so nothing reserves room for it.
    expect(html).not.toMatch(/padding-bottom:calc\(var\(--nav-height\)/);
    expect(html).not.toContain("min-h-full");
  });

  it("renders the nav INSIDE the column, after <main>, not as a sibling overlay", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderLayout(queryClient);

    const main = html.indexOf("<main");
    const mainEnd = html.indexOf("</main>");
    const nav = html.indexOf("<nav");
    expect(main).toBeGreaterThan(-1);
    expect(nav).toBeGreaterThan(mainEnd);
    // ...and still inside the shell column: the column's closing tag comes
    // after the nav, so the nav is the column's last flex child.
    expect(html.indexOf("</nav>")).toBeLessThan(html.lastIndexOf("</div>"));
    expect(html).toMatch(/<nav class="sticky bottom-0 /);
  });
});

describe("shouldScrollToTop", () => {
  it("scrolls to the top on forward navigation but keeps the restored position on back/forward", () => {
    expect(shouldScrollToTop("PUSH")).toBe(true);
    expect(shouldScrollToTop("REPLACE")).toBe(true);
    expect(shouldScrollToTop("POP")).toBe(false);
  });
});
