import { Link } from "react-router-dom";
import { ageInMonths } from "@blw/shared";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";

/**
 * The slim inner-page header's "Mila · 8 mo" chip (items 654/655). Same
 * branches as Home's `BabySwitcher`: no (unarchived) babies -> the "Add a
 * baby" link; one baby -> a static chip; several -> the same native picker,
 * laid transparently over the chip so tapping the chip opens it.
 */
export function BabyChip() {
  const { babies, activeBaby, setActiveBabyId } = useActiveBaby();

  if (babies.length === 0 || !activeBaby) {
    return (
      <Link
        to="/settings"
        className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-2"
        style={{ color: "var(--color-accent)" }}
      >
        Add a baby
      </Link>
    );
  }

  // Array.from so a name starting with an emoji/astral character keeps the whole glyph.
  const initial = (Array.from(activeBaby.name.trim())[0] ?? "").toUpperCase();
  const chip = (
    <span
      aria-hidden={babies.length > 1 ? true : undefined}
      className="inline-flex h-9 min-w-0 items-center gap-1.5 rounded-full bg-[var(--color-apricot-soft)] pl-1.5 pr-3 text-sm font-extrabold text-[var(--color-text)]"
    >
      <span
        aria-hidden="true"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-avatar)] text-xs font-black text-[var(--color-avatar-ink)]"
      >
        {initial}
      </span>
      {/* Only the name truncates, so a long name never cuts off the age. */}
      <span className="flex min-w-0">
        <span className="truncate">{activeBaby.name}</span>
        <span className="shrink-0 whitespace-pre">{` · ${ageInMonths(activeBaby.birthDate)} mo`}</span>
      </span>
    </span>
  );

  if (babies.length === 1) return chip;

  // The select is the real control (44px tall, invisible); the chip under it
  // is decoration, so it draws the focus ring the hidden select can't.
  return (
    <label className="relative flex min-h-11 min-w-0 items-center rounded-full has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-accent)]">
      <span className="sr-only">Active baby</span>
      {chip}
      <select
        data-no-focus-ring
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
        value={activeBaby.id}
        onChange={(event) => {
          setActiveBabyId(event.target.value || null);
        }}
      >
        {babies.map((baby) => (
          <option key={baby.id} value={baby.id}>
            {baby.name}
          </option>
        ))}
      </select>
    </label>
  );
}
