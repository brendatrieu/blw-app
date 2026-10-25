import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { AI_FEATURES_ENABLED } from "@blw/shared";
import { AppLayout, useScrollToTopOnPathChange } from "./components/AppLayout.js";
import { RequireAnonymous, RequireAuth } from "./components/RequireAuth.js";
import { LoginPage } from "./pages/LoginPage.js";
import { SignupPage } from "./pages/SignupPage.js";
import { AboutPage } from "./pages/AboutPage.js";
import { ResetPasswordPage } from "./pages/ResetPasswordPage.js";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { LogFoodPage } from "./pages/LogFoodPage.js";
import { StoragePage } from "./pages/StoragePage.js";
import { StorageAddPage } from "./pages/StorageAddPage.js";
import { StorageEditPage } from "./pages/StorageEditPage.js";
import { StorageDetailPage } from "./pages/StorageDetailPage.js";
import { MealDetailPage } from "./pages/MealDetailPage.js";
import { MealsPage } from "./pages/MealsPage.js";
import { FoodsRoute } from "./pages/FoodsPage.js";
import { FoodDetailPage } from "./pages/FoodDetailPage.js";
import { FoodCreatePage } from "./pages/FoodCreatePage.js";
import { FoodEditPage } from "./pages/FoodEditPage.js";
import { RecipesPage } from "./pages/RecipesPage.js";
import { RecipeDetailPage } from "./pages/RecipeDetailPage.js";
import { RecipeCreatePage } from "./pages/RecipeCreatePage.js";
import { RecipeEditPage } from "./pages/RecipeEditPage.js";
import { BabyAllergensPage } from "./pages/BabyAllergensPage.js";
import { AllergenDetailPage } from "./pages/AllergenDetailPage.js";
import { FavoritesPage } from "./pages/FavoritesPage.js";
import { SafetyPage } from "./pages/SafetyPage.js";
import { SafetyArticlePage } from "./pages/SafetyArticlePage.js";
import { GuidePage, GuidesPage } from "./pages/GuidesPage.js";
import { SymptomCheckPage } from "./pages/SymptomCheckPage.js";
import { ChatPage } from "./pages/ChatPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { MorePage } from "./pages/MorePage.js";
import { FeedbackPage } from "./pages/FeedbackPage.js";
import { AdminMetricsPage } from "./pages/AdminMetricsPage.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";

/**
 * Items 287 and 293: the tab was the Pantry, then the Fridge, and is now
 * Storage — so every old `/pantry*` AND `/fridge*` URL (a bookmark, the
 * installed PWA's saved start URL, a back-button entry) is rewritten onto its
 * `/storage` twin instead of hitting Not found. Only the leading segment
 * changes, so `/fridge/abc/edit` still lands on the edit page, and the
 * query/hash ride along. This is the ONE place the old words survive in
 * client code, and they have to: the redirect is what makes those URLs work.
 */
const LEGACY_STORAGE_PREFIX = /^\/(?:pantry|fridge)(?=$|\/)/;

export function legacyStoragePath(location: { pathname: string; search: string; hash: string }): string {
  return `${location.pathname.replace(LEGACY_STORAGE_PREFIX, "/storage")}${location.search}${location.hash}`;
}

function LegacyStorageRedirect() {
  return <Navigate to={legacyStoragePath(useLocation())} replace />;
}

/**
 * Ledger 851: the screens outside AppLayout (sign-in, sign-up, About, the
 * password pages) have no app header to clear the iOS status bar. Since ledger
 * 869 the status bar is opaque (inset 0), but installs from before it keep the
 * old see-through one (viewport-fit=cover, black-translucent) until re-added.
 * One top inset here covers all of them; Safari reports 0, so it is unchanged.
 * It also starts each of them at the top, as AppLayout does: Sign out from a
 * scrolled Settings otherwise opened a taller-than-the-window /login scrolled
 * to its bottom.
 */
