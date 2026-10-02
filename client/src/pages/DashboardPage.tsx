import { Link } from "react-router-dom";
import type { AllergenProgressItem, StorageItem } from "@blw/shared";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { useAllergenProgress } from "../features/tracking/hooks.js";
import { dueAllergens, dueSinceLabel } from "../features/tracking/allergenRow.js";
import { allergenEmoji, allergenTint } from "../features/tracking/allergenEmoji.js";
import { AllergenUpNextMenu } from "../features/tracking/components/AllergenUpNextMenu.js";
import { HOME_MEAL_LIMIT, ServeLogList } from "../features/tracking/components/ServeLogList.js";
import { useStorageItems } from "../features/storage/hooks.js";
import { storageItemTitle } from "../features/storage/format.js";
import { resolveFreshness } from "../features/storage/freshness.js";
import {
  servingsCount,
  storageItemCluster,
  StorageItemRow,
  StorageItemTitle,
  UseSoonBadge,
} from "../features/storage/components/StorageItemCard.js";
import { StorageItemActionsMenu } from "../features/storage/components/StorageItemActionsMenu.js";
import { FoodPlates } from "../features/catalog/components/FoodPlate.js";
import { ButtonLink } from "../components/ui/Button.js";
import { Card, CardLink } from "../components/ui/Card.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import { ProgressRing } from "../components/ui/ProgressRing.js";
import { SectionLink } from "../components/ui/SectionLink.js";
import { Skeleton, SkeletonList } from "../components/ui/Skeleton.js";

const ALLERGEN_TOTAL = 9;

/** The rows Up next shows before "See all" takes over (item 660). */
export const UP_NEXT_LIMIT = 3;

export type UpNextRow = { kind: "storage"; item: StorageItem } | { kind: "allergen"; item: AllergenProgressItem };

/**
 * What Up next lists (item 660): storage items to use soon, in the freshness
 * order the list already has, then allergens due for a serve, in ladder
 * order — at most `UP_NEXT_LIMIT`. Expired items are left to Storage, which
 * says Expired. `more` names where the hidden rows live: Storage when any of
 * them is a storage item, otherwise the ladder; null when nothing is hidden.
 */
export function upNextRows(
  storage: readonly StorageItem[],
  allergens: AllergenProgressItem[],
  now: Date = new Date(),
): { rows: UpNextRow[]; more: "storage" | "allergens" | null } {
  const all: UpNextRow[] = [
    ...storage
      .filter((item) => resolveFreshness(item, now).state === "use_soon")
      .map((item) => ({ kind: "storage" as const, item })),
    ...dueAllergens(allergens, now).map((item) => ({ kind: "allergen" as const, item })),
  ];
  const hidden = all.slice(UP_NEXT_LIMIT);
  return {
    rows: all.slice(0, UP_NEXT_LIMIT),
    more: hidden.length === 0 ? null : hidden.some((row) => row.kind === "storage") ? "storage" : "allergens",
  };
}

/** One Up next row: a stretched link to the thing, its kebab above it. */
// A-Home: the line between Up next rows starts at the text (plate 48 + gap 12),
// not at the card edge like the storage rows.
const UP_NEXT_DIVIDER =
  "not-first:before:absolute not-first:before:top-0 not-first:before:right-2.5 not-first:before:left-[60px] not-first:before:h-px not-first:before:bg-[var(--color-divider)]";

