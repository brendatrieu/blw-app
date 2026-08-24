import { useParams } from "react-router-dom";
import { PlaceholderPage } from "./PlaceholderPage.js";

export function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <PlaceholderPage
      title={`Recipe: ${id ?? ""}`}
      description={'6/9/12mo variant tabs; "I prepped this" creates a pantry item.'}
    />
  );
}
