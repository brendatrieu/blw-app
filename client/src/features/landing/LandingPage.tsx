import { useEffect, useRef } from "react";
import { Link, Navigate } from "react-router-dom";
import { useSession } from "../../lib/auth.js";
import { usePagedTrack } from "../../components/ui/Pager.js";
import { newWheelGesture, slideIndexFromScroll, swipeStep, wheelStep } from "../../lib/scrollTrack.js";
import { ignoreTapsBriefly } from "../../lib/tapGuard.js";
import { DISCLAIMER, LANDING_SLIDES, type LandingChip, type LandingSlide } from "./slides.js";

const COUNT = LANDING_SLIDES.length;
/** A 358px app card shows 304px wide in the mockups (0.85). */
const CHIP_W = 304;
const SIDES = "px-[clamp(1.25rem,8.2vw,2rem)]";
/** Clears the iOS band and status bar when installed; about 96px down a 844px browser screen otherwise (the mockup). */
const SLIDE_TOP = "max(calc(env(safe-area-inset-top) + var(--top-edge-clearance) + 1.5rem), 11.4dvh)";
const ACCENT_LINK = "font-semibold text-[var(--color-accent)] underline";

const glowOf = ({ glow }: LandingSlide) =>
  `radial-gradient(circle at ${glow.sea}, var(--color-landing-glow-sea), transparent 55%), radial-gradient(circle at ${glow.apricot}, var(--color-landing-glow-apricot), transparent 50%)`;


/** A card's corner at a 304px card (the app's 20px at 0.85): scaled with the card, so a small card keeps its shape. */
const CHIP_RADIUS = 17;

/** One collage: the cards placed as in the mockup, `W` x `H` mockup px, scaled down as one (never up). */
function Collage({ chips, eager, className }: { chips: readonly LandingChip[]; eager: boolean; className: string }) {
  const W = Math.max(...chips.map((chip) => chip.x + CHIP_W));
  const H = Math.max(...chips.map((chip) => chip.y + (CHIP_W * chip.height) / chip.width));
  const pct = (part: number, whole: number) => `${((100 * part) / whole).toFixed(3)}%`;
  return (
    <div className={className} style={{ width: `min(${W}px, 100cqw, ${(W / H).toFixed(4)} * 100cqh)`, aspectRatio: `${W} / ${H}` }}>
      {chips.map((chip) => (
        <div
          key={chip.name}
          className="absolute overflow-hidden"
          style={{
            left: pct(chip.x, W),
            top: pct(chip.y, H),
            width: pct(CHIP_W, W),
            borderRadius: `${pct(CHIP_RADIUS, CHIP_W)} / ${pct(CHIP_RADIUS, (CHIP_W * chip.height) / chip.width)}`,
            boxShadow: "var(--shadow-landing-chip)",
          }}
        >
          <img
            src={`/landing/chips/${chip.name}.webp`}
            alt={chip.alt}
            width={chip.width}
            height={chip.height}
            loading={eager ? "eager" : "lazy"}
            className="block h-auto w-full"
          />
        </div>
      ))}
    </div>
  );
}

/**
 * A slide's cards, as wide as fits both the width and the height of their box
 * (a size container), so a short screen shows smaller cards, never cut. A
 * slide with `optional` cards also has the collage without them, shown
 * instead when its box is under 240px tall (the full recipes set would be
 * under 0.8 there): two bigger cards read better than three tiny ones.
 */
function Chips({ chips, eager }: { chips: readonly LandingChip[]; eager: boolean }) {
  const few = chips.filter((chip) => !chip.optional);
  return (
    <div className="relative min-h-0 flex-1" style={{ containerType: "size" }}>
      {few.length === chips.length ? (
        <Collage chips={chips} eager={eager} className="relative" />
      ) : (
        <>
          <Collage chips={chips} eager={eager} className="relative [@container(height<240px)]:hidden" />
          <Collage chips={few} eager={eager} className="relative hidden [@container(height<240px)]:block" />
        </>
      )}
    </div>
  );
}

