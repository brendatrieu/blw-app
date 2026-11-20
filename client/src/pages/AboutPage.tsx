import { useSession } from "../lib/auth.js";
import { DISCLAIMER, LANDING_SLIDES } from "../features/landing/slides.js";
import { SignUpLinks } from "../features/landing/LandingPage.js";
import { BackButton } from "../components/ui/BackButton.js";

const TITLE = "Little Meals";
const TAGLINE = "Starting solids, made simpler.";

export const ABOUT_FEATURES = [
  { emoji: "🧊", name: "Storage", text: "track what you prepped and when to use it by." },
  { emoji: "🍎", name: "Foods and recipes", text: "iron- and vitamin C-rich foods, with prep by age." },
  { emoji: "🪜", name: "Allergens", text: "introduce the top 9 and keep them in rotation." },
  { emoji: "🍽️", name: "Meal log", text: "what your baby ate, how it went, and any reactions." },
  { emoji: "🗓️", name: "Meal Plan", text: "plan the week ahead, then serve in one tap." },
  { emoji: "🛟", name: "Learn", text: "safety guides you can read offline, How-To Guides, and Symptom Check." },
] as const;

export const ABOUT_STORY = [
  "When my baby started solids, I tried a few apps, but none had quite what I needed. I kept losing track of what I’d prepped and how long it would last. I wanted to make sure my baby got enough iron and vitamin C. I also needed help introducing allergens, then keeping them in the rotation.",
  "Parents already juggle so much. I hope Little Meals makes this part a little easier, with tools and resources to guide you along the way.",
] as const;

/**
 * Ledger 1052: the landing's glows, one pair per screen down the page: the
 * intro's (sea behind the logo, apricot low right), then sea left and apricot
 * right, alternating. Each is drawn as the landing draws it (`circle at x% y%`,
 * gone at 55% / 50% of the farthest corner of ONE screen), but on one ground
 * the page's height, so no screen's edge cuts a glow.
 */
const SCREENS = [LANDING_SLIDES[0]!.glow, { sea: "10% 28%", apricot: "85% 60%" }] as const;
// ponytail: 6 screens of glow; a page taller than that (very large text) ends on the bare page color.
const SCREEN_COUNT = 6;

function glowLayer(token: "sea" | "apricot", at: string, screen: number): string {
  const [x, y] = at.split(" ").map((part) => Number.parseFloat(part)) as [number, number];
  const radius = `calc(${token === "sea" ? 0.55 : 0.5} * hypot(${Math.max(x, 100 - x)}vw, ${Math.max(y, 100 - y)}svh))`;
  return `radial-gradient(circle ${radius} at ${x}% ${screen * 100 + y}svh, var(--color-landing-glow-${token}), transparent)`;
}

export const ABOUT_GLOWS = Array.from({ length: SCREEN_COUNT }, (_, screen) => {
  const glow = SCREENS[screen % 2]!;
  return `${glowLayer("sea", glow.sea, screen)}, ${glowLayer("apricot", glow.apricot, screen)}`;
}).join(", ");

const CARD = "glass-card flex flex-col rounded-[var(--radius-lg)] px-5 py-[1.375rem]";
const CARD_HEADING = { fontFamily: "var(--font-family-display)", fontSize: "1.4375rem", lineHeight: 1.15 } as const;

/**
 * Item 611 / ledger 1052: what the app is, then why it exists, in the
 * landing's look. Public: a signed-out visitor comes from the landing and
 * gets a back chevron to it plus the landing's two ways in; a signed-in
 * parent comes from More and gets a back chevron there, no buttons. Until the
 * session is known, neither (a signed-in reload must not flash "Create an
 * account"); the chevron's space is kept.
 */
export function AboutPage() {
  const { data: session, isPending } = useSession();
  const signedOut = !isPending && !session;

  return (
    // OutsideAppLayout clears the iOS status bar (ledger 851); the glows run
    // up under that clearance and across the whole width, behind the column.
    <div className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 bg-[var(--color-bg)]"
        style={{ top: "calc(-1 * (env(safe-area-inset-top) + var(--top-edge-clearance)))", backgroundImage: ABOUT_GLOWS }}
      />
      <div className="relative mx-auto flex max-w-lg flex-col gap-6 px-6 pt-4 pb-8">
        <div className="relative flex flex-col items-center gap-4 pt-9 text-center">
          {session || signedOut ? (
            // Ledger 992: an installed app has no browser Back.
            <div className="absolute top-0 left-0">
              <BackButton fallback={session ? "/more" : "/"} />
            </div>
          ) : null}
          {/* Decorative: the h1 names it. */}
          <img
            src="/icons/icon-512.png"
            alt=""
            width={88}
            height={88}
            className="h-22 w-22 rounded-[22px]"
            style={{ boxShadow: "var(--shadow-landing-icon)" }}
          />
          <div className="flex flex-col items-center gap-2">
            <h1 className="font-display text-[var(--color-text)]" style={{ fontSize: "2.5rem", lineHeight: 1.05, letterSpacing: "-0.5px" }}>
              {TITLE}
            </h1>
            <p className="text-[1.0625rem] font-semibold text-[var(--color-accent)]">{TAGLINE}</p>
          </div>
          {signedOut ? (
            <div className="mt-2 flex w-full flex-col items-center">
              <SignUpLinks />
            </div>
          ) : null}
        </div>

        <section aria-labelledby="about-features" className={`${CARD} gap-3.5`}>
          <h2 id="about-features" className="font-h2 text-[var(--color-text)]" style={CARD_HEADING}>
            Features
          </h2>
          <ul className="flex flex-col gap-3">
            {ABOUT_FEATURES.map((feature) => (
              <li key={feature.name} className="flex gap-3 text-[0.9375rem] leading-normal text-[var(--color-text)]">
                <span aria-hidden="true" className="text-xl leading-[1.2]">
                  {feature.emoji}
                </span>
                <span>
                  <strong className="font-semibold">{feature.name}:</strong> {feature.text}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="about-story" className={`${CARD} gap-3`}>
          <h2 id="about-story" className="font-h2 text-[var(--color-text)]" style={CARD_HEADING}>
            From one parent to another
          </h2>
          {ABOUT_STORY.map((paragraph) => (
            <p key={paragraph} className="text-[0.9375rem] leading-[1.55] text-[var(--color-text)]">
              {paragraph}
            </p>
          ))}
        </section>

        <p className="px-3 text-center text-[0.8125rem] leading-normal italic text-[var(--color-landing-muted)]">{DISCLAIMER}</p>
      </div>
    </div>
  );
}
