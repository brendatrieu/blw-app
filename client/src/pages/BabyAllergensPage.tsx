import { useParams } from "react-router-dom";
import type { AllergenProgressItem, AllergenStatus } from "@blw/shared";
import { useBabies } from "../features/babies/hooks.js";
import { useAllergenProgress } from "../features/tracking/hooks.js";
import { Badge } from "../features/catalog/components/Badge.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { Card } from "../components/ui/Card.js";
import { SkeletonList } from "../components/ui/Skeleton.js";

const STATUS_LABEL: Record<AllergenStatus, string> = {
  not_started: "Not started",
  started: "Started",
  established: "Established",
};

const STATUS_TONE: Record<AllergenStatus, "neutral" | "accent" | "primary"> = {
  not_started: "neutral",
  started: "accent",
  established: "primary",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function AllergenRow({ item }: { item: AllergenProgressItem }) {
  return (
    <Card as="li" padding="sm" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-[var(--color-text)]">{item.allergenName}</span>
        <Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-muted)]">
        <span>{item.exposures === 1 ? "1 exposure" : `${item.exposures} exposures`}</span>
        <span>First: {formatDate(item.firstAt)}</span>
        <span>Last: {formatDate(item.lastAt)}</span>
      </div>
      <p className="text-sm text-[var(--color-text)]">{item.introGuidance}</p>
    </Card>
  );
}

export function BabyAllergensPage() {
  const { id: babyId } = useParams<{ id: string }>();
  const { data: babies } = useBabies();
  const baby = babies?.find((b) => b.id === babyId);
  const { data, isLoading, isError } = useAllergenProgress(babyId);

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader
        title={`Allergen ladder${baby ? ` — ${baby.name}` : ""}`}
        description="Introduce one new allergen at a time, in the morning at home, and wait a few days before the next one."
      />

      {isLoading && <SkeletonList count={4} />}
      {isError && <p className="text-sm text-[var(--color-danger)]">Couldn't find that baby's allergen progress.</p>}

      {data && (
        <ul className="flex flex-col gap-2">
          {data.items.map((item) => (
            <AllergenRow key={item.allergenSlug} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
