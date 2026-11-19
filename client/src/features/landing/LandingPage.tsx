import { useEffect } from "react";
import { Link, Navigate } from "react-router-dom";
import { useSession } from "../../lib/auth.js";
import { ButtonLink } from "../../components/ui/Button.js";
import { usePagedTrack } from "../../components/ui/Pager.js";
import { slideIndexFromScroll } from "../../lib/scrollTrack.js";
import { darkMediaQuery } from "../../theme.js";
import { DISCLAIMER, LANDING_SLIDES } from "./slides.js";

const COUNT = LANDING_SLIDES.length;
const WAY_IN = "flex-1 max-[22.5rem]:px-2.5 max-[22.5rem]:text-[0.8125rem]";
const shotSrc = (shot: string, theme: "light" | "dark") => `/landing/${shot}-${theme}.webp`;

/**
 * Ledger 992/1003: the signed-out front door ("/" lands here, RequireAuth).
 * One app-width column exactly the screen's height: it runs up under
 * OutsideAppLayout's top clearance (the brand row clears it again), so the
 * page never scrolls. Each slide is a full-bleed screenshot with its words on
 * a gradient to the page colour; the dots and the ways in sit in one panel
 * pinned to the bottom, outside the track (absolute, never fixed chrome),
 * whose height `--panel-h` every slide keeps clear under its words. The track is the
 * Pager's swipe track (one flick = one slide, item 778): it moves only by
 * scrolling, never the URL or history (ledger 849), and only when the visitor
 * moves it. Signed in, it forwards Home, so Back after a sign-in never shows
 * it (ledger 828).
 */
export function LandingPage() {
  const { data: session, isPending } = useSession();
  const track = usePagedTrack(COUNT, 1);
  const { goTo } = track;
  const index = track.pages.page;

  // One slide on from where the track is; nothing past either end.
  const move = (step: number) => {
    const el = track.trackRef.current;
    if (!el) return;
    const next = slideIndexFromScroll(el.scrollLeft, el.clientWidth, COUNT) + step;
    if (next >= 0 && next < COUNT) goTo(next);
  };

  // ← → move a slide, as in the tour. On the document, so they work before
  // anything has focus; never while typing (there is nothing to type here).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      move(step);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  if (session) return <Navigate to="/" replace />;

  const media = darkMediaQuery();
  const dark = typeof matchMedia === "function" && matchMedia(media).matches;
  const theme = dark ? "dark" : "light";
  const current = LANDING_SLIDES[index]!;

  return (
    <div
      className="relative mx-auto max-w-lg [--panel-h:calc(8.25rem+max(1rem,env(safe-area-inset-bottom)))]"
      style={{ height: "100dvh", marginTop: "calc(-1 * (env(safe-area-inset-top) + var(--top-edge-clearance)))" }}
    >
      {/* Wide screens: the current picture, blurred and dimmed, fills the
          sides. Decorative; not displayed (so never loaded) on a phone. */}
      <div aria-hidden="true" className="absolute inset-y-0 left-1/2 hidden w-screen -translate-x-1/2 overflow-hidden min-[33rem]:block">
        <picture>
          <source srcSet={shotSrc(current.shot, "dark")} media={media} />
          <source srcSet={shotSrc(current.shot, "light")} />
          <img
            src={shotSrc(current.shot, theme)}
            alt=""
            loading="lazy"
            className="h-full w-full scale-110 object-cover opacity-40 blur-2xl"
          />
        </picture>
      </div>

      <header
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-2 px-4 pb-6"
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + var(--top-edge-clearance) + 0.75rem)",
          background: "linear-gradient(to bottom, color-mix(in srgb, var(--color-bg) 85%, transparent) 55%, transparent)",
        }}
      >
        {/* Decorative: the h1 names it. */}
        <img src="/icons/icon-192.png" alt="" width={28} height={28} className="h-7 w-7 rounded-lg" />
        <h1 className="font-display text-[var(--color-text)]" style={{ fontSize: "1.375rem" }}>
          Little Meals
        </h1>
      </header>

      {/* A tap on a picture is the → key: the next slide, none after the last. */}
      <div
        ref={track.trackRef}
        onScroll={track.onScroll}
        onTouchStart={track.onTouchStart}
        onWheel={track.onWheel}
        onClick={() => move(1)}
        aria-roledescription="carousel"
        aria-label="What Little Meals does"
        className="scroll-hidden absolute inset-0 flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain"
      >
        {LANDING_SLIDES.map((slide, slideIndex) => (
          <section
            key={slide.shot}
            role="group"
            aria-roledescription="slide"
            aria-label={`${slideIndex + 1} of ${COUNT}`}
            className={`relative h-full w-full shrink-0 ${
              track.near === null || Math.abs(slideIndex - track.near) <= 1 ? "snap-start snap-always" : "snap-align-none"
            }`}
          >
            <picture>
              <source srcSet={shotSrc(slide.shot, "dark")} media={media} />
              <source srcSet={shotSrc(slide.shot, "light")} />
              <img
                src={shotSrc(slide.shot, theme)}
                alt={slide.alt}
                width={780}
                height={1688}
                loading={slideIndex === 0 ? "eager" : "lazy"}
                className="absolute inset-0 h-full w-full object-cover object-top"
                // Starts where the header's padding does (iOS band + status
                // bar), so the shot's blank top stays under "Little Meals".
                style={{ paddingTop: "calc(env(safe-area-inset-top) + var(--top-edge-clearance))" }}
              />
            </picture>
            {/* Clear to the page colour, solid where the words sit, then the
                panel's reserved height (which also hides the shot's tab bar). */}
            <div
              className="absolute inset-x-0 bottom-0 flex flex-col gap-1 px-4 pt-8 text-center"
              style={{
                paddingBottom: "var(--panel-h)",
                background: "linear-gradient(to bottom, transparent, var(--color-bg) 1.75rem)",
              }}
            >
              <h2 className="font-h2 text-[var(--color-text)]">{slide.title}</h2>
              <p className="text-sm text-[var(--color-text-muted)]">{slide.body}</p>
              {slideIndex === COUNT - 1 ? (
                <p className="text-xs italic text-[var(--color-text-muted)]">{DISCLAIMER}</p>
              ) : null}
            </div>
          </section>
        ))}
      </div>

      <div
        className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center bg-[var(--color-bg)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        style={{ height: "var(--panel-h)" }}
      >
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
              {/* The current dot is wider, not only another colour. */}
              <span
                aria-hidden="true"
                className={`h-2 rounded-full transition-[width,background-color] duration-[var(--duration-fast)] motion-reduce:transition-none ${
                  slideIndex === index ? "w-5" : "w-2"
                }`}
                style={{ backgroundColor: slideIndex === index ? "var(--color-accent)" : "var(--color-text-muted)" }}
              />
            </button>
          ))}
        </div>

        {/* Until the session is known, no way in: a signed-in parent reloading
            here must not see "Create an account" flash first. */}
        {isPending ? null : (
          <>
            {/* Side by side at every width (a touch smaller under 360px, so
                "Create an account" fits one line at 320px), which keeps the
                panel one row of buttons tall: --panel-h. */}
            <div className="flex w-full gap-2">
              <ButtonLink to="/signup" className={WAY_IN}>
                Create an account
              </ButtonLink>
              <ButtonLink to="/login" variant="secondary" className={WAY_IN}>
                Sign in
              </ButtonLink>
            </div>
            <Link
              to="/about"
              className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--color-accent)] underline"
            >
              About Little Meals
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