function UpNextRowShell({
  to,
  plates,
  title,
  detail,
  actions,
}: {
  to: string;
  plates: React.ReactNode;
  title: React.ReactNode;
  detail: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <li className={`relative flex items-center gap-3 py-2.5 ${UP_NEXT_DIVIDER}`}>
      <Link
        to={to}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-[var(--radius-sm)] after:absolute after:inset-0 after:rounded-[var(--radius-md)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
      >
        {plates}
        <span className="flex min-w-0 flex-col gap-[3px]">
          <span className="text-[17px] font-extrabold text-[var(--color-text)]">{title}</span>
          {detail}
        </span>
      </Link>
      <div className="relative z-10 shrink-0">{actions}</div>
    </li>
  );
}

// The Home greeting's small uppercase apricot label (AppLayout), for the
// card's own label (CSS uppercases it, so the copy stays "Up next").
const UP_NEXT_LABEL_CLASS = "text-[11px] leading-[normal] font-extrabold uppercase tracking-[0.14em] text-[var(--color-apricot-text)]";

/**
 * "Up next" (item 660, A-Home): what needs doing soon, each row with its own
 * kebab — no single big button. Hidden while either list is loading and when
 * nothing is due, so it never flashes in empty.
 */
function UpNextCard({ babyId }: { babyId: string }) {
  const storage = useStorageItems("active");
  const progress = useAllergenProgress(babyId);
  if (storage.isLoading || progress.isLoading) return null;
  const { rows, more } = upNextRows(storage.data?.items ?? [], progress.data?.items ?? []);
  if (rows.length === 0) return null;
  const ladderPath = `/babies/${babyId}/allergens`;

  return (
    // A-Home (item 681): label 16px under the top, 10px to the first plate,
    // 10px around each divider, 12px under the last plate. The rows' own
    // py-2.5 carries the 10s (so each whole row stays tappable); pb-0.5 tops
    // the last one up to 12.
    <Card as="section" padding="none" aria-labelledby="up-next" className="flex flex-col pt-4 pr-1.5 pb-0.5 pl-4">
      <div className="flex items-center justify-between pr-2.5">
        <h2 id="up-next" className={UP_NEXT_LABEL_CLASS}>
          Up next
        </h2>
        {/* A 44px target that takes only the label's height in the row; z-10 lifts
            it over the first row's stretched link so its lower half still lands. */}
        {more && (
          <div className="relative z-10 -my-[14.5px]">
            <SectionLink to={more === "storage" ? "/storage" : ladderPath}>See all</SectionLink>
          </div>
        )}
      </div>
      <ul className="flex flex-col">
        {rows.map((row) =>
          row.kind === "storage" ? (
            <UpNextRowShell
              key={`storage-${row.item.id}`}
              to={`/storage/${row.item.id}`}
              plates={<FoodPlates {...storageItemCluster(row.item)} />}
              title={<StorageItemTitle item={row.item} />}
              detail={
                <span className="flex items-center gap-1.5 text-sm whitespace-nowrap text-[var(--color-text-muted)]">
                  <UseSoonBadge />
                  {row.item.servingsLeft != null && <span>{servingsCount(row.item.servingsLeft)} left</span>}
                </span>
              }
              actions={
                <StorageItemActionsMenu
                  item={row.item}
                  babyId={babyId}
                  label={`Up next: ${storageItemTitle(row.item)} actions`}
                />
              }
            />
          ) : (
            <UpNextRowShell
              key={`allergen-${row.item.allergenSlug}`}
              to={`${ladderPath}/${row.item.allergenSlug}`}
              plates={
                <FoodPlates
                  plates={[{ emoji: allergenEmoji(row.item.allergenSlug), tint: allergenTint(row.item.allergenSlug) }]}
                  overflow={0}
                />
              }
              title={`${row.item.allergenName} is due for a serve`}
              detail={<span className="text-sm text-[var(--color-text-muted)]">{dueSinceLabel(row.item)}</span>}
              actions={
                <AllergenUpNextMenu babyId={babyId} item={row.item} label={`${row.item.allergenName} actions`} />
              }
            />
          ),
        )}
      </ul>
    </Card>
  );
}

function AllergenProgressSummary({ babyId }: { babyId: string }) {
  const { data, isLoading } = useAllergenProgress(babyId);

  if (isLoading || !data) {
    return <Skeleton className="h-[6.5rem] w-full rounded-[var(--radius-lg)]" />;
  }

  const established = data.items.filter((item) => item.status === "established").length;
  const started = data.items.filter((item) => item.status === "started").length;
  const notStarted = data.items.length - established - started;
  // One segment per allergen (item 663): established, then started, then the
  // empty track, clockwise from the top.
  const segments = Array.from({ length: ALLERGEN_TOTAL }, (_, index) =>
    index < established
      ? "var(--color-ring-established)"
      : index < established + started
        ? "var(--color-ring-started)"
        : "var(--color-ring-empty)",
  );

  return (
    <CardLink to={`/babies/${babyId}/allergens`} padding="none" className="flex items-center gap-4 px-4 py-3.5">
      <ProgressRing
        segments={segments}
        label={`${established} of ${ALLERGEN_TOTAL} allergens established, ${started} started`}
      >
        <span className="text-xl font-black tabular-nums text-[var(--color-text)]">
          {established}/{ALLERGEN_TOTAL}
        </span>
      </ProgressRing>
      <div className="flex flex-col gap-1 text-sm">
        <span className="text-base font-extrabold text-[var(--color-text)]">{established} established</span>
        <span className="text-[var(--color-text-muted)]">
          {started} started · {notStarted} not started yet
        </span>
      </div>
    </CardLink>
  );
}

/** The storage items Home shows before "See all" takes over. */
export const HOME_STORAGE_LIMIT = 3;

function StorageSection({ babyId }: { babyId: string }) {
  const { data, isLoading } = useStorageItems("active");
  const topThree = (data?.items ?? []).slice(0, HOME_STORAGE_LIMIT);

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <h2 className="font-h2 text-[var(--color-text)]">Storage</h2>
        <SectionLink to="/storage">See all</SectionLink>
      </div>

      {isLoading && <SkeletonList count={2} />}

      {!isLoading && topThree.length === 0 && (
        <EmptyState
          icon="📦"
          title="Nothing in storage yet"
          description="Log what you've prepped so nothing gets forgotten in storage."
          action={
            <ButtonLink to="/storage/add" variant="secondary">
              Add what you prepped
            </ButtonLink>
          }
        />
      )}

      {topThree.length > 0 && (
        // One rounded group of divided rows (item 662), not a card per item.
        <Card as="ul" padding="none" className="flex flex-col">
          {topThree.map((item) => (
            <StorageItemRow
              key={item.id}
              item={item}
              actions={
                <StorageItemActionsMenu item={item} babyId={babyId} label={`${storageItemTitle(item)} actions`} />
              }
            />
          ))}
        </Card>
      )}
    </section>
  );
}