export function OutsideAppLayout() {
  useScrollToTopOnPathChange();
  return (
    <div style={{ paddingTop: "calc(env(safe-area-inset-top) + var(--top-edge-clearance))" }}>
      <Outlet />
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<OutsideAppLayout />}>
        <Route
          path="/login"
          element={
            <RequireAnonymous>
              <LoginPage />
            </RequireAnonymous>
          }
        />
        <Route
          path="/signup"
          element={
            <RequireAnonymous>
              <SignupPage />
            </RequireAnonymous>
          }
        />
        {/* Item 611: public to everyone, signed in or out — no RequireAnonymous. */}
        <Route path="/about" element={<AboutPage />} />
        {/* Ledger 820: where a reset link lands. Public — no RequireAnonymous —
            so a link opened on a device that is still signed in works too. */}
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        {/* Ledger 822: ask for a reset email. */}
        <Route
          path="/forgot-password"
          element={
            <RequireAnonymous>
              <ForgotPasswordPage />
            </RequireAnonymous>
          }
        />
      </Route>

      {/* Everything below the guard needs a session. The server enforces
          this independently; the wrapper just keeps the UI honest. */}
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/log-meal" element={<LogFoodPage />} />
        <Route path="/meals" element={<MealsPage />} />
        <Route path="/meals/:id" element={<MealDetailPage />} />
        <Route path="/storage" element={<StoragePage />} />
        <Route path="/storage/add" element={<StorageAddPage />} />
        <Route path="/storage/:id/edit" element={<StorageEditPage />} />
        <Route path="/storage/:id" element={<StorageDetailPage />} />
        {/* Each splat matches the bare prefix as well as anything under it. */}
        <Route path="/pantry/*" element={<LegacyStorageRedirect />} />
        <Route path="/fridge/*" element={<LegacyStorageRedirect />} />
        <Route path="/foods" element={<FoodsRoute />} />
        {/* Ahead of "/foods/:slug", exactly like "/storage/add" sits ahead of
            "/storage/:id" — otherwise "new" is read as a slug. */}
        <Route path="/foods/new" element={<FoodCreatePage />} />
        <Route path="/foods/:slug/edit" element={<FoodEditPage />} />
        <Route path="/foods/:slug" element={<FoodDetailPage />} />
        <Route path="/recipes" element={<RecipesPage />} />
        {/* Ahead of "/recipes/:id", exactly like "/foods/new" sits ahead of
            "/foods/:slug" — otherwise "new" is read as a recipe id. */}
        <Route path="/recipes/new" element={<RecipeCreatePage />} />
        <Route path="/recipes/:id/edit" element={<RecipeEditPage />} />
        <Route path="/recipes/:id" element={<RecipeDetailPage />} />
        <Route path="/log" element={<Navigate to="/" replace />} />
        <Route path="/babies/:id/allergens" element={<BabyAllergensPage />} />
        <Route path="/babies/:id/allergens/:slug" element={<AllergenDetailPage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/safety" element={<SafetyPage />} />
        <Route path="/safety/:slug" element={<SafetyArticlePage />} />
        {/* Item 608: the how-to guides, reached from More. */}
        <Route path="/guides" element={<GuidesPage />} />
        <Route path="/guides/:slug" element={<GuidePage />} />
        <Route path="/symptom-check" element={<SymptomCheckPage />} />
        {/* Item 589: while AI is switched off, /chat falls through to Not found. */}
        {AI_FEATURES_ENABLED ? <Route path="/chat" element={<ChatPage />} /> : null}
        {AI_FEATURES_ENABLED ? <Route path="/chat/:threadId" element={<ChatPage />} /> : null}
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/more" element={<MorePage />} />
        {/* Item 360. Reached from the More row it sits next to here, and
            declared immediately after it so `ROUTE_PATTERNS` — which mirrors
            this table exactly, in order — reads the same way. */}
        <Route path="/feedback" element={<FeedbackPage />} />
        {/* Item 327. Declared last, immediately ahead of the catch-all, and
            inside the layout like every other screen: a non-admin who opens
            it renders the very same `NotFoundPage` the line below renders,
            because the alternative — a route that behaves differently for
            people without access — is itself the disclosure. */}
        <Route path="/admin/metrics" element={<AdminMetricsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
