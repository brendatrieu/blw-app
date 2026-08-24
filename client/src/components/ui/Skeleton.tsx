interface SkeletonProps {
  className?: string;
}

/** A single shimmering placeholder block. Compose with layout classes via `className`. */
export function Skeleton({ className = "" }: SkeletonProps) {
  return <div className={`skeleton rounded-md ${className}`} aria-hidden="true" />;
}

interface SkeletonListProps {
  count?: number;
}

/** Card-shaped skeleton rows for list pages, matching the real `Card` footprint. */
export function SkeletonList({ count = 3 }: SkeletonListProps) {
  return (
    <div className="flex flex-col gap-2" role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3"
        >
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}
