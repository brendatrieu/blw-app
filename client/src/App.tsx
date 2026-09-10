import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppLayout } from "./components/AppLayout.js";
import { RequireAnonymous, RequireAuth } from "./components/RequireAuth.js";
import { LoginPage } from "./pages/LoginPage.js";
import { SignupPage } from "./pages/SignupPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { LogFoodPage } from "./pages/LogFoodPage.js";
import { FridgePage } from "./pages/FridgePage.js";
import { FridgeAddPage } from "./pages/FridgeAddPage.js";
import { FridgeEditPage } from "./pages/FridgeEditPage.js";
import { FridgeDetailPage } from "./pages/FridgeDetailPage.js";
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
import { NotFoundPage } from "./pages/NotFoundPage.js";

/**
 * Item 287: the Pantry tab became the Fridge tab, so every old `/pantry*` URL
 * — a bookmark, the installed PWA's saved start URL, a back-button entry —
 * is rewritten to its `/fridge` twin instead of hitting Not found. Only the
 * prefix changes, so `/pantry/abc/edit` still lands on the edit page, and the
 * query/hash ride along. This is the ONE place the old word survives in
 * client code, and it has to: the redirect is what makes those URLs work.
 */
export function legacyFridgePath(location: { pathname: string; search: string; hash: string }): string {
  return `${location.pathname.replace(/^\/pantry(?=$|\/)/, "/fridge")}${location.search}${location.hash}`;
}

function LegacyPantryRedirect() {
  return <Navigate to={legacyFridgePath(useLocation())} replace />;
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
        <Route path="/fridge" element={<FridgePage />} />
        <Route path="/fridge/add" element={<FridgeAddPage />} />
        <Route path="/fridge/:id/edit" element={<FridgeEditPage />} />
        <Route path="/fridge/:id" element={<FridgeDetailPage />} />
        {/* Splat matches "/pantry" itself as well as anything under it. */}
        <Route path="/pantry/*" element={<LegacyPantryRedirect />} />
        <Route path="/foods" element={<FoodsRoute />} />
        {/* Ahead of "/foods/:slug", exactly like "/fridge/add" sits ahead of
            "/fridge/:id" — otherwise "new" is read as a slug. */}
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
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/more" element={<MorePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
