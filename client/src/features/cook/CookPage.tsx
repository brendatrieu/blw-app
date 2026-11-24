import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { ageInMonths, ageStageSchema } from "@blw/shared";
import { useActiveBaby } from "../babies/useActiveBaby.js";
import { useRecipe } from "../catalog/hooks.js";
import { AGE_STAGE_OPTIONS, stageForAge } from "../catalog/stage.js";
import { APP_GLOW_PLACES, safeTop } from "../../components/AppLayout.js";
import { useBackNavigate } from "../../components/ui/BackButton.js";
import { Button, ButtonLink } from "../../components/ui/Button.js";
import { CloseButton } from "../../components/ui/CloseButton.js";
import { Sheet } from "../../components/ui/Sheet.js";
import { Skeleton } from "../../components/ui/Skeleton.js";
import { awaitingDetail } from "../../lib/detailQuery.js";
import { glowTiles } from "../../lib/glows.js";
import { swipeStep } from "../../lib/scrollTrack.js";
import { ignoreTapsBriefly } from "../../lib/tapGuard.js";
import { keepScreenAwake } from "../../pwa/wakeLock.js";
import { setStatusBarSurface } from "../../theme.js";
import { IngredientList } from "../../pages/RecipeDetailPage.js";
import {
  arrowStep,
  cookProgress,
  cookScreen,
  moveScreen,
  readScreen,
  scrollCue,
  showsIngredients,
  shownVariant,
  type ScrollCue,
} from "./cook.js";

/**
 * Cook mode (ledger 1094-1098, ROADMAP 4): "You'll need", then one step per
 * screen, then "All done". Its own route outside AppLayout, so no header or
 * tab bar; the glow ground and a frosted control bar, all in flow (no fixed
 * chrome). The screen is `?step=` (replaced, never pushed), so a reload (an
 * iOS app reopened mid-cook) lands on the same step and phone Back leaves.
 */
