import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useRecipe } from "../features/catalog/hooks.js";
import { CustomRecipeForm } from "../features/catalog/components/CustomRecipeForm.js";
import { RECIPES_TAB_PATH } from "../features/catalog/constants.js";
import { BackButton } from "../components/ui/BackButton.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { Skeleton } from "../components/ui/Skeleton.js";

/**
 * `/recipes/:id/edit` — the same `CustomRecipeForm`, preloaded from the
 * recipe it's editing.
 *
 * Two ways in are refused rather than rendered, exactly as on the food edit
 * page: an id that doesn't resolve (deleted, mistyped, or another parent's
 * recipe — the server 404s those identically), and a CATALOG recipe, which
 * nobody owns and whose PATCH the server would 404. Neither gets a form
 * whose Save can only fail.
 */
export function RecipeEditPage() {
  const { id } = useParams<{ id: string }>();
  const { data: recipe, isLoading, isError } = useRecipe(id);
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <PageHeader title="Edit recipe" emoji="✏️" leading={<BackButton fallback={RECIPES_TAB_PATH} />} />
        <Skeleton className="h-64 w-full rounded-[var(--radius-lg)]" />
      </div>
    );
  }

  if (isError || !recipe) {
    return <Navigate to={RECIPES_TAB_PATH} replace />;
  }
  if (!recipe.isCustom) {
    return <Navigate to={`/recipes/${recipe.id}`} replace />;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader title="Edit recipe" emoji="✏️" leading={<BackButton fallback={`/recipes/${recipe.id}`} />} />
      <CustomRecipeForm
        idPrefix="recipe-edit"
        recipe={recipe}
        onSaved={(updated) => navigate(`/recipes/${updated.id}`, { replace: true })}
      />
    </div>
  );
}
