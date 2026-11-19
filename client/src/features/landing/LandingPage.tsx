import { useEffect } from "react";
import { Link, Navigate } from "react-router-dom";
import { useSession } from "../../lib/auth.js";
import { ButtonLink } from "../../components/ui/Button.js";
import { usePagedTrack } from "../../components/ui/Pager.js";
import { slideIndexFromScroll } from "../../lib/scrollTrack.js";
import { darkMediaQuery } from "../../theme.js";
import { DISCLAIMER, LANDING_SLIDES } from "./slides.js";

const COUNT = LANDING_SLIDES.length;

/**
 * Ledger 992: the signed-out front door ("/" lands here, RequireAuth). One
 * app-width column exactly as tall as the screen under OutsideAppLayout's top
 * clearance, so nothing scrolls the page and the buttons stay on screen,
 * in flow (no fixed chrome). The track is the Pager's swipe track (one flick
 * = one slide, item 778): it moves only by scrolling, never the URL or
 * history (ledger 849), and only when the visitor moves it. Signed in, it
 * forwards Home, so Back after a sign-in never shows it (ledger 828).
 */
export function LandingPage() {
  const { data: session, isPending } = useSession();
  const track = usePagedTrack(COUNT, 1);
  const { goTo } = track;
  const index = track.pages.page;

  // ← → move a slide, as in the tour. On the document, so they work before
  // anything has focus; never while typing (there is nothing to type here).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      const el = track.trackRef.current;
      if (!step || !el) return;
      event.preventDefault();
      goTo(slideIndexFromScroll(el.scrollLeft, el.clientWidth, COUNT) + step);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [goTo, track.trackRef]);

  if (session) return <Navigate to="/" replace />;

  const media = darkMediaQuery();
  const dark = typeof matchMedia === "function" && matchMedia(media).matches;

  return (
    <div
      className="mx-auto flex max-w-lg flex-col gap-3 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      style={{ height: "calc(100dvh - env(safe-area-inset-top) - var(--top-edge-clearance))" }}
    >
      <header className="flex shrink-0 flex-col items-center gap-1 text-center">
        <div className="flex items-center gap-3">
          {/* Decorative: the h1 names it. */}
          <img src="/icons/icon-192.png" alt="" width={40} height={40} className="h-10 w-10 rounded-xl" />
          <h1 className="font-display text-[var(--color-text)]">Little Meals</h1>
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">Starting solids, made simpler.</p>
      </header>

      <div
        ref={track.trackRef}
        onScroll={track.onScroll}
        onTouchStart={track.onTouchStart}
        onWheel={track.onWheel}
        aria-roledescription="carousel"
        aria-label="What Little Meals does"
        className="scroll-hidden -mx-4 flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain"
      >
        {LANDING_SLIDES.map((slide, slideIndex) => {
          const light = `/landing/${slide.shot}-light.webp`;
          const darkSrc = `/landing/${slide.shot}-dark.webp`;
          return (
            <section
              key={slide.shot}
              role="group"
              aria-roledescription="slide"
              aria-label={`${slideIndex + 1} of ${COUNT}`}
              className={`flex h-full w-full shrink-0 flex-col items-center gap-3 px-4 text-center ${
                track.near === null || Math.abs(slideIndex - track.near) <= 1
                  ? "snap-start snap-always"
                  : "snap-align-none"
              }`}
            >
              {/* A framed, whole screenshot scaled to the room left: never edge
                  to edge, so it does not read as the app itself. */}
              <div className="flex min-h-0 w-full flex-1 justify-center">
                <picture className="contents">
                  <source srcSet={darkSrc} media={media} />
                  <source srcSet={light} />
                  <img
                    src={dark ? darkSrc : light}
                    alt={slide.alt}
                    width={780}
                    height={1688}
                    loading={slideIndex === 0 ? "eager" : "lazy"}
                    className="h-full w-auto max-w-full rounded-2xl border border-[var(--color-border)] object-contain shadow-[var(--shadow-lg)]"
                  />
                </picture>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <h2 className="font-h2 text-[var(--color-text)]">{slide.title}</h2>
                <p className="text-sm text-[var(--color-text-muted)]">{slide.body}</p>
                {slideIndex === COUNT - 1 ? (
                  <p className="text-xs italic text-[var(--color-text-muted)]">{DISCLAIMER}</p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      <div className="flex shrink-0 items-center justify-center">
        {LANDING_SLIDES.map((slide, slideIndex) => (
          <button
            key={slide.shot}
            type="button"
            aria-label={`Go to slide ${slideIndex + 1} of ${COUNT}`}
            aria-current={slideIndex === index ? "true" : undefined}
            onClick={() => goTo(slideIndex)}
            className="flex h-11 w-11 items-center justify-center"
          >
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full transition-colors duration-[var(--duration-fast)]"
              style={{ backgroundColor: slideIndex === index ? "var(--color-accent)" : "var(--color-border)" }}
            />
          </button>
        ))}
        <span aria-live="polite" className="ml-1 text-sm whitespace-nowrap tabular-nums text-[var(--color-text-muted)]">
          {index + 1} of {COUNT}
        </span>
      </div>

      {/* Until the session is known, no way in: a signed-in parent reloading
          here must not see "Create an account" flash first. */}
      {isPending ? null : (
        <div className="flex shrink-0 flex-col items-center gap-1">
          <div className="flex w-full flex-wrap gap-2">
            <ButtonLink to="/signup" className="flex-1 basis-36 text-base">
              Create an account
            </ButtonLink>
            <ButtonLink to="/login" variant="secondary" className="flex-1 basis-36 text-base">
              Sign in
            </ButtonLink>
          </div>
          <Link
            to="/about"
            className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--color-accent)] underline"
          >
            About Little Meals
          </Link>
        </div>
      )}
    </div>
  );
}
