import React from "react";
import ReactDOM from "react-dom/client";
import { focusManager, QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { ApiError } from "./lib/api.js";
import { createCatalogVersionChecker, createCatalogVersionDeps } from "./lib/catalogVersion.js";
import { createIdbPersister } from "./lib/persister.js";
import { UsageProvider } from "./lib/usage/UsageProvider.js";
import { initTheme } from "./theme.js";
import "./styles/index.css";

initTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A 4xx is a definitive answer (not found, not yours, not signed in) —
      // retrying it just leaves the user staring at a skeleton.
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 3,
    },
  },
});

const persister = createIdbPersister();

// Module scope, so StrictMode's double render cannot subscribe twice. Launch
// runs it from the persist provider below, AFTER the IndexedDB restore: run
// earlier, a late hydrate would put the stale catalog back over the refresh.
// The provider is handed a void callback, never the promise: it would hold
// every query back until /api/version answered.
const checkCatalogVersion = createCatalogVersionChecker(createCatalogVersionDeps(queryClient));
const checkCatalogVersionInBackground = () => {
  void checkCatalogVersion();
};
focusManager.subscribe((focused) => {
  if (focused) checkCatalogVersionInBackground();
});

// Only the read-mostly catalog/user-data query families are worth restoring
// offline. Auth/session and AI-key queries are deliberately never persisted
// — they must always come from a live, authenticated fetch.
const PERSISTED_QUERY_KEY_PREFIXES = new Set([
  "foods",
  "food",
  "recipe",
  "babies",
  "storage",
  "meals",
  "favorites",
  "allergen-progress",
  // Deliberately NOT here: the tour's "seen" flag (["preferences"]). A
  // restored `{ tourCompletedAt: null }` makes the query read "success"
  // before the network has said anything, and that is exactly how a parent
  // who had finished the tour was shown it again on the next cold start.
  // The gate (shouldOpenTour) only ever acts on a network answer, so there
  // is nothing for a persisted copy to do but lie.
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
        onSuccess={checkCatalogVersionInBackground}
        onError={checkCatalogVersionInBackground}
        persistOptions={{
          persister,
          maxAge: 24 * 60 * 60 * 1000,
          buster: __APP_VERSION__,
          dehydrateOptions: {
            shouldDehydrateQuery: (query) =>
              query.state.status === "success" &&
              typeof query.queryKey[0] === "string" &&
              PERSISTED_QUERY_KEY_PREFIXES.has(query.queryKey[0]),
          },
        }}
      >
        <BrowserRouter>
          {/* Inside the router (screen_viewed needs a location) and outside
              AppLayout, so /login and /signup are measured too — the signup
              funnel starts on a screen the authenticated layout never renders. */}
          <UsageProvider>
            <App />
          </UsageProvider>
        </BrowserRouter>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
