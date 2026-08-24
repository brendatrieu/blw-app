import { Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout.js";
import { LoginPage } from "./pages/LoginPage.js";
import { SignupPage } from "./pages/SignupPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { PantryPage } from "./pages/PantryPage.js";
import { FoodsPage } from "./pages/FoodsPage.js";
import { FoodDetailPage } from "./pages/FoodDetailPage.js";
import { RecipeDetailPage } from "./pages/RecipeDetailPage.js";
import { LogPage } from "./pages/LogPage.js";
import { BabyAllergensPage } from "./pages/BabyAllergensPage.js";
import { FavoritesPage } from "./pages/FavoritesPage.js";
import { SafetyPage } from "./pages/SafetyPage.js";
import { SymptomCheckPage } from "./pages/SymptomCheckPage.js";
import { ChatPage } from "./pages/ChatPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { MorePage } from "./pages/MorePage.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />

      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/pantry" element={<PantryPage />} />
        <Route path="/foods" element={<FoodsPage />} />
        <Route path="/foods/:slug" element={<FoodDetailPage />} />
        <Route path="/recipes/:id" element={<RecipeDetailPage />} />
        <Route path="/log" element={<LogPage />} />
        <Route path="/babies/:id/allergens" element={<BabyAllergensPage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/safety" element={<SafetyPage />} />
        <Route path="/safety/:slug" element={<SafetyPage />} />
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
