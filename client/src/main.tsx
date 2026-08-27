import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { ApiError } from "./lib/api.js";
import { createIdbPersister } from "./lib/persister.js";
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

// Only the read-mostly catalog/user-data query families are worth restoring
// offline. Auth/session and AI-key queries are deliberately never persisted
// — they must always come from a live, authenticated fetch.
const PERSISTED_QUERY_KEY_PREFIXES = new Set([
  "foods",
  "food",
  "recipe",
  "babies",
  "pantry",
  "meals",
  "favorites",
  "allergen-progress",
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
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
          <App />
        </BrowserRouter>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