export function DashboardPage() {
  const { activeBaby, isLoading } = useActiveBaby();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5 p-4">
        <div className="flex gap-2">
          <Skeleton className="h-11 flex-1 rounded-[var(--radius-md)]" />
          <Skeleton className="h-11 flex-1 rounded-[var(--radius-md)]" />
        </div>
        <SkeletonList count={2} />
      </div>
    );
  }

  if (!activeBaby) {
    return (
      <div className="p-4">
        <EmptyState
          icon="👋"
          title="Welcome"
          description="Add a baby profile to start tracking foods, storage items, and allergens."
          action={<ButtonLink to="/settings">Add a baby</ButtonLink>}
        />
      </div>
    );
  }

  return (
    // A-Home main: 6px 16px 16px, 18px between sections (item 681).
    <div className="flex flex-col gap-[18px] px-4 pt-1.5 pb-4">
      {/* The visible greeting lives in the shared AppLayout header; this keeps
          the document outline rooted for screen readers. */}
      <h1 className="sr-only">Home</h1>
      <UpNextCard babyId={activeBaby.id} />
      {/* Emoji-free per A-Home; sky and mint as before (item 661). */}
      <div className="flex gap-2.5">
        <ButtonLink to="/log-meal" size="lg" className="flex-1">
          Log meal
        </ButtonLink>
        <ButtonLink to="/storage/add" variant="tonal" size="lg" className="flex-1">
          Add to storage
        </ButtonLink>
      </div>

      <StorageSection babyId={activeBaby.id} />

      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h2 className="font-h2 text-[var(--color-text)]">Allergens</h2>
          <SectionLink to={`/babies/${activeBaby.id}/allergens`}>Ladder</SectionLink>
        </div>
        <AllergenProgressSummary babyId={activeBaby.id} />
      </section>

      <ServeLogList babyId={activeBaby.id} limit={HOME_MEAL_LIMIT} seeAllHref="/meals" grouped />
    </div>
  );
}
