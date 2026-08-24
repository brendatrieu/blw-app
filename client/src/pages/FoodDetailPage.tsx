import { useParams } from "react-router-dom";
import { PlaceholderPage } from "./PlaceholderPage.js";

export function FoodDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  return (
    <PlaceholderPage
      title={`Food: ${slug ?? ""}`}
      description="Iron/vit-C badges, pairing suggestions, allergen flags, per-age prep."
    />
  );
}
