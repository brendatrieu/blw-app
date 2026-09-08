import { useNavigate } from "react-router-dom";
import { CustomRecipeForm } from "../features/catalog/components/CustomRecipeForm.js";
import { RECIPES_TAB_PATH } from "../features/catalog/constants.js";
import { useBackNavigate } from "../components/ui/BackButton.js";
import { CloseButton } from "../components/ui/CloseButton.js";
import { PageHeader } from "../components/ui/PageHeader.js";

/**
 * `/recipes/new` — writing down a recipe of your own (item 211). Reached
 * from the Recipes segment's header action and from its no-results empty
 * state.
 *
 * Full-screen with a header X rather than a back chevron, like the other
 * "this page IS the task" forms (log a meal, add a pantry item): it's opened
 * as an action, not drilled into. Saving lands on the new recipe's own page
 * — the confirmation that it exists, and where Log meal, Edit and Delete
 * live — with `replace` keeping the spent form out of the back stack.
 */
export function RecipeCreatePage() {
  const goBack = useBackNavigate(RECIPES_TAB_PATH);
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader
        title="Add recipe"
        emoji="🍳"
        description="Whatever you actually cook — it logs and fans out like any recipe."
        action={<CloseButton fallback={RECIPES_TAB_PATH} />}
      />
      <CustomRecipeForm
        idPrefix="recipe-new"
        onSaved={(recipe) => navigate(`/recipes/${recipe.id}`, { replace: true })}
        onCancel={goBack}
      />
    </div>
  );
}