/**
 * Ledger 992/1040: the signed-out front door ("/" lands here, RequireAuth).
 * One app-width column exactly the screen's height, pulled up under
 * OutsideAppLayout's top clearance, so the page never scrolls: the slides'
 * track above a bottom block (dots, Create an account, Sign in) that stays
 * put. Behind both, the page color with a sea and an apricot glow that move
 * per slide (crossfaded; instant under reduced motion), across the whole
 * width on a wide screen. Slide 1 is the centered intro; the others a big
 * headline, its line and the app's own cards floating below. The track is
 * the Pager's swipe track (one flick = one slide, item 778): it moves only by
 * scrolling, never the URL or history (ledger 849), and only when the
 * visitor moves it. Signed in, it forwards Home, so Back after a sign-in
 * never shows it (ledger 828).
 */
export function LandingPage() {
  const { data: session, isPending } = useSession();
  const track = usePagedTrack(COUNT, 1);
  const { goTo } = track;
  const index = track.pages.page;
  // Ledger 1024: a swipe or a sideways trackpad scroll on the bottom block moves the track too.
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);
  const wheel = useRef(newWheelGesture());

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

  return (
    <div
      className="relative mx-auto flex max-w-lg flex-col"
      style={{ height: "100dvh", marginTop: "calc(-1 * (env(safe-area-inset-top) + var(--top-edge-clearance)))" }}
    >
      {/* The ground and the glows, one layer per slide, the current one shown. Decorative. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/2 w-screen -translate-x-1/2 overflow-hidden bg-[var(--color-bg)]">
        {LANDING_SLIDES.map((slide, slideIndex) => (
          <div
            key={slide.title}
            className={`absolute inset-0 transition-opacity duration-[var(--duration-slow)] motion-reduce:transition-none ${
              slideIndex === index ? "opacity-100" : "opacity-0"
            }`}
            style={{ background: glowOf(slide) }}
          />
        ))}
      </div>

      {/* A tap on a slide is the → key: the next slide, none after the last.
          The track runs 3rem under the bottom block (painted over it, so the
          block still gets every tap) and each slide keeps that 3rem empty:
          the cards' shadow (0 14px 34px) fades out before the track's clip
          edge, never cut in a line on a short screen. */}
      <div
        ref={track.trackRef}
        onScroll={track.onScroll}
        onTouchStart={track.onTouchStart}
        onWheel={track.onWheel}
        onClick={() => move(1)}
        aria-roledescription="carousel"
        aria-label="What Little Meals does"
        className="scroll-hidden relative -mb-12 flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain"
      >
        {LANDING_SLIDES.map((slide, slideIndex) => (
          <section
            key={slide.title}
            role="group"
            aria-roledescription="slide"
            aria-label={`${slideIndex + 1} of ${COUNT}`}
            className={`relative flex h-full w-full shrink-0 flex-col pb-12 ${SIDES} ${
              track.near === null || Math.abs(slideIndex - track.near) <= 1 ? "snap-start snap-always" : "snap-align-none"
            }`}
            style={{ paddingTop: slideIndex === 0 ? "calc(env(safe-area-inset-top) + var(--top-edge-clearance))" : SLIDE_TOP }}
          >
            {slideIndex === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
                {/* Decorative: the name is right under it. */}
                <img
                  src="/icons/icon-512.png"
                  alt=""
                  width={108}
                  height={108}
                  className="h-[6.75rem] w-[6.75rem] rounded-[27px]"
                  style={{ boxShadow: "var(--shadow-landing-icon)" }}
                />
                <div className="flex flex-col items-center gap-2.5">
                  <h1 className="font-display text-[var(--color-text)]" style={{ fontSize: "2.625rem", lineHeight: 1.05, letterSpacing: "-0.5px" }}>
                    Little Meals
                  </h1>
                  <p className="text-lg font-semibold text-[var(--color-accent)]">{slide.title}</p>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <p className="max-w-[16.875rem] text-[0.9375rem] leading-normal text-[var(--color-landing-muted)]">{slide.body}</p>
                  {/* Until the session is known, no way in (the space is kept). */}
                  {isPending ? (
                    <div className="h-11" />
                  ) : (
                    <Link
                      to="/about"
                      // A link, not the slide's tap-to-next.
                      onClick={(event) => event.stopPropagation()}
                      className={`inline-flex min-h-11 items-center px-2 text-[0.8125rem] ${ACCENT_LINK}`}
                    >
                      About Little Meals
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-4">
                  <h2
                    className="font-h2 max-w-[19.5rem] text-[var(--color-text)]"
                    style={{ fontFamily: "var(--font-family-display)", fontSize: "clamp(1.75rem, 4.8dvh, 2.5rem)", lineHeight: 1.08, letterSpacing: "-0.6px" }}
                  >
                    {slide.title}
                  </h2>
                  <p className="max-w-[18.125rem] leading-normal text-[var(--color-landing-muted)]" style={{ fontSize: "clamp(0.9375rem, 2dvh, 1.0625rem)" }}>
                    {slide.body}
                  </p>
                </div>
                {/* The first cards are one tap from the intro: load them now. */}
                <div className="flex min-h-0 flex-1 flex-col pt-[clamp(0.5rem,2dvh,1rem)] pb-[clamp(1rem,4dvh,2rem)]">
                  <Chips chips={slide.chips} eager={slideIndex === 1} />
                </div>
                {slideIndex === COUNT - 1 ? (
                  <p className="mx-auto max-w-[18.75rem] pt-2 text-center text-[0.8125rem] leading-[1.45] text-[var(--color-landing-muted)]">{DISCLAIMER}</p>
                ) : null}
              </>
            )}
          </section>
        ))}
      </div>

      {/* The bottom block, the same on every slide, outside the track. A
          sideways swipe on it (touch, pen) moves one slide, as on the slides;
          up/down is left to the browser (pan-y) and never moves. */}
      <div
        className={`landing-foot relative flex shrink-0 flex-col items-center ${SIDES}`}
        style={{ paddingBottom: "max(3.3dvh, env(safe-area-inset-bottom))", touchAction: "pan-y" }}
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse") swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const start = swipe.current;
          swipe.current = null;
          if (start?.id !== event.pointerId) return;
          const step = swipeStep(event.clientX - start.x, event.clientY - start.y);
          if (!step) return;
          // A swipe that started on a button or a dot is not also a tap on it.
          ignoreTapsBriefly();
          move(step);
        }}
        onPointerCancel={() => {
          swipe.current = null;
        }}
        onWheel={(event) => {
          const step = wheelStep(wheel.current, event.deltaX, event.deltaY, event.timeStamp);
          if (step) move(step);
        }}
      >
        {/* 44px targets; the dot sits 14px above the button, the rest of its target above it. */}
        <div className="flex shrink-0 items-center justify-center">
          {LANDING_SLIDES.map((slide, slideIndex) => (
            <button
              key={slide.title}
              type="button"
              aria-label={`Go to slide ${slideIndex + 1} of ${COUNT}`}
              aria-current={slideIndex === index ? "true" : undefined}
              onClick={() => goTo(slideIndex)}
              className="flex h-11 w-11 items-end justify-center pb-3.5"
            >
              {/* The current dot is longer, not only another color. */}
              <span
                aria-hidden="true"
                className={`h-[7px] rounded-full transition-[width,background-color] duration-[var(--duration-fast)] motion-reduce:transition-none ${
                  slideIndex === index ? "w-[22px]" : "w-[7px]"
                }`}
                style={{ backgroundColor: slideIndex === index ? "var(--color-accent)" : "var(--color-landing-dot)" }}
              />
            </button>
          ))}
        </div>

        {/* Until the session is known, no way in: a signed-in parent reloading
            here must not see "Create an account" flash first. The space is
            kept, so nothing moves when they arrive. */}
        {isPending ? (
          <div className="h-[6.875rem]" />
        ) : (
          <>
            <Link
              to="/signup"
              className="flex min-h-[3.25rem] w-full items-center justify-center rounded-full bg-[var(--color-accent)] text-base font-semibold text-[var(--color-bg-elevated)] transition-transform duration-[var(--duration-fast)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              Create an account
            </Link>
            <p className="mt-3.5 flex items-center gap-1 text-[0.9375rem] text-[var(--color-landing-muted)]">
              Already have an account?
              <Link to="/login" className={`inline-flex min-h-11 items-center ${ACCENT_LINK}`}>
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
