import { EmptyState } from "../components/ui/EmptyState.js";
import { ButtonLink } from "../components/ui/Button.js";

export function NotFoundPage() {
  return (
    <div className="p-4">
      <EmptyState
        icon="🔍"
        title="Not found"
        description="This page doesn't exist — it may have moved."
        action={<ButtonLink to="/">Back home</ButtonLink>}
      />
    </div>
  );
}
