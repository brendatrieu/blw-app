import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { IsRestoringProvider, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { awaitingDetail } from "../lib/detailQuery.js";
import { storageKeys } from "../features/storage/hooks.js";
import { StorageDetailPage } from "./StorageDetailPage.js";
import { StorageEditPage } from "./StorageEditPage.js";
import { FoodDetailPage } from "./FoodDetailPage.js";
import { FoodEditPage } from "./FoodEditPage.js";
import { RecipeDetailPage } from "./RecipeDetailPage.js";
import { RecipeEditPage } from "./RecipeEditPage.js";

// Ledger 716: a cold load straight onto a detail URL (refresh, iOS resume, a
// saved link) used to bounce away while the persisted cache was still
// restoring. React Query holds every query idle during the restore, so
// `isLoading` (pending AND fetching) is false and the pages took "no record"
// for "missing". `IsRestoringProvider value` is exactly the state
// PersistQueryClientProvider puts the tree in during that restore.

const ID = "11111111-1111-1111-1111-111111111111";

const PAGES: { name: string; path: string; route: string; page: () => ReactElement }[] = [
  { name: "StorageDetailPage", path: `/storage/${ID}`, route: "/storage/:id", page: () => createElement(StorageDetailPage) },
  { name: "StorageEditPage", path: `/storage/${ID}/edit`, route: "/storage/:id/edit", page: () => createElement(StorageEditPage) },
  { name: "FoodDetailPage", path: "/foods/salmon", route: "/foods/:slug", page: () => createElement(FoodDetailPage) },
  { name: "FoodEditPage", path: "/foods/salmon/edit", route: "/foods/:slug/edit", page: () => createElement(FoodEditPage) },
  { name: "RecipeDetailPage", path: `/recipes/${ID}`, route: "/recipes/:id", page: () => createElement(RecipeDetailPage) },
  { name: "RecipeEditPage", path: `/recipes/${ID}/edit`, route: "/recipes/:id/edit", page: () => createElement(RecipeEditPage) },
];

function render(client: QueryClient, path: string, route: string, page: ReactElement, restoring = false): string {
  return renderToString(
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        IsRestoringProvider,
        { value: restoring },
        createElement(
          MemoryRouter,
          { initialEntries: [path] },
          createElement(Routes, null, createElement(Route, { path: route, element: page })),
        ),
      ),
    ),
  );
}

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const isSkeleton = (html: string) => html.includes('class="skeleton ') && !html.includes("Couldn&#x27;t find");

describe("detail pages wait out the persisted-cache restore (ledger 716)", () => {
  for (const { name, path, route, page } of PAGES) {
    it(`${name} shows its skeleton, not a redirect or "Couldn't find", while the cache restores`, () => {
      const client = newClient();
      const html = render(client, path, route, page(), true);
      expect(html).not.toBe("");
      expect(isSkeleton(html)).toBe(true);
    });
  }
});

describe("list-backed detail pages: a stale restored list without the record waits for the refetch", () => {
  // `updatedAt: 0` = restored from IndexedDB long ago, so the mount refetches.
  // The meal page was list-backed too, until ledger 966 retired it.
  const LIST_PAGES = PAGES.filter((p) => ["StorageDetailPage", "StorageEditPage"].includes(p.name));

  function seed(client: QueryClient, updatedAt: number) {
    client.setQueryData(storageKeys.list("active"), { items: [] }, { updatedAt });
    client.setQueryData(storageKeys.list("history"), { items: [] }, { updatedAt });
  }

  for (const { name, path, route, page } of LIST_PAGES) {
    it(`${name}: stale list missing the record -> skeleton while it refetches`, () => {
      const client = newClient();
      seed(client, 0);
      expect(isSkeleton(render(client, path, route, page()))).toBe(true);
    });

    it(`${name}: a fresh answer without the record still redirects (truly unknown/deleted id)`, () => {
      const client = newClient();
      seed(client, Date.now());
      // `Navigate` renders nothing in a server render (its redirect is an effect).
      expect(render(client, path, route, page())).toBe("");
    });
  }

  it("StorageDetailPage: an answered active list is not enough while history is still pending", () => {
    // A finished/discarded item lives only in history.
    const client = newClient();
    client.setQueryData(storageKeys.list("active"), { items: [] });
    expect(isSkeleton(render(client, `/storage/${ID}`, "/storage/:id", createElement(StorageDetailPage)))).toBe(true);
  });
});

describe("awaitingDetail", () => {
  it("waits only while the record is absent and an answer is still coming", () => {
    expect(awaitingDetail({ isPending: true, isFetching: false }, false)).toBe(true); // restoring / idle
    expect(awaitingDetail({ isPending: true, isFetching: true }, false)).toBe(true); // first fetch
    expect(awaitingDetail({ isPending: false, isFetching: true }, false)).toBe(true); // stale refetch
    expect(awaitingDetail({ isPending: false, isFetching: false }, false)).toBe(false); // settled: missing
    expect(awaitingDetail({ isPending: false, isFetching: true }, true)).toBe(false); // found renders
  });
});
