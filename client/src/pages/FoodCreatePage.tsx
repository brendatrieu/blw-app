import { useNavigate, useSearchParams } from "react-router-dom";
import { CustomFoodForm } from "../features/catalog/components/CustomFoodForm.js";
import { BackButton } from "../components/ui/BackButton.js";
import { PageHeader } from "../components/ui/PageHeader.js";

/**
 * `/foods/new` — the full-screen way to add a custom food (item 178),
 * reached from the Foods header action and from the no-results empty state,
 * which prefills `?name=` with whatever was searched for.
 *
 * The picker's inline sheet (see `FoodPicker`) renders the same form for the
 * same job; this page exists for the case where adding the food IS the task,
 * rather than a detour inside logging a meal.
 *
 * Saving lands on the new food's own page rather than bouncing back to the
 * grid: it's the confirmation that the food exists, and it's where Edit and
 * Delete live. `replace` keeps the now-pointless empty form out of the back
 * stack.
 */
export function FoodCreatePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-4 p-4">
      <BackButton fallback="/foods" />
      <PageHeader
        title="Add food"
        emoji="🥣"
        description="Anything you make or buy that isn't in the catalog."
      />
      <CustomFoodForm
        idPrefix="food-new"
        initialName={searchParams.get("name") ?? ""}
        onSaved={(food) => navigate(`/foods/${food.slug}`, { replace: true })}
        onCancel={() => navigate("/foods")}
      />
    </div>
  );
}
