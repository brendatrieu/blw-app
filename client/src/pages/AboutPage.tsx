import { useSession } from "../lib/auth.js";
import { ButtonLink } from "../components/ui/Button.js";
import { Card } from "../components/ui/Card.js";
import { BackButton } from "../components/ui/BackButton.js";
import { PageHeader } from "../components/ui/PageHeader.js";

const TITLE = "Little Meals";
const TAGLINE = "Starting solids, made simpler.";

export const ABOUT_FEATURES = [
  { emoji: "🧊", name: "Storage", text: "track what you prepped and when to use it by." },
  { emoji: "🍎", name: "Foods and recipes", text: "iron- and vitamin C-rich foods, with prep by age." },
  { emoji: "🪜", name: "Allergens", text: "introduce the top 9 and keep them in rotation." },
  { emoji: "🍽️", name: "Meal log", text: "what your baby ate, how it went, and any reactions." },
  { emoji: "🛟", name: "Learn", text: "safety guides you can read offline." },
] as const;

/** The two ways in, shown only to a signed-out visitor, once, at the top. */
function SignUpButtons() {
  return (
    <div className="flex w-full flex-col gap-3">
      <ButtonLink to="/signup" className="text-base">
        Create an account
      </ButtonLink>
      <ButtonLink to="/login" variant="secondary" className="text-base">
        Sign in
      </ButtonLink>
    </div>
  );
}

/**
 * Item 611: what the app is, then why it exists. Public — a signed-out
 * visitor lands here from "/" (RequireAuth); a signed-in parent reaches it
 * from More and gets a back chevron instead of the sign-up buttons.
 */
export function AboutPage() {
  const { data: session, isPending } = useSession();
  // Until the session is known, show neither the sign-up buttons nor the back
  // button: a signed-in parent reloading this page must not see "Create an
  // account" flash first.
  const signedIn = Boolean(session);
  const signedOut = !isPending && !session;

  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col gap-6 p-6">
      {!signedIn ? (
        <div className="flex flex-col items-center gap-4 text-center">
          {/* The home-screen icon above the name (owner, 2026-09-30); decorative — the h1 names it. */}
          <img src="/icons/icon-192.png" alt="" width={72} height={72} className="h-18 w-18 rounded-2xl" />
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-[var(--color-text)]">{TITLE}</h1>
            <p className="text-sm text-[var(--color-text-muted)]">{TAGLINE}</p>
          </div>
          {signedOut ? <SignUpButtons /> : null}
        </div>
      ) : (
        <PageHeader title={TITLE} description={TAGLINE} leading={<BackButton fallback="/more" />} />
      )}

      <Card
        padding="md"
        as="section"
        aria-labelledby="about-features"
        className="flex flex-col gap-3"
      >
        <h2 id="about-features" className="font-h2 text-[var(--color-text)]">
          Features
        </h2>
        <ul className="flex flex-col gap-3">
          {ABOUT_FEATURES.map((feature) => (
            <li key={feature.name} className="flex gap-3 text-sm text-[var(--color-text)]">
              <span aria-hidden="true" className="text-xl leading-none">
                {feature.emoji}
              </span>
              <span>
                <strong>{feature.name}:</strong> {feature.text}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card padding="md" as="section" aria-labelledby="about-story" className="flex flex-col gap-3">
        <h2 id="about-story" className="font-h2 text-[var(--color-text)]">
          From one parent to another
        </h2>
        <p className="text-sm text-[var(--color-text)]">
          When my baby started solids, I tried a few apps, but none had quite what I needed. I kept
          losing track of what I&rsquo;d prepped and how long it would last. I wanted to make sure my
          baby got enough iron and vitamin C. I also needed help introducing allergens, then keeping
          them in the rotation.
        </p>
        <p className="text-sm text-[var(--color-text)]">
          Parents already juggle so much. I hope Little Meals makes this part a little easier, with
          tools and resources to guide you along the way.
        </p>
      </Card>

      <p className="text-xs italic text-[var(--color-text-muted)]">
        Little Meals is educational, not medical advice. Consult your pediatrician.
      </p>
    </div>
  );
}
