import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button.js";
import { Dialog } from "../../components/ui/Dialog.js";
import { usePreferences, useCompleteTour } from "./hooks.js";
import { TOUR_SLIDES, TOUR_SLIDE_COUNT } from "./slides.js";
import { clampSlide, resolveTourExit, slideIndexFromScroll } from "./tour.js";

/**
 * The tour: six slides on one horizontal, snapping track, inside a centred
 * modal card over whatever the parent was already looking at.
 *
 * A real scroll container rather than a transform carousel — a swipe, a
 * two-finger trackpad flick and a screen reader's own navigation all work
 * for free, and the active slide is simply *read back* from the scroll
 * position (`slideIndexFromScroll`) instead of being a second source of
 * truth that can disagree with what is on screen. Back, Next, the dots and
 * the arrow keys all just scroll the track; nothing else moves the state.
 *
 * Mounted only while it is open (see `TourProvider`), so the replay latch
 * below is decided fresh on every visit.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface TourDialogProps {
  /** Closes the dialog. Called after the exit has decided what to write. */
  onClose: () => void;
}

export function TourDialog({ onClose }: TourDialogProps) {
  const { data: preferences, status } = usePreferences();
  const completeTour = useCompleteTour();

  const trackRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);

  /**
   * Whether the tour was ALREADY marked seen when this dialog opened — i.e.
   * this is a replay from More, not a first run. Latched once, so the PATCH
   * this dialog itself fires can never turn a first run into a replay
   * mid-flight and skip the write.
   */
  const replayRef = useRef(false);
  const latchedRef = useRef(false);
  useEffect(() => {
    if (latchedRef.current || status !== "success") return;
    latchedRef.current = true;
    replayRef.current = preferences?.tourCompletedAt != null;
  }, [status, preferences]);

  const scrollToSlide = useCallback((next: number) => {
    const track = trackRef.current;
    if (!track) return;
    const width = track.clientWidth;
    if (width <= 0) return;
    track.scrollTo({
      left: clampSlide(next, TOUR_SLIDE_COUNT) * width,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, []);

  // ← → Home End move between slides. Bound to the document rather than to a
  // focusable wrapper so the keys work the moment the dialog opens, before
  // anything inside it has been tabbed to.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as { tagName?: string } | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const track = trackRef.current;
      if (!track) return;
      const current = slideIndexFromScroll(track.scrollLeft, track.clientWidth, TOUR_SLIDE_COUNT);

      const next =
        event.key === "ArrowRight"
          ? current + 1
          : event.key === "ArrowLeft"
            ? current - 1
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? TOUR_SLIDE_COUNT - 1
                : null;
      if (next === null) return;

      event.preventDefault();
      scrollToSlide(next);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [scrollToSlide]);

  /**
   * Every way out — Skip, Get started, an overlay tap, Escape — lands here.
   * The PATCH is fired and forgotten: closing never waits on the network, so
   * a failed write costs at most one extra viewing and never a stuck screen.
   */
  const exit = useCallback(() => {
    const { patch } = resolveTourExit(replayRef.current);
    if (patch) completeTour.mutate();
    onClose();
  }, [completeTour, onClose]);

  const isFirst = index === 0;
  const isLast = index === TOUR_SLIDE_COUNT - 1;

  return (
    <Dialog open onClose={exit} ariaLabel="Little Meals tour">
      {/* Fixed-height row so the track does not shift when Skip disappears
          on the last slide. */}
      <div className="flex min-h-11 shrink-0 items-center justify-end">
        {isLast ? null : (
          <button
            type="button"
            onClick={exit}
            className="inline-flex min-h-11 items-center justify-center px-3 text-sm font-semibold text-[var(--color-text-muted)]"
          >
            Skip
          </button>
        )}
      </div>

      <div
        ref={trackRef}
        onScroll={(event) => {
          const track = event.currentTarget;
          setIndex(slideIndexFromScroll(track.scrollLeft, track.clientWidth, TOUR_SLIDE_COUNT));
        }}
        aria-roledescription="carousel"
        aria-label="Tour slides"
        // `items-stretch`: every slide is as tall as the tallest one, so the
        // card keeps one height for the whole deck instead of resizing under
        // the parent's thumb mid-swipe. `shrink-0`: on a short viewport the
        // CARD scrolls (it is `max-h-[85dvh] overflow-y-auto`) rather than
        // the track being squeezed and the slides cropped.
        className="scroll-hidden flex shrink-0 snap-x snap-mandatory items-stretch overflow-x-auto overscroll-x-contain"
      >
        {TOUR_SLIDES.map((slide, slideIndex) => (
          <section
            key={slide.title}
            role="group"
            aria-roledescription="slide"
            aria-label={`${slideIndex + 1} of ${TOUR_SLIDE_COUNT}`}
            className="flex w-full shrink-0 snap-center flex-col items-center justify-center gap-4 px-2 py-6 text-center"
          >
            <span
              aria-hidden="true"
              className="emoji-disc flex h-20 w-20 shrink-0 items-center justify-center text-4xl leading-none"
            >
              {slide.emoji}
            </span>
            <h2 className="text-xl font-semibold text-[var(--color-text)]">{slide.title}</h2>
            <p className="text-sm text-[var(--color-text-muted)]">{slide.body}</p>
          </section>
        ))}
      </div>

      <div className="flex shrink-0 flex-col gap-2">
        <div className="flex items-center justify-center">
          {TOUR_SLIDES.map((slide, slideIndex) => (
            <button
              key={slide.title}
              type="button"
              aria-label={`Go to slide ${slideIndex + 1} of ${TOUR_SLIDE_COUNT}`}
              aria-current={slideIndex === index ? "true" : undefined}
              onClick={() => scrollToSlide(slideIndex)}
              // A 44px target around an 8px dot: the dot is the thing you
              // see, the button is the thing you can actually hit.
              className="flex h-11 w-11 items-center justify-center"
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full transition-colors duration-[var(--duration-fast)]"
                style={{
                  backgroundColor: slideIndex === index ? "var(--color-accent)" : "var(--color-border)",
                }}
              />
            </button>
          ))}
        </div>

        {/* Back sits left of the primary action and is simply absent on the
            first slide, where there is nowhere to go back to — Next then
            takes the whole row rather than leaving a dead half. */}
        <div className="flex items-center gap-2">
          {isFirst ? null : (
            <Button variant="secondary" className="flex-1 basis-0" onClick={() => scrollToSlide(index - 1)}>
              Back
            </Button>
          )}
          <Button className="flex-1 basis-0" onClick={isLast ? exit : () => scrollToSlide(index + 1)}>
            {isLast ? "Get started" : "Next"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
