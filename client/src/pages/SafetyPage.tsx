import { useParams } from "react-router-dom";
import { PlaceholderPage } from "./PlaceholderPage.js";

export function SafetyPage() {
  const { slug } = useParams<{ slug?: string }>();
  return (
    <PlaceholderPage
      title={slug ? `Safety: ${slug}` : "Safety Library"}
      description="Offline MDX safety articles."
    />
  );
}
