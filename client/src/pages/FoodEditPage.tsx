import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useFood } from "../features/catalog/hooks.js";
import { CustomFoodForm } from "../features/catalog/components/CustomFoodForm.js";
import { BackButton } from "../components/ui/BackButton.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { Skeleton } from "../components/ui/Skeleton.js";

/**
 * `/foods/:slug/edit` — the same `CustomFoodForm`, preloaded from the food
 * it's editing.
 *
 * Two ways in are refused rather than rendered: a slug that doesn't resolve
 * (deleted, mistyped, or another user's custom food — the server 404s those
 * identically), and a *catalog* food, which nobody owns and the server would
 * 404 the PATCH for. Both redirect to the food list instead of offering a
 * form whose Save can only fail.
 */
export function FoodEditPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: food, isLoading, isError } = useFood(slug);
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <BackButton fallback="/foods" />
        <PageHeader title="Edit food" emoji="✏️" />
        <Skeleton className="h-64 w-full rounded-[var(--radius-lg)]" />
      </div>
    );
  }

  if (isError || !food) {
    return <Navigate to="/foods" replace />;
  }
  if (!food.isCustom) {
    return <Navigate to={`/foods/${food.slug}`} replace />;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <BackButton fallback={`/foods/${food.slug}`} />
      <PageHeader title="Edit food" emoji="✏️" />
      <CustomFoodForm
        idPrefix="food-edit"
        food={food}
        onSaved={(updated) => navigate(`/foods/${updated.slug}`, { replace: true })}
        onCancel={() => navigate(`/foods/${food.slug}`)}
      />
    </div>
  );
}
