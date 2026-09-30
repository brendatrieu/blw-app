import { useSession } from "../lib/auth.js";
import { ButtonLink } from "../components/ui/Button.js";
import { Card } from "../components/ui/Card.js";
import { BackButton } from "../components/ui/BackButton.js";
import { PageHeader } from "../components/ui/PageHeader.js";

const TITLE = "Little Meals";
const TAGLINE = "A calm companion for starting solids.";

export const ABOUT_FEATURES = [
  { emoji: "🧊", name: "Storage", text: "what you prepped, where it is, and when to use it by." },
  {
    emoji: "🍎",
    name: "Foods and recipes",
    text: "find iron- and vitamin C-rich foods, with safe prep for each age.",
  },
  {
    emoji: "🪜",
    name: "Allergens",
    text: "introduce the top 9 one at a time, then keep serving them.",
  },
  { emoji: "🍽️", name: "Meal log", text: "what your baby ate, how it went, and any reactions." },
  { emoji: "🛟", name: "Learn", text: "choking, allergies, storage and more, readable offline." },
] as const;

/** The two ways in, shown only to a signed-out visitor (top and bottom). */
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
          What it helps with
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
          Why I made this
        </h2>
        <p className="text-sm text-[var(--color-text)]">
          I&rsquo;m a parent too. When we started solids with my own baby, I tried a few apps, but
          none of them had quite what I needed. I kept losing track of when I&rsquo;d made foods and
          how long they&rsquo;d last. I wanted help finding foods rich in iron and vitamin C. And I
          wanted to keep track of introducing allergens, and of keeping them in the rotation once
          they were in.
        </p>
        <p className="text-sm text-[var(--color-text)]">
          We already keep track of so much every day. I hope Little Meals makes this part a little
          easier, with tools and resources to guide you along the way.
        </p>
      </Card>

      <Card
        padding="md"
        as="section"
        aria-labelledby="about-good-to-know"
        className="flex flex-col gap-3"
      >
        <h2 id="about-good-to-know" className="font-h2 text-[var(--color-text)]">
          Good to know
        </h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-[var(--color-text)]">
          <li>Little Meals is educational, not medical advice. Check with your pediatrician.</li>
          <li>Your data is yours. You can export it or delete your account anytime in Settings.</li>
        </ul>
      </Card>

      {signedOut ? <SignUpButtons /> : null}
    </div>
  );
}
