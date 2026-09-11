import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppLayout } from "./components/AppLayout.js";
import { RequireAnonymous, RequireAuth } from "./components/RequireAuth.js";
import { LoginPage } from "./pages/LoginPage.js";
import { SignupPage } from "./pages/SignupPage.js";
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
import { SymptomCheckPage } from "./pages/SymptomCheckPage.js";
import { ChatPage } from "./pages/ChatPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { MorePage } from "./pages/MorePage.js";
import { TourPage } from "./pages/TourPage.js";
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

export function App() {
  return (
    <Routes>
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
        <Route path="/symptom-check" element={<SymptomCheckPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/chat/:threadId" element={<ChatPage />} />
        {/* Full-viewport and chromeless (see isChromelessPath), but still
            inside the authenticated tree: the tour reads and writes this
            account's preferences. */}
        <Route path="/tour" element={<TourPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/more" element={<MorePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
