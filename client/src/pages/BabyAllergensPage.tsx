import { useParams } from "react-router-dom";
import { PlaceholderPage } from "./PlaceholderPage.js";

export function BabyAllergensPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <PlaceholderPage
      title={`Allergen ladder: baby ${id ?? ""}`}
      description="Top-9 allergen ladder tracker for this baby."
    />
  );
}
