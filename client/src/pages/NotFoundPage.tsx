import { EmptyState } from "../components/ui/EmptyState.js";
import { ButtonLink } from "../components/ui/Button.js";

export function NotFoundPage() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center p-4">
      <EmptyState
        icon="🔍"
        title="Not found"
        description="This page doesn't exist — it may have moved."
        action={<ButtonLink to="/">Back home</ButtonLink>}
      />
    </div>
  );
}