export function CookPage() {
  const { id = "" } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const recipeQuery = useRecipe(id);
  const recipe = recipeQuery.data;
  const { activeBaby, isLoading: isBabyLoading } = useActiveBaby();
  const recipeHref = `/recipes/${id}`;
  const leave = useBackNavigate(recipeHref);
  // Which way the last move went, for the slide; 0 = no move yet (no slide on arrival).
  const [direction, setDirection] = useState<-1 | 0 | 1>(0);
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);
  // Ledger 1147: the full list over any step; closing hands focus back to its button (useModal).
  const [ingredientsOpen, setIngredientsOpen] = useState(false);
  // Ledger 1153b: the step area's scroll cue, measured from the scroller itself.
  const scroller = useRef<HTMLDivElement | null>(null);
  const [cue, setCue] = useState<ScrollCue>(null);

  useEffect(() => {
    // Ledger 1090: one screen on the glow ground, so the installed app's
    // status bar shows the ground's top row (theme.ts STATUS_BAR.top).
    setStatusBarSurface("top");
    return keepScreenAwake();
  }, []);

  // The stage the recipe page showed rides in the URL; without one (a typed
  // link) it is the baby's, as on the recipe page.
  const askedStage = ageStageSchema.safeParse(searchParams.get("stage")).data;
  const { stage, variant } = recipe
    ? shownVariant(recipe, askedStage ?? stageForAge(activeBaby ? ageInMonths(activeBaby.birthDate) : null))
    : { stage: null, variant: undefined };
  const steps = variant?.steps ?? [];
  const index = readScreen(searchParams.get("step"), steps.length);
  const screen = cookScreen(index, steps.length);

  const go = (by: -1 | 1) => {
    const next = moveScreen(index, by, steps.length);
    if (!recipe || next === index) return;
    // The second tap of a quick double tap is not a tap on what moved under it (767).
    ignoreTapsBriefly();
    setDirection(by);
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set("step", String(next));
        return params;
      },
      { replace: true },
    );
  };

  // ← → on the document, as on the landing and the tour.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const by = arrowStep(event);
      // Not while the Ingredients sheet is up: the step behind it stays put.
      if (!by || ingredientsOpen) return;
      event.preventDefault();
      go(by);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  const waiting = awaitingDetail(recipeQuery, Boolean(recipe)) || (!askedStage && isBabyLoading);

  // Ledger 1153b/c: re-measure on scroll, on resize or reflow, and whenever the
  // scroller mounts (keyed by step) or its content changes; never every render.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () =>
      setCue((prev) =>
        scrollCue(prev, {
          scrollTop: el.scrollTop,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          paddingBottom: parseFloat(getComputedStyle(el).paddingBottom),
        }),
      );
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", measure);
      ro?.disconnect();
    };
  }, [waiting, recipe, variant, index]);
  // Nothing to cook (a typed link to a recipe with no steps): the recipe, as it has no button.
  if (!waiting && recipe && steps.length === 0) return <Navigate to={recipeHref} replace />;

  const stageLabel = recipe && !recipe.isCustom ? AGE_STAGE_OPTIONS.find((o) => o.value === stage)?.label : undefined;
  const slide = direction ? ({ "--cook-slide-from": direction > 0 ? "2rem" : "-2rem" } as CSSProperties) : undefined;

  return (
    // One screen tall (the step scrolls inside itself), so two screens of glow
    // cover it: lib/glows.ts glowScreensFor(screen, screen).
    <div className="app-ground" style={glowTiles("app", APP_GLOW_PLACES, 2)}>
      <div
        className="mx-auto flex h-screen max-w-lg touch-pan-y touch-pinch-zoom flex-col supports-[height:100dvh]:h-[100dvh]"
        style={{ paddingTop: safeTop("0.25rem", "--top-edge-clearance-slim") }}
        // A sideways swipe (touch, pen) moves one screen, as on the landing;
        // up/down stays the step's own scroll.
        // Ledger 1147: React bubbles pointer events from the Ingredients
        // sheet (portaled to body) up to here; one that did not start inside
        // this column (the sheet, its backdrop) never moves the step.
        onPointerDown={(event) => {
          if (!event.currentTarget.contains(event.target as Node)) return;
          if (event.pointerType !== "mouse") swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const start = swipe.current;
          swipe.current = null;
          if (start?.id !== event.pointerId || !event.currentTarget.contains(event.target as Node)) return;
          const by = swipeStep(event.clientX - start.x, event.clientY - start.y);
          if (by) go(by);
        }}
        onPointerCancel={() => {
          swipe.current = null;
        }}
      >
        {/* The Close sits where AppLayout's slim header puts its X: the
            column pads the top as the header does, the row adds only pb-1. */}
        <div className="flex min-h-11 items-center gap-1 px-4 pb-1">
          <CloseButton fallback={recipeHref} />
          {recipe ? (
            <h1 className="min-w-0 flex-1 truncate font-semibold text-[var(--color-text)]">
              {recipe.title}
              {stageLabel ? <span className="font-normal text-[var(--color-text-muted)]"> · {stageLabel}</span> : null}
            </h1>
          ) : null}
          {/* Ledger 1147: amounts mid-cook without leaving; the title truncates first. */}
          {!waiting && recipe && showsIngredients(screen, recipe) ? (
            <>
              {/* Ledger 1159c: by mode (.cook-ing): light frosted (proto option A),
                  dark the sea tint (option C); the theme switch picks, as for tokens. */}
              <Button
                type="button"
                variant="quiet"
                className="cook-ing shrink-0"
                onClick={() => setIngredientsOpen(true)}
              >
                Ingredients
              </Button>
              <Sheet open={ingredientsOpen} onClose={() => setIngredientsOpen(false)} title="You'll need" showClose>
                <IngredientList recipe={recipe} linked={false} />
              </Sheet>
            </>
          ) : null}
        </div>

        {waiting ? (
          <div className="flex flex-col gap-4 px-4 py-6">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-24 w-full rounded-[var(--radius-lg)]" />
          </div>
        ) : !recipe ? (
          // Data in hand wins over a failed refetch: a step never turns into an error mid-cook.
          <p className="px-4 py-6 text-sm text-[var(--color-danger)]">Couldn't find that recipe.</p>
        ) : (
          <>
            <div className="px-4 pt-1">
              {/* The accent fill (the tour's current dot) on a translucent
                  divider track, which reads over the glow where --color-border
                  vanishes (ledger 1081); the CTA fill stays on buttons (644). */}
              <div
                role="progressbar"
                aria-label="Progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(cookProgress(screen) * 100)}
                className="h-1.5 overflow-hidden rounded-full bg-[var(--color-divider)]"
              >
                <div
                  className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-[var(--duration-base)] motion-reduce:transition-none"
                  style={{ width: `${cookProgress(screen) * 100}%` }}
                />
              </div>
            </div>

            {/* The live region stays; the screen inside it is new each move,
                so a long step starts at its top and scrolls inside itself. */}
            <div aria-live="polite" className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
              <div
                ref={scroller}
                key={index}
                className={`min-h-0 flex-1 touch-pan-y touch-pinch-zoom overflow-y-auto overscroll-contain px-4 py-6 ${slide ? "cook-slide" : ""}`}
                style={slide}
              >
                {screen.kind === "need" ? (
                  <div className="flex flex-col gap-3">
                    <h2 className="font-h2 text-[var(--color-text)]">You'll need</h2>
                    <IngredientList recipe={recipe} linked={false} />
                  </div>
                ) : screen.kind === "step" ? (
                  <div className="flex flex-col gap-3">
                    <h2 className="font-h2 text-[var(--color-apricot-text)]">
                      Step {screen.n} of {screen.of}
                    </h2>
                    <p className="text-2xl leading-snug text-[var(--color-text)]">{steps[screen.n - 1]}</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-5 pt-10 text-center">
                    <h2 className="font-h2 text-[var(--color-text)]">All done</h2>
                    {/* The Log meal prefill the recipe page already uses; it
                        takes cook mode's place, so its own Back is the recipe. */}
                    {!recipe.deletedAt ? (
                      <ButtonLink to={`/log-meal?recipe=${recipe.id}`} replace variant="secondary">
                        Log meal
                      </ButtonLink>
                    ) : null}
                  </div>
                )}
              </div>
              {/* Ledger 1153b (1141b): a thin frosted track in the 16px gutter
                  (the text never reaches it), a solid thumb; never takes a touch. */}
              {cue ? (
                <div aria-hidden="true" data-cook-cue="" className="cook-cue pointer-events-none absolute top-6 right-1.5 bottom-6 w-1 rounded-full">
                  <div
                    className="absolute inset-x-0 rounded-full bg-[var(--color-text-muted)]"
                    style={{ top: `${cue.top * 100}%`, height: `${cue.size * 100}%` }}
                  />
                </div>
              ) : null}
            </div>

            {/* Above the home indicator by its inset plus the bar's own
                padding, as the tab bar (ledger 1106: 10px + inset).
                Keys: a button that changes meaning remounts, so a held or
                repeated Enter never lands on the next screen's other action. */}
            <div
              className="app-frost flex gap-2 border-t px-4 pt-3"
              style={{ borderColor: "var(--color-bar-hairline)", paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
            >
              {screen.kind === "need" ? (
                <Button key="start" type="button" size="lg" className="flex-1" onClick={() => go(1)}>
                  Start
                </Button>
              ) : (
                <>
                  <Button key="back" type="button" variant="secondary" size="lg" className="flex-1" onClick={() => go(-1)}>
                    Back
                  </Button>
                  {screen.kind === "step" ? (
                    <Button key="next" type="button" size="lg" className="flex-1" onClick={() => go(1)}>
                      Next
                    </Button>
                  ) : (
                    <Button key="recipe" type="button" size="lg" className="flex-1" onClick={leave}>
                      Back to recipe
                    </Button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
