import type { AgeStage, RecipeDetail, RecipeVariant } from "@blw/shared";
import { clampStageToAvailable } from "../catalog/stage.js";
import { clampSlide } from "../../lib/scrollTrack.js";

/**
 * Cook mode (ledger 1094-1098): a recipe's steps one screen at a time. Plain
 * TS, no DOM, so a native shell can reuse the decisions as they are.
 *
 * Screens, by index: 0 = "You'll need", 1..M = step N of M, M + 1 = "All done".
 */

/**
 * The variant the recipe page shows for a requested stage, and the stage it
 * resolves to. One source for the page and for cook mode, so cook mode plays
 * exactly the steps on screen. A custom recipe has one variant, which the
 * clamp always lands on.
 */
export function shownVariant(
  recipe: Pick<RecipeDetail, "variants">,
  requested: AgeStage,
): { stage: AgeStage | null; variant: RecipeVariant | undefined } {
  const stage = clampStageToAvailable(
    requested,
    recipe.variants.map((v) => v.ageStage),
  );
  return { stage, variant: recipe.variants.find((v) => v.ageStage === stage) ?? recipe.variants[0] };
}

/** Where Start cooking goes: a catalog recipe carries the stage shown, so a reload keeps it. */
export function cookHref(recipe: Pick<RecipeDetail, "id" | "isCustom">, stage: AgeStage | null): string {
  const base = `/recipes/${recipe.id}/cook`;
  return !recipe.isCustom && stage ? `${base}?stage=${stage}` : base;
}

export type CookScreen = { kind: "need" } | { kind: "step"; n: number; of: number } | { kind: "done" };

/** The screen at an index, clamped into [0, M + 1]. */
export function cookScreen(index: number, stepCount: number): CookScreen {
  const at = clampSlide(index, stepCount + 2);
  if (at === 0) return { kind: "need" };
  if (at > stepCount) return { kind: "done" };
  return { kind: "step", n: at, of: stepCount };
}

/** The `?step=` param as a screen index: missing or junk = the first screen, too far = the last. */
export function readScreen(param: string | null, stepCount: number): number {
  return clampSlide(Number(param ?? 0), stepCount + 2);
}

/** One screen on (1) or back (-1), never past either end. */
export function moveScreen(index: number, by: -1 | 1, stepCount: number): number {
  return clampSlide(index + by, stepCount + 2);
}

/** ← / → move a screen (desktop). Never with a modifier, so browser shortcuts still work. */
export function arrowStep(event: {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}): -1 | 0 | 1 {
  if (event.altKey || event.ctrlKey || event.metaKey) return 0;
  return event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
}

/** How far along the bar is: 0 on "You'll need", N / M on step N, full on "All done". */
export function cookProgress(screen: CookScreen): number {
  if (screen.kind === "need") return 0;
  if (screen.kind === "done") return 1;
  return screen.n / screen.of;
}

/**
 * Ledger 1147: whether the top bar offers the Ingredients sheet. On a step and
 * on All done, never on "You'll need" (it is the list), and only when the
 * recipe has something to list.
 */
export function showsIngredients(
  screen: CookScreen,
  recipe: Pick<RecipeDetail, "ingredients" | "extraIngredients">,
): boolean {
  return screen.kind !== "need" && recipe.ingredients.length + recipe.extraIngredients.length > 0;
}

/** Ledger 1153b: the step's scroll cue, as fractions of its track; null = no cue. */
export type ScrollCue = { top: number; size: number } | null;

/**
 * Ledger 1153b/c (1141b): the cue for a step's scroller. Shown only when more
 * than the bottom padding is hidden (padding alone is not a hidden line); the
 * thumb is visible / total, placed at the scroll position and clamped (iOS
 * overscroll). The same numbers hand back `prev`, so a measure never re-renders.
 */
export function scrollCue(
  prev: ScrollCue,
  el: { scrollTop: number; scrollHeight: number; clientHeight: number; paddingBottom: number },
): ScrollCue {
  const hidden = el.scrollHeight - el.clientHeight;
  const size = el.clientHeight / el.scrollHeight;
  const next = hidden <= el.paddingBottom ? null : { top: Math.min(Math.max(el.scrollTop / hidden, 0), 1) * (1 - size), size };
  return prev?.top === next?.top && prev?.size === next?.size ? prev : next;
}
