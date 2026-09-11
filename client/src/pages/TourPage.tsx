import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button.js";
import { usePreferences, useCompleteTour } from "../features/tour/hooks.js";
import { TOUR_SLIDES, TOUR_SLIDE_COUNT } from "../features/tour/slides.js";
import { clampSlide, resolveTourExit, slideIndexFromScroll } from "../features/tour/tour.js";

/**
 * The first-run tour: six slides on one horizontal, snapping track.
 *
 * A real scroll container rather than a transform carousel — a swipe, a
 * two-finger trackpad flick and a screen reader's own navigation all work
 * for free, and the active slide is simply *read back* from the scroll
 * position (`slideIndexFromScroll`) instead of being a second source of
 * truth that can disagree with what is on screen. Next, the dots and the
 * arrow keys all just scroll the track; nothing else moves the state.
 *
 * The page owns the whole viewport: AppLayout renders it without the header
 * or the bottom nav (see `isChromelessPath`), so there is no PageHeader here
 * and Skip sits top-right on its own.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function TourPage() {
  const navigate = useNavigate();
  const { data: preferences, status } = usePreferences();
  const completeTour = useCompleteTour();

  const trackRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);

  /**
   * Whether the tour was ALREADY marked seen when this page opened — i.e.
   * this is a replay from More, not the first run. Latched once, so the PATCH
   * this page itself fires can never turn a first run into a replay
   * mid-flight and send the parent to the wrong place.
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
  // focusable wrapper so the keys work the moment the page opens, before
  // anything has been tabbed to.
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

  const exit = useCallback(() => {
    const { patch, to, replace } = resolveTourExit(replayRef.current);
    // Fired and forgotten: the navigation never waits on the network, so a
    // failed PATCH costs at most one extra viewing and never a stuck screen.
    if (patch) completeTour.mutate();
    navigate(to, { replace });
  }, [completeTour, navigate]);

  const isLast = index === TOUR_SLIDE_COUNT - 1;

  return (
    <div
      className="flex min-h-dvh flex-col"
      style={{
        backgroundColor: "var(--color-bg)",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* Fixed-height row so the track does not shift when Skip disappears
          on the last slide. */}
      <div className="flex min-h-11 items-center justify-end px-2">
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
        aria-label="App tour"
        className="scroll-hidden flex flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
      >
        {TOUR_SLIDES.map((slide, slideIndex) => (
          <section
            key={slide.title}
            role="group"
            aria-roledescription="slide"
            aria-label={`${slideIndex + 1} of ${TOUR_SLIDE_COUNT}`}
            className="flex w-full shrink-0 snap-center flex-col items-center justify-center gap-5 px-6 py-8 text-center"
          >
            <span
              aria-hidden="true"
              className="emoji-disc flex h-24 w-24 shrink-0 items-center justify-center text-5xl leading-none"
            >
              {slide.emoji}
            </span>
            <h1 className="text-2xl font-semibold text-[var(--color-text)]">{slide.title}</h1>
            <p className="max-w-sm text-[var(--color-text-muted)]">{slide.body}</p>
          </section>
        ))}
      </div>

      <div className="flex flex-col items-center gap-2 px-6 pb-4">
        <div className="flex items-center justify-center">
          {TOUR_SLIDES.map((slide, slideIndex) => (
            <button
              key={slide.title}
              type="button"
              aria-label={`Go to slide ${slideIndex + 1} of ${TOUR_SLIDE_COUNT}`}
              aria-current={slideIndex === index ? "true" : undefined}
              onClick={() => scrollToSlide(slideIndex)}
              // A 44px target around a 8px dot: the dot is the thing you see,
              // the button is the thing you can actually hit.
              className="flex h-11 w-11 items-center justify-center"
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full transition-colors duration-[var(--duration-fast)]"
                style={{
                  backgroundColor:
                    slideIndex === index ? "var(--color-accent)" : "var(--color-border)",
                }}
              />
            </button>
          ))}
        </div>

        <Button className="w-full max-w-sm" onClick={isLast ? exit : () => scrollToSlide(index + 1)}>
          {isLast ? "Get started" : "Next"}
        </Button>
      </div>
    </div>
  );
}
